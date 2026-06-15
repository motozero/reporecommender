# Lesson 4: permissions and safe autonomy

**What it is.** Claude Code asks before it runs a tool. Permission settings let you tune that: allowlist
the safe, routine operations so the agent flows, and keep a prompt (or a hard block) on the ones with
blast radius. Safe autonomy is picking the right setting per operation, not turning everything off or
everything on.

**How we used it here.** The policy on this build fell into three tiers, and you can see it in the
rhythm of the work:

- Ran freely: reads, `npm run typecheck`, `npm test`, `git status`, `git diff`. These cannot hurt
  anything, so prompting on them would only train us to click "yes" without reading.
- Stayed deliberate: `wrangler deploy` and `wrangler secret put`. Both touch production, so both stayed
  a conscious step, never automatic.
- A third tier showed up that is not about danger at all: `npm run eval` calls the real Anthropic and
  GitHub APIs and costs money, a few cents to a dollar a run. So running the eval was always a
  deliberate decision too. Autonomy is a cost question, not only a destruction question.

And the rule that must never break does not rely on permissions at all. `.claude/settings.json`
registers a `PreToolUse` hook on `Bash` that blocks any commit staging a secret or breaking the house
style. We proved it by staging a fake `.dev.vars` on purpose; the commit was refused
([lesson 12](./12-hooks.md)). Permissions set the default friction; the hook is the floor under it.

**Why.** Permissions are about flow and trust. Too many prompts and the agent is annoying, so people
disable the guardrails entirely, which is worse. Allowlisting the genuinely safe operations buys back
the attention you need for the few that matter. Autonomy is not a personality setting, it is a risk
decision (and sometimes a cost decision) made per operation.

**How to use it.**

1. Start cautious on an unfamiliar repo. Loosen as you build trust.
2. Allowlist read-only and verification commands first; they are pure upside.
3. Keep a human gate on deploys, secret changes, deletes, and anything that spends money.
4. For invariants that must hold no matter what, use a hook, not a permission. A permission can be
   clicked through; a hook cannot.

**Gotchas.**

- Personal allowlists live in `~/.claude`; team rules belong in the repo so everyone inherits the same
  defaults ([lesson 15](./15-working-with-others.md)).
- "Allow everything" to stop the prompts is how accidents happen. The fix for prompt fatigue is a
  precise allowlist, not a blanket one.
- A permission is a default, not a guarantee. Back the must-not-break rules with a hook.
