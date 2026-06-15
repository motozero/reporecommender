# Lesson 15: working with others (team .claude/)

**What it is.** Making Claude Code a team tool instead of a personal one. The mechanism is simple:
commit the `.claude/` directory and `CLAUDE.md` to the repo. Then the agent behaves the same for
everyone, and onboarding a new engineer to your conventions is `git clone`.

**How we used it here.** Open the repo and the governance is all there, version-controlled, not living in
anyone's head:

- `CLAUDE.md` carries the standing rules ([lesson 6](./06-claude-init-and-claude-md.md)): the
  architecture, the model tiering, the house style, the security defaults.
- `.claude/skills/repo-analysis/` is a shared skill ([lesson 7](./07-custom-skills.md)) any teammate can
  invoke to analyse a repo the same way.
- `.claude/hooks/pre-commit-quality.sh` plus `.claude/settings.json` are the quality and safety gate
  ([lesson 12](./12-hooks.md)).

The clearest proof that this is team infrastructure and not decoration: the "no em dashes" rule in
`CLAUDE.md` was honored even by the engine's own model output, because the rule was already in context
when Sonnet wrote the recommendations. And the secret-blocking hook, which we tested by staging a fake
`.dev.vars` and watching the commit get refused, protects every clone, including the teammate who has
never opened the `CLAUDE.md`. Clone the repo and you inherit the rules, the skills, and the guardrails at
once.

**The personal versus team line.** Keep the split clean. `~/.claude/` is yours: personal preferences and
allowlists that should not bind teammates ([lesson 4](./04-permissions.md)). The repo's `.claude/` and
`CLAUDE.md` are the team's: rules everyone inherits. Do not push your individual quirks into the shared
files, and do not keep a load-bearing team rule somewhere only you have it.

**Why.** When several people point Claude Code at the same codebase, the failure mode is divergence:
many personal styles, many readings of "done," guardrails that exist on one laptop and not the others.
Putting the governance in the repo makes it shared and reviewable. A change to how the team works with
the agent goes through a pull request like any other change, with history and sign-off.

**How to use it.**

1. Commit `CLAUDE.md` and `.claude/` from the start, so governance is versioned with the code.
2. Review changes to them like code, because they are code: they change how the agent acts for everyone.
3. Keep shared rules in the repo and personal preferences in `~/.claude`.
4. Back the must-not-break rules with a hook, so they hold for a teammate who has never read the
   `CLAUDE.md`.

**Gotchas.**

- A rule that lives only on one laptop is not a team rule. If it matters, it is in the repo.
- `CLAUDE.md` steers; hooks enforce. For a team the difference matters most, because not everyone will
  have read the doc.
- Resist bloat. A shared `CLAUDE.md` that grew to a wall of text gets skimmed and ignored by the whole
  team at once.
