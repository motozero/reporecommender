# Lesson 22: building an AI chat feature

![Chat with a repo: a card opens /api/chat, which loads README context and prior turns from D1, calls Claude, returns a reply, stores the turn, and pings Telegram with a transcript link](./assets/chat-with-a-repo-handdrawn.png)

**What it is.** Chat with a repo. Every result card has a Chat button that opens a conversation with
Claude about that one repo. It is the clearest "using agents" piece in the project: a scoped assistant,
grounded in a specific repo's docs, that remembers the conversation.

**How we used it here.** The button opens a modal and posts to `/api/chat`. On the server, three things
make the answer good and the feature real:

- **Grounding.** We fetch the repo's README and metadata and put them in the system prompt, plus the
  visitor's own project and goal. The model answers about this repo for this person, not from generic
  memory.
- **Memory.** Prior turns load from D1 and go into the multi-turn `messages` array, so follow-ups make
  sense. That is what `callClaudeMessages` is for.
- **A record.** Each turn is written to D1 and the owner gets a Telegram ping with a link to the live
  transcript at `/c/<session_id>`.

A scoped, grounded, remembered model is the difference between a chatbot and a useful agent. The grounding
keeps it honest, the memory makes it coherent, the record makes it observable.

**The war story (durability in serverless).** The first version stored each turn in `ctx.waitUntil`, after
the response returned. The runtime is allowed to drop that work, so follow-up messages silently failed to
save. The owner saw only the opening of conversations even when visitors kept going. The fix: write each
turn with an awaited `INSERT` before responding, and save the user's message even if the model call fails.
The lesson generalizes: in a serverless function, anything you must keep gets awaited, not deferred.

**How to use it.**

1. Ground the model in real context (here, the README), not just a name. Specific beats generic.
2. Persist conversation state so multi-turn actually works, and load it back as the model's history.
3. Await the writes that matter. Notifications can be fire-and-forget (see
   [lesson 21](./21-integrations-email-and-notifications.md)); the transcript cannot.

**Gotchas.**

- Cap the history you send, or long chats balloon the token bill.
- Every turn is a model call. Use a cheaper tier or a per-visitor rate limit if traffic grows.
- People will try to jailbreak it. Keep the system prompt scoped, and log turns so you can see attempts.
