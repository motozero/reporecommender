# Lesson 2: the Claude toolkit and product map

**What it is.** Two maps to hang on the wall before building: the product map (what we are making) and
the toolkit map (the Claude Code features we will use to make it). A team that can see both moves with
intent instead of poking at the agent and hoping.

**The product map.** Repo Recommender is one engine behind two surfaces. The recommendation logic lives
once in `src/engine.ts`, and two thin surfaces call it: a Web API for the browser and an MCP server for
agents. The request flow is fixed and worth memorising: a repo or website URL plus a goal, Haiku
extracts the purpose and search queries, GitHub search ranked by stars gathers candidates, Sonnet ranks
them and writes the what, why, and how, then we enrich the final picks with real metrics. The two
hand-drawn diagrams in the README (`one-engine-two-surfaces` and `request-flow`) are this map.

**How the toolkit actually got used, in order.** This book is a tour of the kit, but the build applied
it as a sequence, and the order is the lesson:

1. Plan mode first ([lesson 3](./03-prd-and-plan-mode.md)) locked the approach before any code,
   including the decision to make this lesson book a real deliverable.
2. `CLAUDE.md` ([lesson 6](./06-claude-init-and-claude-md.md)) wrote down the rules so every later
   session inherited them, with permissions ([lesson 4](./04-permissions.md)) tuning how much ran
   without asking.
3. The engine got built with model tiering ([lesson 10](./10-model-tiering-and-cost.md)): cheap Haiku to
   extract, stronger Sonnet to reason. Then the two surfaces, the Web API and our own MCP server
   ([lesson 8](./08-integrations-and-mcp.md)).
4. A custom skill ([lesson 7](./07-custom-skills.md)) and a commit-blocking hook
   ([lesson 12](./12-hooks.md)) made the work repeatable and safe.
5. It shipped ([lesson 19](./19-deploy.md)), then earned tests ([lesson 17](./17-tests.md)) and an eval
   harness ([lesson 18](./18-evals.md)) for the two halves of a system that is part deterministic
   plumbing, part model judgment.

Every feature landed at a specific moment for a specific reason. That sequence is the method.

**Wispr Flow (the input that makes it click).** Claude Code rewards long, specific, contextual prompts,
and typing those is slow. Dictating them with Wispr Flow (voice to text) is two to three times faster,
so you hand the agent the full context it works best with instead of a terse line you then have to
correct. It is a personal-workflow tool, not part of Claude Code, but it changes how much you get out of
every prompt.

**How to use it.** Draw your own two maps before you start: the architecture in one picture, and the
Claude Code features you intend to lean on, in the order you will reach for them. Most "the agent is
flailing" moments are really "we skipped the map."
