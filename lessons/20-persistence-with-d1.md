# Lesson 20: persistence with D1

![The D1 data model: messages, usage, events, and chat sessions with their messages](./assets/d1-data-model-handdrawn.png)

**What it is.** D1 is Cloudflare's SQLite database, bound straight to the Worker. The recommender itself
is stateless (a request comes in, repos go out), but the moment you want a real product you need memory:
who used it, what they asked, what they clicked, what they said. D1 is where that lives.

**How we used it here.** One `wrangler d1 create reporecommender` provisioned it; the binding `DB` went
in `wrangler.jsonc`; the schema lives in `schema.sql` and is applied with `wrangler d1 execute`. Five
tables, each earning its place:

- `messages` - contact form submissions.
- `usage` - one row per search (the project, the goal, and the visitor's geo and device).
- `events` - repo clicks.
- `chat_sessions` and `chat_messages` - the chat-with-a-repo feature (see
  [lesson 22](./22-ai-chat-feature.md)).

You read it back with one command, no dashboard needed:
`wrangler d1 execute reporecommender --remote --command "SELECT * FROM messages ORDER BY id DESC LIMIT 20"`.

**Why.** A stateless tool answers a question and forgets it. A product remembers. D1 turns every request
into a row you can query later, which is what makes the analytics, the admin dashboard
([lesson 23](./23-analytics-and-admin.md)), and the chat transcripts possible. It is the same Worker, the
same deploy, plus one binding.

**How to use it.**

1. `wrangler d1 create <name>`, then add the `d1_databases` binding to `wrangler.jsonc`.
2. Keep the schema in a committed `schema.sql` with `CREATE TABLE IF NOT EXISTS`, so applying it twice is
   safe.
3. Apply it to both ends: `--remote` for production, `--local` for `wrangler dev`.
4. Read with `wrangler d1 execute ... --command "SELECT ..."`.

**Gotchas.**

- The schema is real code. Commit it, and make every statement idempotent so a re-run never errors.
- Local dev uses a separate local D1. Apply the schema there too, or your endpoints will fail only on
  your machine.
- A write you actually need must be awaited, not fire-and-forget. We learned this the hard way when chat
  turns vanished (see [lesson 22](./22-ai-chat-feature.md)).
