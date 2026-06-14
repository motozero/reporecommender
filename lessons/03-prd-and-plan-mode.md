# Lesson 3: PRD and plan mode

![Plan mode is read-only exploration and a proposal you approve, then build mode writes, commits, and deploys](./assets/plan-vs-build-handdrawn.png)

**What it is.** Plan mode lets Claude Code explore the codebase read-only and propose an
implementation plan that you approve before it writes a single line. The PRD (a short product
requirements note) is the "what." Plan mode is where the "how" gets agreed. Build mode is where it
gets executed.

**How we used it here.** This entire project started in plan mode. We did not write code first. We
wrote the plan, then iterated it several times: the demo framing, the decision to make the lesson book
a real deliverable, the curriculum order, the "one engine, two surfaces" architecture. Only after the
plan was approved did we exit to build mode and start scaffolding.

**Why.** Alignment before code is cheap. Rework after code is expensive. Plan mode is where you catch
a wrong approach in two minutes instead of two hours. For a team standardizing on Claude Code, it is
the difference between an agent that guesses and an agent that gets sign-off.

**Result.** By the time we left plan mode, the architecture, the lesson curriculum, and the day's
build sequence were locked. The build then moved fast precisely because the decisions were already
made. Every reversal we would have hit later got handled while it was still just text.

**How to use it.**

1. Enter plan mode for anything non-trivial (`EnterPlanMode`, or your client's equivalent).
2. Let it explore and ask clarifying questions. Answer them.
3. Read the plan it writes. Approve it, or redirect and have it revise.
4. Exit to build mode only when the plan is something you would defend.

**Gotchas.**

- Do not approve a vague plan. The plan file is the contract for what gets built.
- Keep the PRD-level "what" separate from the "how," so you can change the implementation later
  without relitigating the goal.
- Plan mode is read-only. If the agent needs to run something that writes, that belongs in build mode
  after approval.
