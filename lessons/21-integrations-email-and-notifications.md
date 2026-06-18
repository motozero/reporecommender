# Lesson 21: integrations, email and notifications

![Visitor data flow: an action hits the Worker, which reads request.cf and writes to D1 and pings Telegram, which the owner reads via admin and transcripts](./assets/visitor-data-flow-handdrawn.png)

**What it is.** Wiring the Worker to the outside world: Resend to send transactional email (the contact
form), Telegram to push real-time alerts, and Cloudflare's `request.cf` to learn who a visitor is. A tool
that can reach you is a different thing from a tool that just answers.

**How we used it here.** The contact form posts to `/api/contact`, which stores the message in D1, emails
it through Resend, and pings Telegram, all best-effort on top of the durable store. Separately, every
search and every chat pings Telegram with the visitor's geo, network (ASN), and device, read straight off
`request.cf` for free. Secrets (`RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) are set with
`wrangler secret put`, never committed.

**The war stories (why integrations bite).**

- Resend returned `403: you can only send testing emails to your own address`. The shared
  `onboarding@resend.dev` sender only delivers to the account owner until you verify a domain. The fix was
  a one-line config, but only the error told us which one.
- The first version sent notifications and stored data in `ctx.waitUntil`, fire-and-forget after the
  response. That is fine for a Telegram ping (losing one is harmless) and wrong for a database write you
  need (see [lesson 22](./22-ai-chat-feature.md)). The rule that fell out: await what must persist, fire
  and forget what is only a nicety.

**Why.** `request.cf` gives you analytics-grade visitor data with zero third-party scripts. Telegram turns
your phone into a live feed of the product. Resend means a real person can reach you. None of it is the
recommender; all of it is what makes the recommender a product someone runs.

**How to use it.**

1. Put every credential behind `wrangler secret put`. The repo stays clean; `.dev.vars` covers local dev.
2. Treat notifications as best-effort: wrap them so a flaky integration never breaks the user's request.
3. Read `request.cf` for geo, ASN, colo, and timezone. Parse the user agent for browser and OS.

**Gotchas.**

- With a shared email sender you can only reach your own inbox. Verify a domain to send anywhere.
- A slow or failing integration in the request path will stall the user. Keep it off the critical path.
- `request.cf` fields can be undefined locally. Guard them, do not assume they are always present.
