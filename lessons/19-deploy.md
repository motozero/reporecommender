# Lesson 19: deploy

**What it is.** Shipping the Worker to Cloudflare so it runs on the internet, with secrets stored in
Cloudflare rather than the repo. A deploy is not done when the command succeeds. It is done when you
have used the live URL and seen it work.

**How we used it here.** `wrangler deploy` put the app at
`reporecommender.let-s-go-christo.workers.dev`. The static frontend ships as assets, the API ships as
the Worker. Production secrets (`ANTHROPIC_API_KEY`, `GITHUB_TOKEN`) were set with
`wrangler secret put`, read from `.dev.vars` and piped in so the values never printed.
`.dev.vars` is for local dev only. Production reads secrets from Cloudflare. See
[Lesson 14](./14-secrets-and-keys.md).

**The war story (why you always test the live URL).** The first live recommendation returned a GitHub
`401`. Locally everything had worked, because locally we had run unauthenticated. The deployed call
surfaced the real problem: the token in `.dev.vars` was 80 characters, but a classic GitHub PAT is 40.
A clean double-paste. We caught it by checking the credential's shape, confirmed the first 40
characters authenticated, trimmed it, re-set the secret, and the live site worked. The lesson: when
auth fails, check the credential before you blame the code.

**Why.** Local and production differ in exactly the ways that bite: secrets, rate limits, cold starts.
Local passing tells you the code compiles. The live URL tells you it works.

**How to use it.**

1. `wrangler deploy`.
2. `wrangler secret put <NAME>` for each secret. They take effect on the next request, no redeploy.
3. Smoke-test the live URL: health, then a real request.
4. Browser-QA the deployed page, not just localhost.
5. A custom domain is a separate step (point your registrar at Cloudflare).

**Gotchas.**

- `.dev.vars` does not deploy. Production needs `wrangler secret put`.
- Pasted secrets can double or pick up whitespace. Verify length and prefix before trusting them.
- Never conclude "it works" from a local run alone. Test the thing users will actually hit.
