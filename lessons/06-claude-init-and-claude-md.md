# Lesson 6: claude init and CLAUDE.md

**What it is.** `CLAUDE.md` is your project's standing instructions, loaded into every Claude Code
session automatically. `claude init` scaffolds a first draft by reading your codebase. Think of it as
the policy file that makes Claude Code behave the same way for everyone on the team.

**How we used it here.** We wrote `CLAUDE.md` before any feature code, on purpose. It states the
architecture rule (one engine, two surfaces), the model tiering (Haiku to extract, Sonnet to reason),
the house writing style (no em dashes, sentence case), the security defaults, and the QA-gate
workflow. Governance first, then build.

**Why.** When 20 engineers point Claude Code at the same repo, you want consistent output, not 20
personal styles. `CLAUDE.md` is how you get that. It sits in a hierarchy:

- `~/.claude/CLAUDE.md` is yours, across every project (personal preferences).
- `./CLAUDE.md` is the team's, committed to the repo (shared rules).
- A `CLAUDE.md` in a subdirectory scopes rules to that area.
- `@path/to/file` imports another file's content inline.

**Result.** Every later step followed these rules without us restating them. The clearest proof: when
the engine asked Sonnet to write the per-repo rationale, the model honored "no em dashes" in its
output because the rule was already in context. Governance written once, applied everywhere.

**How to use it.** Keep it short and imperative. State rules the code cannot show on its own (style,
architecture intent, what to never do). Update it the moment you learn a durable rule, so the next
session starts smarter.

**Gotchas.**

- A bloated `CLAUDE.md` gets skimmed and ignored. Ruthlessly cut anything that is not a real rule.
- Put personal preferences in `~/.claude`, team rules in the repo. Do not make teammates inherit your
  individual quirks.
- It steers, it does not enforce. For rules that must hold (no committed secrets), back it with a hook
  (see [Lesson 12](./12-hooks.md)).
