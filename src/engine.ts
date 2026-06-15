// The shared recommendation engine. This is the ONLY place the recommendation
// logic lives. Both surfaces (the Web API in index.ts and the MCP server in
// mcp.ts) call recommend() and just shape the result.
//
// The input can be a GitHub repo (URL or owner/repo) OR a website URL. Either
// way we produce an Analysis (purpose, stack, search queries), then run the same
// GitHub search and ranking. Recommendations are always GitHub repos.

import {
  parseRepo,
  getRepo,
  getReadme,
  searchRepos,
  getContributorCount,
  getCommitsSince,
  type RepoMeta,
} from "./github";
import { callClaude, extractJson, MODELS } from "./claude";

export interface EngineEnv {
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN?: string;
}

export interface Recommendation {
  fullName: string;
  url: string;
  stars: number;
  forks: number;
  language: string | null;
  lastUpdated: string | null; // ISO date of last push
  contributors: number | null; // null when GitHub did not return it
  velocity90d: number | null; // commits in the last 90 days
  whatIsIt: string;
  why: string;
  how: string;
  ratings: { easeOfUse: number; impact: number };
}

export interface RecommendResult {
  source: { fullName: string; kind: "repo" | "website"; purpose: string; stack: string[] };
  goal: string;
  recommendations: Recommendation[];
}

interface Analysis {
  purpose: string;
  stack: string[];
  searchQueries: string[];
}

interface SourceContext extends Analysis {
  fullName: string;
  kind: "repo" | "website";
  langHint?: string;
  exclude?: string;
}

export async function recommend(
  input: string,
  goal: string,
  env: EngineEnv,
): Promise<RecommendResult> {
  const key = env.ANTHROPIC_API_KEY;
  const token = env.GITHUB_TOKEN || undefined;

  const ctx = await analyzeSource(input, goal, key, token);
  const source = { fullName: ctx.fullName, kind: ctx.kind, purpose: ctx.purpose, stack: ctx.stack };

  const candidates = await gatherCandidates(ctx, goal, token);
  if (candidates.length === 0) return { source, goal, recommendations: [] };

  const recommendations = await curate(ctx, goal, candidates, key);
  // Objective metrics come straight from GitHub, only for the final picks, to
  // keep the per-request call count small.
  await enrichMetrics(recommendations, token);
  return { source, goal, recommendations };
}

// Step 1: figure out what the input is (repo or website) and extract purpose,
// stack, and search queries with Haiku.
async function analyzeSource(
  input: string,
  goal: string,
  key: string,
  token?: string,
): Promise<SourceContext> {
  const repo = parseRepo(input);
  if (repo) {
    const meta = await getRepo(repo.owner, repo.repo, token);
    const readme = await getReadme(repo.owner, repo.repo, token);
    const analysis = await analyzeRepo(meta, readme, goal, key);
    return {
      ...analysis,
      fullName: meta.fullName,
      kind: "repo",
      langHint: meta.language ?? undefined,
      exclude: meta.fullName,
    };
  }

  if (looksLikeUrl(input)) {
    const site = await fetchSite(input);
    const analysis = await analyzeSite(site, goal, key);
    return { ...analysis, fullName: site.host, kind: "website" };
  }

  throw new Error("Enter a GitHub repo (URL or owner/repo) or a website URL.");
}

async function analyzeRepo(
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
    jsonInstruction("what this repo does"),
  ].join("\n");
  return parseAnalysis(await callClaude({ apiKey, model: MODELS.haiku, system, user, maxTokens: 500 }));
}

async function analyzeSite(
  site: { host: string; title: string; text: string },
  goal: string,
  apiKey: string,
): Promise<Analysis> {
  const system = "You analyze a website and return strict JSON only. No prose, no code fences.";
  const user = [
    `Website: ${site.host}`,
    `Title: ${site.title || "(none)"}`,
    "",
    "Page content (text excerpt):",
    site.text.slice(0, 4000) || "(no readable content)",
    "",
    `The user wants to add or improve: "${goal}".`,
    "",
    jsonInstruction("what this site or project is"),
  ].join("\n");
  return parseAnalysis(await callClaude({ apiKey, model: MODELS.haiku, system, user, maxTokens: 500 }));
}

