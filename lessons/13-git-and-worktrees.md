# Lesson 13: git and worktrees

**What it is.** Claude Code works in git the way a disciplined engineer does: small atomic commits, a
readable history, branches, and pull requests. Worktrees go one step further, they let you run work in
isolated copies of the repo so one task cannot break another, and so several agents can build in
parallel without colliding.

**How we used it here.** Every step today was its own atomic commit: step zero, the governance layer,
the GitHub layer, the engine, the frontend, website support, the richer cards, the MCP server, and
each lesson. The history reads top to bottom as the story of the build. Anyone can run `git log` and
follow exactly how Repo Recommender was made, one reviewable change at a time.

**Worktrees.** When you want to build a risky feature without disturbing your working tree, or run
several agents at once, each gets its own worktree: a separate checked-out copy of the repo on its own
branch, under `.claude/worktrees/`. RepoRadar was built this way. It is how you keep the main line safe
while you experiment, and how parallel agents avoid stepping on each other's files.

**Why.** Atomic commits make review and rollback trivial. If one change is wrong, you revert that one
commit, not a tangled blob of unrelated edits. Worktrees make parallelism safe. For a team, this is
the difference between a history you can read and a swamp you cannot.

**How to use it.**

1. Commit after each logical unit of work, with a message that says what changed and why.
2. Keep unrelated changes in separate commits.
3. Use a worktree (the `EnterWorktree` tool, or `git worktree add`) when you need isolation or want to
   run agents in parallel.

**Gotchas.**

- Do not batch unrelated changes into one commit. Future you, reviewing or reverting, will regret it.
- Do not commit secrets. The `.claude` hook blocks it, but the habit matters more than the backstop.
- For worktrees, branch from the right base so you are not building on stale code.
