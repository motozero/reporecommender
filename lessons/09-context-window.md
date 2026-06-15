# Lesson 9: context window management

**What it is.** The model reasons over a finite context window. Everything in it, the files, the
history, the half-finished tangents, competes for the model's attention. Managing context is keeping
the window full of what matters and getting everything else out, while persisting the durable parts in
files so they survive when the window resets.

**The core move: externalise durable state, clear transient state.** Anything that must outlive a single
session belongs in a file, not in the chat history:

- Standing rules go in `CLAUDE.md`, reloaded every session
  ([lesson 6](./06-claude-init-and-claude-md.md)), so they never need re-explaining.
- The agreed approach goes in a plan file ([lesson 3](./03-prd-and-plan-mode.md)).
- Decisions and progress go in the lesson book and the commit history, readable later by you or a
  teammate.

Once the durable parts live in files, the live context is free to hold just the task at hand.

**How we used it here.** The architecture rule, the model tiering, and the house style sat in
`CLAUDE.md`, so no session ever spent tokens rediscovering them. The build was sequenced into small,
committed steps, so each one started from a clean, well-named state instead of a sprawling history. When
a long session drifted, the fix was to capture any new durable rule into `CLAUDE.md`, then start the next
piece of work fresh rather than dragging the whole transcript along.

**Why.** A cluttered window degrades output in quiet ways: the model leans on a stale earlier decision,
or loses the thread among ten open tangents. Long sessions get compacted (summarised) to fit, and a
summary is lossy. The defence is not a bigger window, it is putting the load-bearing facts somewhere
durable so a reset or a compaction costs you nothing.

**How to use it.**

1. Keep durable rules in `CLAUDE.md`, not in the chat.
2. Start a fresh session when you switch tasks, so old context does not bleed into new work.
3. Work in small committed steps; the git history becomes external memory you can trust.
4. After a long session, write down anything you learned that should persist, then let the rest go.

**Gotchas.**

- Do not treat the chat history as storage. If it matters tomorrow, it goes in a file today.
- A compaction summary can drop a detail you cared about. Re-state load-bearing constraints rather than
  assuming they survived.
- More context is not free attention. A focused window usually beats a full one.