function jsonInstruction(purposeHint: string): string {
  return [
    "Return JSON with exactly these keys:",
    `{"purpose": "one or two sentences on ${purposeHint}",`,
    ' "stack": ["key languages, frameworks, or themes; best guess is fine"],',
    ' "searchQueries": ["2 or 3 SHORT GitHub search queries (each 1 to 3 words, optionally one qualifier like language:) for repos that would help BUILD the user\'s goal. Use the canonical terms practitioners use, for example: rag, vector database, chatbot. GitHub ANDs every word, so keep each query short."]}',
  ].join("\n");
}

function parseAnalysis(text: string): Analysis {
  const parsed = extractJson<{ purpose: string; stack?: string[]; searchQueries?: string[] | string }>(text);
  const searchQueries = Array.isArray(parsed.searchQueries)
    ? parsed.searchQueries
    : [String(parsed.searchQueries ?? "")].filter(Boolean);
  return { purpose: parsed.purpose, stack: parsed.stack ?? [], searchQueries };
}

// Step 2: gather complement candidates from several canonical queries, then rank
// by stars so the well-known tools surface. GitHub ANDs every word, so breadth
// across short queries beats one long query.
async function gatherCandidates(
  ctx: SourceContext,
  goal: string,
  token?: string,
): Promise<RepoMeta[]> {
  // Constrain searches to the source's ecosystem so GitHub returns complements a
  // developer on this stack can actually install. A TypeScript app cannot
  // `npm install` a Rust crate.
  const allowed = ecosystemLanguages(ctx.langHint);
  const ecoLangs = allowed ? [...allowed] : [];
  const goalWords = goal.replace(/[^\w\s]/g, " ").trim();

  // Goal searches, one per ecosystem language, so the canonical tools for each
  // language in the stack surface. The JS/TS ecosystem spans two GitHub language
  // tags, so a TypeScript project searches both: a single `language:` would drop
  // the other half (e.g. zustand is tagged TypeScript, next-auth too, while many
  // older libs are tagged JavaScript). An unknown source language (a website)
  // falls back to one bare query.
  const goalQueries = ecoLangs.length ? ecoLangs.map((l) => `${goalWords} language:"${l}"`) : [goalWords];

  // Keyword searches from the analysis step. We only narrow these by language
  // for a single-language ecosystem; for JS/TS we leave them broad and let the
  // post-filter below remove any off-ecosystem strays.
  const singleLangQ = allowed && allowed.size === 1 && ctx.langHint ? `language:"${ctx.langHint}"` : "";
  const keywordQueries = ctx.searchQueries.slice(0, 3).map((q) => [q, singleLangQ].filter(Boolean).join(" "));

  // Keyword queries first (the analysis step's canonical terms are the strongest
  // signal), then the per-language goal queries to round out ecosystem coverage.
  const queries = [...keywordQueries, ...goalQueries];

  const merged = new Map<string, RepoMeta>();
  const seenQuery = new Set<string>();
  for (const raw of queries) {
    const q = (raw ?? "").trim();
    if (!q || seenQuery.has(q)) continue;
    seenQuery.add(q);
    if (seenQuery.size > 6) break; // cap GitHub search calls per request
    let hits: RepoMeta[] = [];
    try {
      hits = await searchRepos(q, token, 8, ctx.exclude);
    } catch {
      continue; // a bad query should not sink the whole request
    }
    for (const h of hits) {
      const k = h.fullName.toLowerCase();
      if (!merged.has(k)) merged.set(k, h);
    }
    // No early break on pool size: we want every query (within the call cap) to
    // contribute, then rank the union by stars. Front-loaded queries used to
    // starve later ones that were finding the canonical complements.
  }

  // Safety net: drop anything left outside the source's ecosystem (broad keyword
  // searches can still pull in off-language repos). Keep the filter only if it
  // leaves a usable pool, so a valid request never goes empty.
  const pool = [...merged.values()];
  const inEco = allowed ? pool.filter((r) => r.language && allowed.has(r.language.toLowerCase())) : pool;
  const finalPool = inEco.length >= 3 ? inEco : pool;

  return finalPool.sort((a, b) => b.stars - a.stars).slice(0, 12);
}

