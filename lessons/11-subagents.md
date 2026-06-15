# Lesson 11: subagents

**What it is.** A subagent is a separate Claude Code agent spawned to do a scoped task in its own fresh
context, returning only its result to the main thread. Two distinct wins: context isolation (the
subagent's exploration never clutters your main window, see
[lesson 9](./09-context-window.md)) and parallelism (fan out independent work and run it at once).

**Where it fits this project.** The clearest use is the planned live extension: adding a Security rating
to each recommended repo. The shape is a subagent per candidate repo, each one fetching that repo's
signals and scoring it in isolation, all running in parallel, each returning a single rating. The main
thread never sees the messy intermediate research, only the final scores it stitches onto the cards.
Security was deliberately held out of the current ease and impact ratings precisely so this stays a
clean "add it live" beat.

**Why it works.** Two jobs that a single long thread does badly:

- Isolation: deep research on one repo would otherwise flood the main context with text you do not need
  after the answer. A subagent absorbs that and hands back just the conclusion.
- Parallelism: scoring five repos one after another is five times the wall-clock of scoring them at
  once. Independent work should run independently.

It also contains failure: if one candidate's scoring goes wrong, it fails in its own context without
derailing the rest.

**How to use it.**

1. Reach for a subagent when a task is self-contained and its working notes do not need to live in the
   main thread.
2. Fan out when the units of work are independent (one per repo, one per file, one per question), then
   collect the results.
3. Give each subagent a tight brief and a clear shape for what to return, so the main thread gets data,
   not a transcript.
4. Pair it with model tiering ([lesson 10](./10-model-tiering-and-cost.md)): a cheap model is often
   enough for a narrow scoring task run many times over.

**Gotchas.**

- A subagent starts fresh, so it does not see your conversation. Everything it needs goes in the brief.
- Do not fan out work that is actually sequential or shares state. Parallelism only helps when the units
  are genuinely independent.
- Returning a wall of prose defeats the point. Have the subagent return a small, structured result the
  main thread can use directly.
