// Scorers (a.k.a. graders) grade ONE engine result against ONE eval case.
//
// The engine is an LLM pipeline, so two runs on the same input can return
// different, equally-correct answers. That means we cannot assert equality the
// way a unit test does. Instead each scorer returns a graded score in [0, 1]
// plus a human-readable detail, and the runner aggregates those into a
// scorecard we can watch move as we tune prompts.
//
// Scorers come in a spectrum from cheap to expensive:
//   1. structural  - deterministic checks on shape, ranges, house style. Free.
//   2. recall      - did the repos we labelled as relevant actually surface?
//   3. judge        - an LLM reads a rubric and rates whether the reasoning holds.
// Always run the cheap ones; they catch the dumb regressions for free.

import type { RecommendResult } from "../src/engine.ts";
import { callClaude, extractJson, MODELS } from "../src/claude.ts";

export interface Concept {
  name: string;
  // The concept is "covered" if ANY of these repos shows up. Alternatives like
  // celery / rq / dramatiq all satisfy "task queue", so we group them.
  anyOf: string[];
}

export interface EvalCase {
  id: string;
  input: string;
  goal: string;
  note?: string;
  concepts: Concept[];
  avoid?: string[];
}

export interface Score {
  score: number; // [0, 1], higher is better
  detail: string; // one line shown in the scorecard / failure log
}

const fullNames = (r: RecommendResult): string[] =>
  r.recommendations.map((x) => x.fullName.toLowerCase());

const has = (names: string[], target: string): boolean =>
  names.includes(target.toLowerCase());

// ---------------------------------------------------------------------------
// 1. Structural scorers (deterministic, no network, no model). These encode the
// contract the engine promises (see src/engine.ts and CLAUDE.md). If one of
// these ever drops below 1.0 it is a real bug, not a matter of taste.
// ---------------------------------------------------------------------------

/** The engine promises 3 to 5 recommendations. */
export function countInRange(_c: EvalCase, r: RecommendResult): Score {
  const n = r.recommendations.length;
  const ok = n >= 3 && n <= 5;
  return { score: ok ? 1 : 0, detail: `${n} recs (want 3-5)` };
}

