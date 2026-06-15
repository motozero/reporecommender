// Eval runner. Runs every case in dataset.jsonl through the real engine, applies
// the scorers, and prints a scorecard.
//
//   npm run eval              run all cases (uses cached engine results if present)
//   npm run eval -- --fresh   ignore the cache and call the engine again
//   npm run eval -- --no-judge   skip the LLM-judge scorer (free + offline)
//   npm run eval -- --ci      exit non-zero if a metric falls below threshold
//
// Engine results are cached under evals/.cache so re-running to iterate on
// scorers or the scorecard costs nothing. Pass --fresh after changing a prompt.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { recommend, type RecommendResult } from "../src/engine.ts";
import {
  STRUCTURAL,
  recall,
  judgeFit,
  type EvalCase,
  type Score,
} from "./scorers.ts";

// Paths are anchored to the repo root (npm runs scripts from there) so they hold
// regardless of where the bundled runner lands (dist/eval.mjs).
const ROOT = process.cwd();
const EVALS = join(ROOT, "evals");
const CACHE = join(EVALS, ".cache");

const argv = process.argv.slice(2);
const FRESH = argv.includes("--fresh");
const NO_JUDGE = argv.includes("--no-judge");
const CI = argv.includes("--ci");

// Pass marks: structural is a hard contract; recall and judge are quality bars
// we want to raise over time. --ci enforces them.
const THRESHOLDS = { structural: 1.0, recall: 0.6, judge: 0.6 };

interface CaseReport {
  id: string;
  note?: string;
  error?: string;
  structural: number;
  recall: Score & { covered: number; total: number };
  judge?: Score;
}

function loadEnv(): { ANTHROPIC_API_KEY: string; GITHUB_TOKEN?: string } {
  const path = join(ROOT, ".dev.vars");
  if (!existsSync(path)) {
    console.error("Missing .dev.vars. Run: bash scripts/set-dev-vars.sh");
    process.exit(1);
  }
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] && !line.trimStart().startsWith("#")) env[m[1]] = m[2]!.trim();
  }
  if (!env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set in .dev.vars");
    process.exit(1);
  }
  return { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GITHUB_TOKEN: env.GITHUB_TOKEN || undefined };
}

function loadCases(): EvalCase[] {
  const path = join(EVALS, "dataset.jsonl");
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as EvalCase);
}

// Cache the engine result per case so iterating on scorers is free. Keyed by
// input+goal so editing a case invalidates its cache automatically.
function cached(c: EvalCase): RecommendResult | null {
  const f = join(CACHE, `${c.id}.json`);
  if (FRESH || !existsSync(f)) return null;
  try {
    const blob = JSON.parse(readFileSync(f, "utf8"));
    if (blob.input === c.input && blob.goal === c.goal) return blob.result as RecommendResult;
  } catch {
    /* fall through to a fresh run */
  }
  return null;
}

function save(c: EvalCase, result: RecommendResult): void {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  writeFileSync(join(CACHE, `${c.id}.json`), JSON.stringify({ input: c.input, goal: c.goal, result }, null, 2));
}

function avg(ns: number[]): number {
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
}

const pct = (n: number): string => `${Math.round(n * 100)}%`.padStart(4);

async function runCase(c: EvalCase, env: ReturnType<typeof loadEnv>): Promise<CaseReport> {
  process.stdout.write(`  ${c.id.padEnd(20)} `);
  let result = cached(c);
  const fromCache = result !== null;
  try {
    if (!result) {
      result = await recommend(c.input, c.goal, env);
      save(c, result);
    }
  } catch (err) {
    console.log("ERROR");
    return {
      id: c.id,
      note: c.note,
      error: err instanceof Error ? err.message : String(err),
      structural: 0,
      recall: { score: 0, covered: 0, total: c.concepts.length, detail: "engine threw" },
    };
  }

  const structural = avg(STRUCTURAL.map((s) => s(c, result!).score));
  const rec = recall(c, result);
  const judge = NO_JUDGE ? undefined : await judgeFit(c, result, env.ANTHROPIC_API_KEY);

  console.log(
    `${fromCache ? "cached" : "live  "}  struct ${pct(structural)}  recall ${pct(rec.score)}` +
      (judge ? `  judge ${pct(judge.score)}` : ""),
  );
  return { id: c.id, note: c.note, structural, recall: rec, judge };
}

function printScorecard(reports: CaseReport[]): void {
  const line = "-".repeat(72);
  console.log(`\n${line}\n  SCORECARD\n${line}`);
  console.log(`  ${"case".padEnd(20)} ${"struct".padEnd(7)} ${"recall".padEnd(14)} judge`);
  console.log(`  ${"-".repeat(20)} ${"-".repeat(7)} ${"-".repeat(14)} ${"-".repeat(11)}`);
  for (const r of reports) {
    const recallCol = `${pct(r.recall.score)} (${r.recall.covered}/${r.recall.total})`.padEnd(14);
    const judgeCol = r.judge ? r.judge.detail : "skipped";
    console.log(`  ${r.id.padEnd(20)} ${pct(r.structural).padEnd(7)} ${recallCol} ${judgeCol}`);
  }

  // Per-case detail: why recall missed, and any structural failure.
  const notes = reports.filter((r) => r.error || r.recall.score < 1 || r.structural < 1);
  if (notes.length) {
    console.log(`\n  details`);
    for (const r of notes) {
      if (r.error) console.log(`  - ${r.id}: ERROR ${r.error}`);
      else console.log(`  - ${r.id}: ${r.recall.detail}${r.structural < 1 ? " | structural FAIL" : ""}`);
    }
  }

  const agg = {
    structural: avg(reports.map((r) => r.structural)),
    recall: avg(reports.map((r) => r.recall.score)),
    judge: avg(reports.filter((r) => r.judge).map((r) => r.judge!.score)),
  };
  console.log(`\n${line}`);
  console.log(
    `  AGGREGATE   structural ${pct(agg.structural)}   recall ${pct(agg.recall)}` +
      (NO_JUDGE ? "" : `   judge ${pct(agg.judge)}`),
  );
  console.log(`  ${reports.length} cases${NO_JUDGE ? "" : ""}`);
  console.log(line);

  if (CI) {
    const fails: string[] = [];
    if (agg.structural < THRESHOLDS.structural) fails.push(`structural ${pct(agg.structural)} < ${pct(THRESHOLDS.structural)}`);
    if (agg.recall < THRESHOLDS.recall) fails.push(`recall ${pct(agg.recall)} < ${pct(THRESHOLDS.recall)}`);
    if (!NO_JUDGE && agg.judge < THRESHOLDS.judge) fails.push(`judge ${pct(agg.judge)} < ${pct(THRESHOLDS.judge)}`);
    if (fails.length) {
      console.log(`\n  CI FAIL: ${fails.join("; ")}`);
      process.exit(1);
    }
    console.log(`\n  CI PASS`);
  }
}

async function main() {
  const env = loadEnv();
  const cases = loadCases();
  console.log(`\nRunning ${cases.length} eval cases${FRESH ? " (fresh)" : ""}${NO_JUDGE ? " (no judge)" : ""}:\n`);
  const reports: CaseReport[] = [];
  for (const c of cases) reports.push(await runCase(c, env)); // sequential keeps logs readable and rate limits happy
  printScorecard(reports);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
