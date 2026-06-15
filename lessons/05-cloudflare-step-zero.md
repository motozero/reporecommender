# Lesson 5: Cloudflare step zero

**What it is.** The setup you do before writing any feature code: a Cloudflare account, the `wrangler`
CLI installed and authenticated, and a trivial Worker deployed to prove the pipe works. Step zero turns
the eventual deploy from a risk into a non-event.

**How we used it here.** Before the engine existed, we stood up the account ("Let's Go Christo"),
authenticated `wrangler` with OAuth (no API token to manage), wrote a minimal `wrangler.jsonc`, and
deployed a near-empty Worker to `reporecommender.let-s-go-christo.workers.dev`. Only once that round
trip worked did we start building the recommendation engine on top of a deploy path we already trusted.

**Why.** When you ship real code for the first time and it fails, you want exactly one suspect: your
code. If you have never deployed before, a failure could be the account, the CLI auth, the config, the
build, or the code, and you will burn an hour bisecting the platform instead of the bug. Proving the
empty pipe on day zero collapses that search space. It is the same instinct as a hello-world before the
real program.

**How to use it.**

1. Create the account and install `wrangler`.
2. Authenticate (`wrangler login` for OAuth, which avoids storing a token).
3. Write the smallest possible `wrangler.jsonc` and a Worker that returns "ok".
4. `wrangler deploy`, then open the `workers.dev` URL and see it respond.
5. Now build. Deploying the real thing is no longer a new path, just a bigger payload.

**Gotchas.**

- Do the custom domain as its own later step, not on day zero. The `workers.dev` URL is enough to prove
  the pipe; the domain is a separate concern ([lesson 19](./19-deploy.md)).
- Secrets are not part of step zero. Local dev uses `.dev.vars`, production uses `wrangler secret put`,
  and neither belongs in the repo ([lesson 14](./14-secrets-and-keys.md)).
- Commit `wrangler.jsonc` from the start so the deploy config is versioned with the code, not stored in
  someone's head.
