# Lesson 14: secrets and key management

**Pairs with Video A.** How to define, store, and protect the keys this app needs, and how to record
yourself doing it without leaking a single character.

## What it is

Repo Recommender needs three secrets:

| Secret | Used by | Where it lives |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | the Worker, to call Claude | `.dev.vars` (local), Cloudflare secret (prod) |
| `GITHUB_TOKEN` | the Worker, to lift the GitHub rate limit | `.dev.vars` (local), Cloudflare secret (prod) |
| Cloudflare API token | `wrangler`, to deploy | your machine's `wrangler login`, never in the repo |

The one rule everything else follows: **a secret never lives in the repo, the git history, a log, or
on screen.**

## How we set it up in this repo

1. **`.dev.vars.example`** is committed with placeholder values. It documents which keys exist.
2. **`.dev.vars`** holds the real values for local dev. It is in `.gitignore`, so git never sees it.
   `wrangler dev` loads it automatically into `env`.
3. **The `.claude` hook** (`pre-commit-quality.sh`) blocks any commit that stages `.dev.vars` or
   contains a key-shaped string (`sk-ant-...`, `ghp_...`). Safety enforced by the harness, not memory.
4. **`scripts/set-dev-vars.sh`** populates `.dev.vars` using `read -s`, so the value is never echoed
   and never enters shell history.
5. **Production** uses Cloudflare secrets, not the repo: `wrangler secret put ANTHROPIC_API_KEY`. The
   value is stored in Cloudflare and injected into `env` at runtime.
6. **The Worker reads from `env`**, never from a hardcoded string. Code that needs a key takes it as a
   parameter or reads `env.ANTHROPIC_API_KEY`.

## Why

- A key committed once is a key leaked forever. Git history and forks keep it even after you delete it.
- Client code is public. Anything in `public/` ships to the browser, so a key there is world readable.
  Keys only ever live server-side, in the Worker.
- Least privilege limits the blast radius. The GitHub token is read only, public scope. If it leaks,
  the worst case is someone reads public repos you could already read.

## How to use it

Local, first time:

```bash
bash scripts/set-dev-vars.sh   # prompts with hidden input, writes .dev.vars
npm run dev                    # wrangler dev loads .dev.vars into env
```

Production, once per environment:

```bash
wrangler secret put ANTHROPIC_API_KEY   # masked prompt, stored in Cloudflare
wrangler secret put GITHUB_TOKEN
```

Rotate when needed: delete the key in the Anthropic console or revoke the GitHub PAT, then reissue
and rerun the steps above.

## Video A script (recording without leaking)

The goal is to show the workflow while the real value never renders. Do not blur in post, one bad
frame leaks the key. Never render it instead.

1. **Open with the threat.** Show `.gitignore` listing `.dev.vars`, and the `.claude` hook. Say:
   "Before any key exists, the repo already refuses to commit one."
2. **Placeholder on screen.** Open `.dev.vars.example`. It shows `ANTHROPIC_API_KEY=sk-ant-xxxxxxxx`.
   Narrate: "Real values go here, the same way, but they never get committed."
3. **Show the masked real entry.** Run `wrangler secret put ANTHROPIC_API_KEY` (for prod) or
   `bash scripts/set-dev-vars.sh` (for local). Paste at the hidden prompt. Nothing appears. This is
   the money shot: the secret goes in and stays invisible.
4. **Prove the guardrail.** Stage `.dev.vars` and try to commit. The hook blocks it. Show the message.
5. **Close on rotation.** Mention you rotate any key that was near a camera, as defense in depth.

### Do not do on camera

- Do not `cat .dev.vars` or `echo $ANTHROPIC_API_KEY`.
- Do not film the Anthropic console's one-time key reveal. Create the key off camera, or cut the clip.
- Do not open `.dev.vars` in an editor after it holds the real value.
- Turn off clipboard manager popups (Raycast, Alfred, Paste) before recording.

## Gotchas

- `wrangler dev` reads `.dev.vars`; `wrangler deploy` does not. Production needs `wrangler secret put`.
- `read` without `-s` echoes the value and stores it in history. Always use the helper.
- A key pasted into a chat, a screenshot, or a screen share is compromised. Treat it as burned and
  rotate it.
