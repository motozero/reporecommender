# Lesson 5: Cloudflare step zero

**What it is.** The setup you do before writing any feature code: a Cloudflare account, the `wrangler`
CLI installed and authenticated, and a trivial Worker deployed to prove the pipe works. Step zero turns
the eventual deploy from a risk into a non-event.

**How we used it here.** Before the recommendation engine existed, before a single line of `src/`, we
stood up the account ("Let's Go Christo"), authenticated `wrangler` with OAuth so there was no API token
to store or leak, wrote a near-empty `wrangler.jsonc`, and deployed a Worker that did almost nothing to
`reporecommender.let-s-go-christo.workers.dev`. We opened the URL, saw it respond, and only then started
building the engine on a deploy path we had already watched work end to end.

**The payoff came later, and it was the whole point.** The first time the real app deployed, a live
recommendation came back with a GitHub `401` (the full story is in [lesson 19](./19-deploy.md)). Because
step zero had already proven the account, the auth, and the config, we did not waste a second suspecting
the platform. The deploy pipe was known-good, so the failure had to be the one thing that had changed:
the credential. It was an 80-character `GITHUB_TOKEN`, a clean double-paste of a 40-character PAT. Five
minutes, not an hour, because step zero had taken the platform off the suspect list.

**Why.** When you ship real code for the first time and it fails, you want exactly one suspect: your
code. If you have never deployed before, a failure could be the account, the CLI auth, the config, the
build, or the code, and you will bisect the platform instead of the bug. Proving the empty pipe on day
zero collapses that search space. It is hello-world before the real program, applied to the deploy.

**How to use it.**

1. Create the account and install `wrangler`.
2. Authenticate with `wrangler login` (OAuth), which avoids storing a token.
3. Write the smallest possible `wrangler.jsonc` and a Worker that returns "ok".
4. `wrangler deploy`, then open the `workers.dev` URL and see it respond.
5. Now build. Deploying the real thing is no longer a new path, just a bigger payload.

**Gotchas.**

- Do the custom domain as its own later step. The `workers.dev` URL is enough to prove the pipe; the
  domain (reporecommender.com here) is a separate concern ([lesson 19](./19-deploy.md)).
- Secrets are not part of step zero. Local dev uses `.dev.vars`, production uses `wrangler secret put`,
  and neither belongs in the repo ([lesson 14](./14-secrets-and-keys.md)).
- Commit `wrangler.jsonc` from the start so the deploy config is versioned, not stored in someone's head.