/** Ratings must be integers in 1..5, and the text fields must be non-empty. */
export function wellFormed(_c: EvalCase, r: RecommendResult): Score {
  const problems: string[] = [];
  for (const rec of r.recommendations) {
    const { easeOfUse, impact } = rec.ratings;
    for (const [label, v] of [["ease", easeOfUse], ["impact", impact]] as const) {
      if (!Number.isInteger(v) || v < 1 || v > 5) problems.push(`${rec.fullName} ${label}=${v}`);
    }
    if (!rec.whatIsIt?.trim() || !rec.why?.trim() || !rec.how?.trim()) {
      problems.push(`${rec.fullName} empty text`);
    }
    if (!/^https?:\/\/github\.com\//i.test(rec.url)) problems.push(`${rec.fullName} bad url`);
  }
  return problems.length
    ? { score: 0, detail: problems.slice(0, 3).join("; ") }
    : { score: 1, detail: "all fields valid" };
}

/** House style (CLAUDE.md): no em dashes or "--" in any user-facing copy. */
export function houseStyle(_c: EvalCase, r: RecommendResult): Score {
  const offenders = r.recommendations
    .filter((rec) => /[—–]|--/.test(`${rec.whatIsIt} ${rec.why} ${rec.how}`))
    .map((rec) => rec.fullName);
  return offenders.length
    ? { score: 0, detail: `em dash in: ${offenders.join(", ")}` }
    : { score: 1, detail: "clean" };
}

/** Nothing from the case's avoid-list should be recommended. */
export function avoidsBadPicks(c: EvalCase, r: RecommendResult): Score {
  if (!c.avoid?.length) return { score: 1, detail: "n/a" };
  const names = fullNames(r);
  const hits = c.avoid.filter((a) => has(names, a));
  return hits.length ? { score: 0, detail: `recommended: ${hits.join(", ")}` } : { score: 1, detail: "clean" };
}

export const STRUCTURAL = [countInRange, wellFormed, houseStyle, avoidsBadPicks];

// ---------------------------------------------------------------------------
// 2. Reference scorer, concept recall. Of the concepts we labelled as relevant,
// how many did the engine actually surface? This is the number that measures
// the known weak spot: strong on FastAPI + jobs, weak on Hono + auth.
// ---------------------------------------------------------------------------

export function recall(c: EvalCase, r: RecommendResult): Score & { covered: number; total: number } {
  const names = fullNames(r);
  const covered = c.concepts.filter((concept) => concept.anyOf.some((repo) => has(names, repo)));
  const total = c.concepts.length;
  const score = total === 0 ? 1 : covered.length / total;
  const missed = c.concepts.filter((x) => !covered.includes(x)).map((x) => x.name);
  return {
    score,
    covered: covered.length,
    total,
    detail: missed.length ? `missed: ${missed.join(", ")}` : "all concepts covered",
  };
}

// ---------------------------------------------------------------------------
// 3. LLM-as-judge. Recall cannot tell whether the "why" is actually a good
// reason. We hand a model the source, the goal, and each recommendation's
// reasoning, with a rubric, and ask it to rate genuine fit 1..5.
//
// Caveat worth knowing (and worth saying out loud in a review): the engine
// writes the "why" with Sonnet, so judging with Sonnet is partly self-evaluation
// and models tend to favour their own output. JUDGE_MODEL is therefore separate
// from the engine's model and easy to point at a more independent model.
// ---------------------------------------------------------------------------

export const JUDGE_MODEL = MODELS.sonnet;

export async function judgeFit(
  c: EvalCase,
  r: RecommendResult,
  apiKey: string,
): Promise<Score & { perRepo: { fullName: string; score: number; reason: string }[] }> {
  if (r.recommendations.length === 0) {
    return { score: 0, detail: "no recommendations to judge", perRepo: [] };
  }
  const system = [
    "You are a strict evaluator of software recommendations. Score genuine fit, not enthusiasm.",
    "Return strict JSON only, no prose, no code fences.",
  ].join(" ");
  const rubric = [
    "Rubric for each recommendation (1 to 5):",
    "5 = a tool a senior engineer would obviously reach for to achieve the goal, and the reason is specific and correct.",
    "3 = plausibly related but generic, or the reason is vague or partly wrong.",
    "1 = a competitor/substitute for the source rather than a complement, off-goal, or the reason is incorrect.",
  ].join("\n");
  const list = r.recommendations
    .map((rec) => `- ${rec.fullName}: ${rec.why}`)
    .join("\n");
  const user = [
    `Source project or site: ${r.source.fullName}`,
    `What it is: ${r.source.purpose}`,
    `The user's goal: "${c.goal}"`,
    "",
    "Recommendations and their stated reasons:",
    list,
    "",
    rubric,
    "",
    'Return JSON: {"scores": [{"fullName": "...", "score": 1-5, "reason": "short"}]}',
  ].join("\n");

  const text = await callClaude({ apiKey, model: JUDGE_MODEL, system, user, maxTokens: 900, temperature: 0 });
  const parsed = extractJson<{ scores: { fullName: string; score: number; reason: string }[] }>(text);
  const perRepo = (parsed.scores ?? []).map((s) => ({
    fullName: s.fullName,
    score: Math.max(1, Math.min(5, Number(s.score) || 1)),
    reason: s.reason ?? "",
  }));
  if (perRepo.length === 0) return { score: 0, detail: "judge returned nothing", perRepo: [] };
  const avg = perRepo.reduce((sum, s) => sum + s.score, 0) / perRepo.length;
  return {
    score: (avg - 1) / 4, // map 1..5 onto 0..1 so it averages with the other scorers
    detail: `avg fit ${avg.toFixed(1)}/5`,
    perRepo,
  };
}
