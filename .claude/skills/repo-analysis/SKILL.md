---
name: repo-analysis
description: Analyze a GitHub repo from its URL. Fetch the README and metadata, then summarize purpose, tech stack, and maturity signals as structured JSON. Use when testing or tuning the recommender, building eval cases, or researching a candidate repo.
---

# repo-analysis

Turn a GitHub repo URL into a structured summary the recommender and its evals can rely on.

## Steps

1. Parse `owner/repo` from the URL.
2. Fetch metadata: `curl -s https://api.github.com/repos/<owner>/<repo>` (add
   `-H "Authorization: Bearer $GITHUB_TOKEN"` when the token is set). Capture stars, language,
   `pushed_at`, license, `archived`, and `open_issues_count`.
3. Fetch the README via `https://api.github.com/repos/<owner>/<repo>/readme` (follow `download_url`),
   or fall back to the raw `README.md`.
4. Summarize:
   - Purpose: one or two sentences on what it does.
   - Stack: languages, frameworks, runtime.
   - Maturity signals: recent activity (`pushed_at`), stars, open issue load, archived or not, license.
5. Return a compact JSON object with those fields. Keep any prose in the house style (no em dashes,
   concrete).

## Gotchas

- Unauthenticated GitHub API is rate limited to 60 requests per hour. Set `GITHUB_TOKEN` for 5000.
- Some repos have no README or use a non standard path. Fall back to the repo `description`.
- Stars and recency are signals, not verdicts. A fresh, low star repo can still be the right fit.
