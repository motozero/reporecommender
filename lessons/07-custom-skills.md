# Lesson 7: custom skills

**What it is.** A skill is a `SKILL.md` file (frontmatter with a name and description, plus
instructions) that Claude Code can invoke as a named, reusable capability. It packages a workflow so
the agent does it the same way every time, instead of improvising the steps.

**Skills vs the things people confuse them with:**

- **Skill** = a documented workflow Claude follows (the lightest unit).
- **Slash command** = a user-facing entry point you type.
- **Subagent** = a separate context that runs a task and reports back.
- **Plugin** = a bundle (commands, agents, MCP servers, hooks) distributed together.

A skill is the smallest of these. Reach for it first.

**How we used it here.** We wrote `.claude/skills/repo-analysis/SKILL.md`. It codifies turning a
GitHub URL into a structured summary: fetch the README, detect the stack, summarize the purpose, return
JSON. It exists so that analyzing a repo is consistent whether we are testing the engine, building an
eval case, or researching a candidate by hand.

**Why.** Codify the workflow once, and every run follows it. For a team, skills are how one person's
way of doing a thing becomes everyone's way. The model does not reinvent the steps each time; it reads
the skill and follows it.

**Result.** A reusable repo-analysis capability that lives in the repo, versioned with the code, and
available to anyone who clones it.

**How to use it.** Create `.claude/skills/<name>/SKILL.md` with frontmatter (`name`, `description`)
and the steps. The description is what Claude uses to decide when the skill is relevant, so make it
sharp and specific.

**Gotchas.**

- A vague description means the skill never gets invoked. Be concrete about when it applies.
- Keep each skill focused on one job. A skill that tries to do everything does nothing reliably.
- Skills steer behavior. They do not enforce it. For rules that must hold, back them with a hook (see
  [Lesson 12](./12-hooks.md)).
