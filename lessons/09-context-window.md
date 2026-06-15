# Lesson 9: context window management

**What it is.** The model reasons over a finite context window. Everything in it, the files, the
history, the half-finished tangents, competes for attention. Managing context is keeping the window full
of what matters and getting everything else out, while persisting the durable parts in files so they
survive when the window resets.

**How we used it here.** This project was not built in one sitting. It spanned several sessions, and the
only reason a fresh session could pick up exactly where the last left off is that the load-bearing state
lived in files, not in the chat:

- `CLAUDE.md` held the standing rules (the one-engine-two-surfaces architecture, the Haiku-to-extract
  and Sonnet-to-reason tiering, the no-em-dashes style). No session ever spent tokens rediscovering
  them ([lesson 6](./06-claude-init-and-claude-md.md)).
- A handoff note captured the decisions and the next steps, so resuming was reading one file, not
  reconstructing a week of reasoning from memory.
- The commit history and this lesson book are external memory too. "Why is the search constrained by
  language?" is answered by a commit message, not by anyone's recollection.

There is even a small version of the same idea inside the eval harness: it caches each engine result to
disk, so re-scoring never re-runs the model. Externalised state, reused instead of recomputed.

**Why.** A cluttered window degrades output in quiet ways: the model leans on a stale earlier decision,
or loses the thread among ten open tangents. Long sessions get compacted (summarised) to fit, and a
summary is lossy. The defence is not a bigger window, it is putting the load-bearing facts somewhere
durable so a reset or a compaction costs you nothing.

**How to use it.**

1. Keep durable rules in `CLAUDE.md`, not in the chat.
2. When you pause real work, write the state to a file (a handoff note) so the next session starts cold
   but informed.
3. Start a fresh session when you switch tasks, so old context does not bleed into new work.
4. Work in small committed steps; the git history becomes external memory you can trust.

**Gotchas.**

- Do not treat the chat history as storage. If it matters tomorrow, it goes in a file today.
- A compaction summary can drop a detail you cared about. Re-state load-bearing constraints rather than
  assuming they survived.
- More context is not free attention. A focused window usually beats a full one.