// Languages whose tools can realistically be used together. A complement only
// counts if a developer on the source stack can actually adopt it. Returns null
// for an unknown source language (e.g. a website), which means no constraint.
export function ecosystemLanguages(lang?: string | null): Set<string> | null {
  if (!lang) return null;
  const l = lang.toLowerCase();
  const groups: string[][] = [
    ["typescript", "javascript"],
    ["python"],
    ["go"],
    ["rust"],
    ["ruby"],
    ["java", "kotlin", "scala"],
    ["c#", "f#"],
    ["php"],
    ["c++", "c"],
    ["swift", "objective-c"],
    ["elixir", "erlang"],
    ["dart"],
  ];
  const group = groups.find((g) => g.includes(l));
  return new Set(group ?? [l]);
}

// Step 3: rank and write the per-repo rationale + ratings with Sonnet.
async function curate(
  ctx: SourceContext,
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
  const noun = ctx.kind === "website" ? "website" : "project";
  const user = [
    `The user's ${noun}: ${ctx.fullName}`,
    `What it is: ${ctx.purpose}`,
    `Stack or themes: ${ctx.stack.join(", ")}`,
    `Their goal: "${goal}"`,
    "",
    "Candidate repos:",
    list,
    "",
    "Choose the 3 to 5 best complements. For each return an object:",
    '{"fullName": "owner/repo exactly as listed",',
    ' "whatIsIt": "one sentence on what this repo is",',
    ` "why": "1 to 2 sentences on why it complements THIS ${noun} and goal, no em dashes",`,
    ' "how": "one sentence on how to integrate it",',
    ' "easeOfUse": integer 1 to 5,',
    ' "impact": integer 1 to 5 for how much it advances the goal}',
    "",
    'Return JSON shaped as {"recommendations": [ ... ]}.',
  ].join("\n");
  const text = await callClaude({ apiKey, model: MODELS.sonnet, system, user, maxTokens: 2200 });
  const parsed = extractJson<{
    recommendations: {
      fullName: string;
      whatIsIt: string;
      why: string;
      how: string;
      easeOfUse: number;
      impact: number;
    }[];
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
      forks: cand.forks,
      language: cand.language,
      lastUpdated: cand.pushedAt,
      contributors: null,
      velocity90d: null,
      whatIsIt: r.whatIsIt,
      why: r.why,
      how: r.how,
      ratings: { easeOfUse: clamp(r.easeOfUse), impact: clamp(r.impact) },
    });
  }
  return out;
}

// Objective metrics straight from GitHub, fetched in parallel for the final
// picks only. Each call degrades to null on rate limits, so the cards still
// render. With a GITHUB_TOKEN set, all of this stays well inside the limits.
async function enrichMetrics(recs: Recommendation[], token?: string): Promise<void> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await Promise.all(
    recs.map(async (r) => {
      const [owner, repo] = r.fullName.split("/");
      if (!owner || !repo) return;
      const [contributors, velocity] = await Promise.all([
        getContributorCount(owner, repo, token),
        getCommitsSince(owner, repo, since, token),
      ]);
      r.contributors = contributors;
      r.velocity90d = velocity;
    }),
  );
}

// Website helpers.

export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return true;
  return /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s);
}

export function normalizeUrl(input: string): string {
  const s = input.trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

async function fetchSite(input: string): Promise<{ host: string; title: string; text: string }> {
  const url = normalizeUrl(input);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "reporecommender (https://reporecommender.com)", Accept: "text/html" },
      redirect: "follow",
    });
  } catch {
    throw new Error("Could not reach that website.");
  }
  if (!res.ok) throw new Error(`Could not fetch that website (${res.status}).`);
  const html = await res.text();
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "").trim();
  const body = htmlToText(html);
  const text = [desc, body].filter(Boolean).join("\n").slice(0, 5000);
  return { host: new URL(url).host.replace(/^www\./, ""), title, text };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function clamp(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}
