# Repo Recommender

Point a developer at a GitHub repo and a goal ("auth solution", "background jobs"), and return repos
that genuinely complement theirs, with a short reason and ratings.

This repo is also a teaching artifact: a disciplined Claude Code build with a lesson book in
`lessons/`. Keep both the product and the lessons accurate.

## Architecture: one engine, two surfaces

- `src/engine.ts` is the shared core: `recommend(repoUrl, goal)`. It is framework free and is the
  ONLY place recommendation logic lives.
- `src/index.ts` is the Web API surface (`/api/recommend`) for the browser frontend.
- `src/mcp.ts` is our own MCP server surface, exposing `recommend_repos` as a tool for Claude Code,
  Claude Desktop, or any agent.
- Never duplicate engine logic into a surface. Surfaces parse input, call the engine, shape output.
  The caller decides the interface: software callers use the HTTP API, model or agent callers use MCP.

## Stack and conventions

- Cloudflare Worker with Static Assets (`public/`) plus D1. TypeScript, ES modules, no frontend
  framework (plain HTML, CSS, JS).
- Run: `npm run dev` (wrangler dev), `npm run typecheck`, `npm run deploy`.
- After changing `wrangler.jsonc`, run `npm run cf-typegen`.
- Read config from `env` bindings, never from module globals.

## Models (tiering)

- Use Claude Haiku for cheap, high volume work: extracting a repo's purpose and stack from its
  README, and pulling search keywords.
- Use Claude Sonnet for reasoning: ranking candidates and writing the per repo "why it fits THIS
  project" plus the ease and impact ratings.
- Escalate to Opus or Fable only when Sonnet visibly struggles. Note the choice in a code comment so
  the cost story stays legible.

## Writing style (user-facing copy)

Applies to UI text, the README, lesson files, and any text the app emits.
- No em dashes and no "--". Use commas, periods, parentheses, or split into two sentences.
- Sentence case for headings, not Title Case.
- Concrete and direct. Cut filler. Avoid AI-isms (delve, leverage, robust, seamless, comprehensive,
  "it is not X, it is Y").

## Security

- Never commit secrets. `.dev.vars` is gitignored; production uses `wrangler secret put`.
- Tokens are least privilege: the GitHub token is read only, public scope.
- Validate and bound all user input (repo URL shape, goal length) before use.
- A `.claude` quality gate blocks commits that stage secrets or break the style rules.

## Workflow

- Plan non trivial work before building. Commit in small, atomic steps.
- QA gate before calling a change done: `npm run typecheck` and a browser check of the affected page
  (use the browse skill). Lint and build are not a substitute for QA.
