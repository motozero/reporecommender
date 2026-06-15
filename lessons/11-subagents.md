# Lesson 11: subagents

**What it is.** A subagent is a separate Claude Code agent spawned to do a scoped task in its own fresh
context, returning only its result to the main thread. Two distinct wins: context isolation (the
subagent's exploration never clutters your main window, see
[lesson 9](./09-context-window.md)) and parallelism (fan out independent work and run it at once).

**Where this build uses it, and why we held it back on purpose.** The core engine did not need
subagents, and we did not force them in. Their worked example is the planned live extension: adding a
Security rating to each recommended repo. We deliberately left security out of the current ease and
impact ratings so that adding it stays a clean, self-contained demo beat rather than a quiet edit. When
it lands, the shape is the textbook subagent pattern:

- One subagent per candidate repo, each on the cheap Haiku tier
  ([lesson 10](./10-model-tiering-and-cost.md)), fetching that repo's security signals (advisories,
  maintenance, age) and returning a single 1 to 5 score.
- All of them in parallel, because the repos are independent. Scoring five sequentially is five times
  the wall-clock of scoring them at once.
- The main thread never sees the messy per-repo research, only the final scores it stitches onto the
  cards. And the commit hook ([lesson 12](./12-hooks.md)) still gates the change, subagents or not.

**Why it works.** Two jobs a single long thread does badly. Isolation: deep research on one repo would
otherwise flood the main context with text nobody needs after the answer; a subagent absorbs that and
hands back the conclusion. Parallelism: independent work should run independently. It also contains
failure, since one candidate's scoring can go wrong in its own context without derailing the rest.

**How to use it.**

1. Reach for a subagent when a task is self-contained and its working notes do not need to live in the
   main thread.
2. Fan out when the units of work are genuinely independent (one per repo, one per file, one per
   question), then collect the results.
3. Give each subagent a tight brief and a clear shape for what to return, so the main thread gets data,
   not a transcript.
4. Pair it with model tiering: a cheap model is often enough for a narrow task run many times over.

**Gotchas.**

- A subagent starts fresh, so it does not see your conversation. Everything it needs goes in the brief.
- Do not fan out work that is actually sequential or shares state. Parallelism only helps when the units
  are independent.
- Returning a wall of prose defeats the point. Have the subagent return a small, structured result the
  main thread can use directly.
