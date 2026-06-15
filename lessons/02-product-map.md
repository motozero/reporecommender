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

**The toolkit map.** Claude Code is not one feature, it is a kit, and this book is a tour of it:

- Plan before build ([lesson 3](./03-prd-and-plan-mode.md)), so the approach is agreed before code.
- `CLAUDE.md` ([lesson 6](./06-claude-init-and-claude-md.md)) for standing rules, plus permissions and
  safe autonomy ([lesson 4](./04-permissions.md)) for how much it does without asking.
- Custom skills ([lesson 7](./07-custom-skills.md)), MCP ([lesson 8](./08-integrations-and-mcp.md)),
  model tiering ([lesson 10](./10-model-tiering-and-cost.md)), subagents
  ([lesson 11](./11-subagents.md)), and hooks ([lesson 12](./12-hooks.md)) for guardrails that hold.
- Tests ([lesson 17](./17-tests.md)) and evals ([lesson 18](./18-evals.md)) for the two halves of a
  system that is part deterministic plumbing and part model judgment.

**Wispr Flow (the input that makes it click).** Claude Code rewards long, specific, contextual prompts,
and typing those is slow. Dictating them with Wispr Flow (voice to text) is two to three times faster,
so you give the agent the full context it works best with instead of a terse line you will have to
correct. It is a personal-workflow tool, not part of Claude Code, but it changes how much you get out
of every prompt.

**Why start with maps.** Onboarding a team to a new tool fails when people learn features with no place
to put them. Anchor every feature to where it lands on these two maps, and the kit stops being a list
and becomes a method.

**How to use it.** Draw your own two maps for your project before you start: the architecture in one
picture, and the Claude Code features you intend to lean on. Revisit them when you feel lost. Most
"the agent is flailing" moments are really "we skipped the map."
