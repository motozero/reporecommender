# Lesson 18: evals

**What it is.** An eval harness measures the quality of a non-deterministic system over a curated set
of cases. A unit test asserts equality on deterministic code (`add(2, 2) === 4`). The recommender is
an LLM pipeline: run it twice on "FastAPI plus background jobs" and you may get celery and flower one
time, celery and dramatiq the next. Both are correct, so equality is the wrong tool. Evals give you a
graded score over a set, not pass or fail on one run. You change a prompt, re-run, and watch a number
move.

**The three moving parts.**

1. A dataset (the golden set), `evals/dataset.jsonl`. One labelled case per line: an `input`, a
   `goal`, and the `concepts` a good answer should cover. Each concept lists `anyOf` repos, because
   celery, rq, and dramatiq all satisfy "task queue". This file is where your domain knowledge lives,
   and it is the part worth the most care.
2. Scorers, `evals/scorers.ts`. A scorer grades one result and returns a number in 0 to 1. They run
   cheap to expensive:
   - **structural** (deterministic, free): 3 to 5 recommendations, ratings are integers 1 to 5, text
     fields present, URLs valid, no em dashes (the house style from `CLAUDE.md`). If one of these
     drops below 100 percent it is a real bug.
   - **recall** (reference based): of the concepts we labelled relevant, how many actually surfaced.
     This is the number that measures the known weak spot.
   - **judge** (LLM as judge): a model reads the source, the goal, and each recommendation's reason
     against a rubric, and rates genuine fit 1 to 5. It catches quality a regex cannot, like "is this
     a complement or just a competitor".
3. A runner and scorecard, `evals/run.ts`. Runs every case through the real engine, applies every
   scorer, prints the table.

**How we run it.**

```
npm run eval              # all cases, reusing cached engine results
npm run eval -- --fresh   # ignore the cache, call the engine again
npm run eval -- --no-judge   # structural plus recall only, free and offline
npm run eval -- --ci      # exit non-zero if a metric is below threshold
```

The engine makes real Anthropic and GitHub calls, so each run costs a little and is slow. The runner
caches each engine result under `evals/.cache` keyed by input plus goal, so iterating on a scorer or
the scorecard is free. Change a prompt, pass `--fresh`. Node 25 runs the TypeScript directly; we
bundle the runner with esbuild first so its imports resolve.

**What it found the first time we ran it.** This is the whole reason the harness exists. Structural
was 100 percent, but the quality scorers told three different stories:

- **A real bug (`hono-auth`, recall 0, judge 1.8 of 5, both agree).** For a TypeScript Hono project it
  recommended `go-pkgz/auth` (Go) and `emirror-de/axum-gate` (Rust). The engine leaks across
  ecosystems; it does not constrain candidates to the source's language. Highest-value finding.
- **A real weakness (`flask-orm`, recall 0, judge 2.8 of 5).** It surfaced satellites of SQLAlchemy
  (`sqlalchemy-mixins`, `awesome-sqlalchemy`) but never `sqlalchemy/sqlalchemy` itself. Ranking by
  stars should favour the canonical library; niche wrappers won instead.
- **A bug in our own golden set (`express-validation`, recall 0 but judge 4.0 of 5).** The
  disagreement is the tell. It returned `express-validator` and `celebrate`, the idiomatic Express
  answers, and the judge rightly scored them well. Our expected list (zod, joi, yup) was too narrow.
  Recall versus judge caught our labelling error, not an engine error.

**The one rule that matters most.** The cardinal sin of evals is editing the dataset to match whatever
the system outputs. That makes the number go up and means nothing. So we fixed only the case that was
genuinely mislabelled (`express-validator` really is the right answer; omitting it was our mistake) and
left `hono-auth`, `flask-orm`, and the Svelte case failing, because those are real gaps that should
show red. Recall went from 43 to 57 percent, honestly.

