# Lesson 23: anonymous analytics and an admin dashboard

![The full system: one engine and two surfaces, plus the event, chat, and contact endpoints writing to D1 and Telegram, read back through the admin dashboard and transcripts](./assets/system-map-v2-handdrawn.png)

**What it is.** Knowing who uses your tool, and what they do with it, without asking anyone for an email.
A random visitor id kept in the browser ties a person's searches, clicks, and chats together. A
password-protected `/admin` page shows all of it in one place.

**How we used it here.** On first visit the browser generates a `visitor_id` and stores it in
`localStorage`. Every search, repo click, chat, and contact carries it, so the owner sees a stable,
anonymous person ("visitor a3f9 from Austin, AT&T, Chrome/Mac") and everything they did, with no PII.
`/admin` is gated by HTTP Basic auth against an `ADMIN_PASSWORD` secret and renders four tables from D1:
chats (with transcript links), repo clicks, searches, and contact messages.

This closes the loop the diagram shows: a visitor acts, the Worker records it to D1 and pings Telegram,
and the owner reads it back through the dashboard and the transcripts.

**Why.** Most analytics asks you to trade privacy for insight, or to bolt on a third-party script. A
random id in the browser gives you per-person behavior with zero personal data and zero external trackers.
The admin page means you do not have to click through Telegram pings one at a time to see what is
happening.

**How to use it.**

1. Generate an anonymous id on the client, keep it in `localStorage`, and send it with every event.
2. Log interactions to D1 from small `/api/event`-style endpoints, best-effort so they never block the UI.
3. Gate the dashboard with Basic auth against a secret, and constant-time compare the password.
4. Be honest with users: a short "chats may be reviewed" note keeps the data collection clean.

**Gotchas.**

- A `localStorage` id resets if the user clears storage or switches browsers. It tracks behavior, not
  identity, which is exactly the point.
- Never put the admin password in the repo. It is a `wrangler secret`, like every other credential
  ([lesson 14](./14-secrets-and-keys.md)).
- Tell people you collect this. Anonymous is not the same as secret.
