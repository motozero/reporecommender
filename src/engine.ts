// The shared recommendation engine. This is the ONLY place the recommendation
// logic lives. Both surfaces (the Web API in index.ts and the MCP server in
// mcp.ts) call recommend() and just shape the result.

import { parseRepo, getRepo, getReadme, searchRepos, type RepoMeta } from "./github";
import { callClaude, extractJson, MODELS } from "./claude";

export interface EngineEnv {
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN?: string;
}

export interface Recommendation {
  fullName: string;
  url: string;
  stars: number;
  language: string | null;
  whyItFits: string;
  ratings: { easeOfUse: number; impact: number };
}

export interface RecommendResult {
  source: { fullName: string; purpose: string; stack: string[] };
  goal: string;
  recommendations: Recommendation[];
}

interface Analysis {
  purpose: string;
  stack: string[];
  searchQueries: string[];
}

export async function recommend(
  repoUrl: string,
  goal: string,
  env: EngineEnv,
): Promise<RecommendResult> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) {
    throw new Error("Could not find a GitHub repo in that input. Use a URL or owner/repo.");
  }

  const token = env.GITHUB_TOKEN || undefined;
  const meta = await getRepo(parsed.owner, parsed.repo, token);
  const readme = await getReadme(parsed.owner, parsed.repo, token);

  // Step 1 (Haiku): cheap extraction of purpose, stack, and a search query.
  const analysis = await analyze(meta, readme, goal, env.ANTHROPIC_API_KEY);

  // Step 2: gather complement candidates from several canonical queries, then
  // rank by stars so the well-known tools surface, not just literal matches.
  const candidates = await gatherCandidates(analysis, goal, meta, token);

  const source = { fullName: meta.fullName, purpose: analysis.purpose, stack: analysis.stack };
  if (candidates.length === 0) return { source, goal, recommendations: [] };

  // Step 3 (Sonnet): rank and write the per-repo rationale + ratings.
  const recommendations = await curate(meta, analysis, goal, candidates, env.ANTHROPIC_API_KEY);
  return { source, goal, recommendations };
}

async function analyze(
  meta: RepoMeta,
  readme: string,
  goal: string,
  apiKey: string,
): Promise<Analysis> {
  const system = "You analyze a GitHub repo and return strict JSON only. No prose, no code fences.";
  const user = [
    `Repo: ${meta.fullName}`,
    `Description: ${meta.description ?? "(none)"}`,
    `Primary language: ${meta.language ?? "(unknown)"}`,
    `Topics: ${meta.topics.join(", ") || "(none)"}`,
    "",
    "README excerpt:",
    readme.slice(0, 4000) || "(no README)",
    "",
    `The user wants to improve this project with: "${goal}".`,
    "",
    "Return JSON with exactly these keys:",
    '{"purpose": "one or two sentences on what this repo does",',
    ' "stack": ["key languages, frameworks, runtimes"],',
    ' "searchQueries": ["2 or 3 SHORT GitHub search queries (each 1 to 3 words, optionally one qualifier like language:) that surface repos COMPLEMENTING this project for the goal. Use the canonical terms practitioners use, for example: task queue, job scheduler, celery. GitHub ANDs every word, so keep each query short."]}',
  ].join("\n");
  const text = await callClaude({ apiKey, model: MODELS.haiku, system, user, maxTokens: 500 });
  const parsed = extractJson<{ purpose: string; stack?: string[]; searchQueries?: string[] | string }>(text);
  const searchQueries = Array.isArray(parsed.searchQueries)
    ? parsed.searchQueries
    : [String(parsed.searchQueries ?? "")].filter(Boolean);
  return { purpose: parsed.purpose, stack: parsed.stack ?? [], searchQueries };
}

async function curate(
  meta: RepoMeta,
  analysis: Analysis,
  goal: string,
  candidates: RepoMeta[],
  apiKey: string,
): Promise<Recommendation[]> {
  const list = candidates
    .map((c, i) => `${i + 1}. ${c.fullName} | ${c.stars} stars | ${c.language ?? "?"} | ${c.description ?? ""}`)
    .join("\n");
  const system = [
    "You are a precise engineering advisor. Recommend repos that genuinely complement the project.",
    "Write in a direct, concrete style. No em dashes. No marketing language.",
    "Return strict JSON only, no prose, no code fences.",
  ].join(" ");
  const user = [
    `The user's project: ${meta.fullName}`,
    `What it does: ${analysis.purpose}`,
    `Stack: ${analysis.stack.join(", ")}`,
    `Their goal: "${goal}"`,
    "",
    "Candidate repos:",
    list,
    "",
    "Choose the 3 to 5 best complements. For each return an object:",
    '{"fullName": "owner/repo exactly as listed",',
    ' "whyItFits": "2 to 3 sentences, specific to THIS project and goal, no em dashes",',
    ' "easeOfUse": integer 1 to 5,',
    ' "impact": integer 1 to 5 for how much it advances the goal}',
    "",
    'Return JSON shaped as {"recommendations": [ ... ]}.',
  ].join("\n");
  const text = await callClaude({ apiKey, model: MODELS.sonnet, system, user, maxTokens: 1500 });
  const parsed = extractJson<{
    recommendations: { fullName: string; whyItFits: string; easeOfUse: number; impact: number }[];
  }>(text);

  const byName = new Map(candidates.map((c) => [c.fullName.toLowerCase(), c]));
  const out: Recommendation[] = [];
  for (const r of parsed.recommendations ?? []) {
    const cand = byName.get((r.fullName ?? "").toLowerCase());
    if (!cand) continue;
    out.push({
      fullName: cand.fullName,
      url: cand.url,
      stars: cand.stars,
      language: cand.language,
      whyItFits: r.whyItFits,
      ratings: { easeOfUse: clamp(r.easeOfUse), impact: clamp(r.impact) },
    });
  }
  return out;
}

// Run several short queries (the model's canonical terms plus goal-based
// fallbacks), merge and dedupe, then rank by stars so the well-known tools
// surface. GitHub ANDs every word, so breadth across queries beats one long one.
async function gatherCandidates(
  analysis: Analysis,
  goal: string,
  meta: RepoMeta,
  token?: string,
): Promise<RepoMeta[]> {
  const lang = meta.language ? `language:${meta.language}` : "";
  const goalWords = goal.replace(/[^\w\s]/g, " ").trim();
  const queries = [
    ...analysis.searchQueries.slice(0, 3),
    [goalWords, lang].filter(Boolean).join(" "),
    goalWords,
  ];

  const merged = new Map<string, RepoMeta>();
  const seenQuery = new Set<string>();
  for (const raw of queries) {
    const q = (raw ?? "").trim();
    if (!q || seenQuery.has(q)) continue;
    seenQuery.add(q);
    if (seenQuery.size > 4) break; // cap GitHub search calls per request
    let hits: RepoMeta[] = [];
    try {
      hits = await searchRepos(q, token, 8, meta.fullName);
    } catch {
      continue; // a bad query should not sink the whole request
    }
    for (const h of hits) {
      const key = h.fullName.toLowerCase();
      if (!merged.has(key)) merged.set(key, h);
    }
    if (merged.size >= 12) break;
  }

  return [...merged.values()].sort((a, b) => b.stars - a.stars).slice(0, 12);
}

function clamp(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}