**The loop in action: fixing the ecosystem leak.** The scorecard named the next move, so we took it.
The root cause of `hono-auth` was that the GitHub keyword searches ran with no language qualifier, so
the top-starred results were spread across every language. The fix constrains searches and candidates
to the source's ecosystem (a TypeScript app searches TypeScript and JavaScript, a Flask app searches
Python), with a post-filter as a safety net. Re-running told the honest story at each step:

- First attempt fixed `flask-orm` but regressed `react-state` to zero. React is tagged JavaScript on
  GitHub while the canonical state libraries (zustand, redux) are tagged TypeScript, so a single
  `language:JavaScript` qualifier excluded them. The eval caught the regression on the next run.
- The corrected version searches the goal once per ecosystem language. That fixed `hono-auth`
  (0 to 100 percent, and it now returns a full set instead of two thin picks) and held the cases that
  were already passing.

That sequence, change then measure then change again, is the entire point. Without the harness the
React regression ships silently.

**A number is a distribution, not a fact.** The engine runs at temperature 0.2, so the same case scores
differently across runs. `django-realtime` flipped between 100 and 0 percent on back-to-back runs of
identical code, because its one acceptable repo either surfaced or did not. With one trial per case the
aggregate recall wobbled between 57 and 71 percent for the same engine. The fixes that are real survive
the wobble: the leak is gone in every run (a deterministic structural fact), and `hono-auth` passes in
every run. The lesson is to read evals like measurements with error bars. The next iteration of this
harness would run each case several times and report the mean, which is how you tell a real gain from a
lucky run.

**Why this is the high-value work.** The structural scorers protect the contract for free. Recall turns
"the recommender feels weaker on vague goals" into a tracked number with named failing cases. The judge
adds a quality read no assertion could. Together they make a fuzzy product measurable, which is the
prerequisite for improving it on purpose instead of by vibe. The leak fix above is the proof: a vague
feeling ("it recommends weird things sometimes") became a named failing case, a root cause, a fix, and a
verified green run.

**The loop again: canonical ranking.** The next red cases were `flask-orm` and the Svelte case, which
surfaced satellites and tutorials instead of canonical tools. Looking at the raw GitHub results
explained why: searching the goal as a literal phrase ("end to end testing") returns whatever repos
contain those exact words, and a 60,000-star interview-questions list outranks Playwright, which does
not put that phrase in its description. So star-sorted search was being poisoned by non-tools, and the
ranker was over-favouring niche framework-specific repos. The fix was two parts: a deterministic filter
that drops learning material and lists (`looksLikeNonTool`, unit-tested in lesson 17), and a curation
nudge telling the model to prefer established, widely adopted tools over tutorials. Re-running, the
Svelte case went from recommending tutorials to leading with TestCafe and Nightwatch, and aggregate
recall moved to 86 to 100 percent across runs.

That re-run also exposed two of our own labels as too strict, the same `express-validator` lesson
again: `flask-sqlalchemy` is the idiomatic Flask ORM (not a lesser answer than raw SQLAlchemy), and any
established e2e framework is a correct answer, not only Playwright and Cypress. We widened those
concepts. The discipline is the same as before: we widen a label only when a domain expert would call
the surfaced answer genuinely correct, never just to turn a cell green. `django-realtime` stays the
honest hard case, its single acceptable repo flips with the temperature noise.

**Gotchas.**

- Use a judge model that is at least separate from the generator, and say the caveat out loud: the
  engine writes the reason with Sonnet, so judging with Sonnet is partly self-evaluation, and models
  tend to favour their own output. `JUDGE_MODEL` in `scorers.ts` is the single place to point it at a
  more independent model.
- Keep the judge at temperature 0 so the score is reproducible run to run.
- A small honest set beats a big sloppy one. Seven labelled cases that you trust are worth more than
  fifty you do not, because a wrong label silently corrupts the metric.
- Recall is only as good as the golden set. When recall and the judge disagree, suspect your labels
  before you blame the engine.
