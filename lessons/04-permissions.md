# Lesson 4: permissions and safe autonomy

**What it is.** Claude Code asks before it runs a tool. Permission settings let you tune that: allowlist
the safe, routine operations so the agent flows, and keep a prompt (or a hard block) on the ones with
blast radius. Safe autonomy is picking the right setting for each operation, not turning everything off
or everything on.

**The spectrum.** From most cautious to most autonomous:

1. Ask every time. Correct for a new repo you do not trust yet.
2. Allowlist the safe commands (`npm run typecheck`, `npm test`, `git status`, reads). The agent stops
   interrupting you for things that cannot hurt.
3. Plan mode for anything that writes, so you approve the approach first
   ([lesson 3](./03-prd-and-plan-mode.md)).
4. Full autonomy for a sandboxed, reversible task. Rare, and only when a mistake is cheap to undo.

The rule: match autonomy to blast radius. Reads and typechecks are safe to automate. `wrangler deploy`,
`wrangler secret put`, and anything that deletes are not.

**How we used it here.** Routine read and check commands run without prompting so the build keeps pace.
The operations that touch production or secrets stay deliberate. And the rules that must never break do
not rely on permissions at all: `.claude/settings.json` registers a `PreToolUse` hook on `Bash` that
blocks any commit staging a secret or breaking the house style
([lesson 12](./12-hooks.md)). Permissions set the default friction; the hook is the backstop.

**Why.** Permissions are about flow and trust. Too many prompts and the agent is annoying, so people
disable the guardrails entirely, which is worse. Allowlisting the genuinely safe operations earns back
the attention you need for the few that matter. Autonomy is not a personality setting, it is a
risk decision made per operation.

**How to use it.**

1. Start cautious on an unfamiliar repo. Loosen as you build trust.
2. Allowlist read-only and verification commands first; they are pure upside.
3. Keep a human gate on deploys, secret changes, and deletes.
4. For invariants that must hold no matter what, use a hook, not a permission. A permission can be
   clicked through; a hook cannot.

**Gotchas.**

- Personal allowlists live in `~/.claude`; team rules belong in the repo so everyone inherits the same
  defaults ([lesson 15](./15-working-with-others.md)).
- "Allow everything" to stop the prompts is how accidents happen. The fix for prompt fatigue is a
  precise allowlist, not a blanket one.
- A permission is a default, not a guarantee. Back the must-not-break rules with a hook.
