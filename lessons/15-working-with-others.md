# Lesson 15: working with others (team .claude/)

**What it is.** Making Claude Code a team tool instead of a personal one. The mechanism is simple:
commit the `.claude/` directory and `CLAUDE.md` to the repo. Then the agent behaves the same for
everyone, and onboarding a new engineer to your conventions is `git clone`.

**How we used it here.** The governance is version-controlled, not tribal knowledge:

- `CLAUDE.md` carries the standing rules ([lesson 6](./06-claude-init-and-claude-md.md)): the
  architecture, the model tiering, the house style, the security defaults.
- `.claude/skills/repo-analysis/` is a shared skill ([lesson 7](./07-custom-skills.md)) any teammate
  can invoke.
- `.claude/hooks/pre-commit-quality.sh` plus `.claude/settings.json` are the quality and safety gate
  ([lesson 12](./12-hooks.md)), so the rule that blocks committed secrets protects every clone, not just
  the person who wrote it.

Clone the repo and you inherit the rules, the skills, and the guardrails at once.

**Why.** When several people point Claude Code at the same codebase, the failure mode is divergence:
twenty personal styles, twenty interpretations of "done," guardrails that exist on one laptop and not
the others. Putting the governance in the repo makes it shared and reviewable. A change to how the team
works with the agent goes through a pull request like any other change, with history and sign-off.

**The personal versus team line.** Keep the split clean:

- `~/.claude/` is yours: personal preferences and allowlists that should not bind teammates
  ([lesson 4](./04-permissions.md)).
- The repo's `.claude/` and `CLAUDE.md` are the team's: rules everyone inherits.

Do not push your individual quirks into the shared files, and do not put load-bearing team rules
somewhere only you have them.

**How to use it.**

1. Commit `CLAUDE.md` and `.claude/` from the start, so governance is versioned with the code.
2. Review changes to them like code, because they are code: they change how the agent acts for everyone.
3. Keep shared rules in the repo and personal preferences in `~/.claude`.
4. Back the must-not-break rules with a hook, so they hold for a teammate who has never read the
   `CLAUDE.md` ([lesson 12](./12-hooks.md)).

**Gotchas.**

- A rule that lives only in one person's head or laptop is not a team rule. If it matters, it is in the
  repo.
- `CLAUDE.md` steers; hooks enforce. For a team, the difference matters most, because not everyone will
  have read the doc.
- Resist bloat. A shared `CLAUDE.md` that grew to a wall of text gets skimmed and ignored by the whole
  team at once.
