# Lesson 12: hooks

**What it is.** Hooks are shell commands the Claude Code harness runs on tool events (`PreToolUse`,
`PostToolUse`, `Stop`, and more). They enforce policy deterministically. The difference from
`CLAUDE.md` matters: `CLAUDE.md` asks the model to behave, a hook makes the behavior happen whether
the model remembers or not.

**How we used it here.** `.claude/settings.json` registers a `PreToolUse` hook on `Bash` that runs
`.claude/hooks/pre-commit-quality.sh`. The script inspects any `git commit` and blocks it when the
staged changes:

- include `.dev.vars` (the local secrets file), or
- contain a key-shaped string (`sk-ant-...`, `ghp_...`), or
- contain an em dash in user-facing copy (`public/`, `lessons/`, `*.md`).

It exits `2` to block, with the reason printed to stderr so Claude Code sees why.

**Why.** "The model usually remembers not to commit secrets" is not a security control. A hook is. For
a team, a hook guarantees the rule holds even when someone is tired, rushing, or new. It moves the
guardrail from hope into the harness.

**Result.** We proved it before trusting it. Staging a fake `.dev.vars` and an em dash in a lesson
file both got blocked with clear messages, and the clean governance commit passed. The same gate now
protects every engineer who clones the repo.

**How to use it.** Match on the tool name. Read the event payload on stdin (we keep it dependency
free by scanning the raw payload for `git commit` rather than parsing JSON). Exit `2` to block and
write the reason to stderr. Keep it fast, it runs on every matching call.

**Gotchas.**

- Fail open on parse or environment errors, so a flaky hook never blocks legitimate work.
- Project hooks apply when Claude Code runs inside that project, so test the script directly (pipe a
  fake payload to it) rather than assuming it fired.
- A hook that is slow or noisy gets disabled. Make it quick and quiet on the happy path.
