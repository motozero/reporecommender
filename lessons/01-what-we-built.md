# Lesson 1: what we built, and what we are building

**What it is.** The framing lesson. Before any features, ground the team in the real example, because
a concrete artifact you can open, run, and read beats an abstract tour of features.

**The story.** RepoRadar.io won second place out of 302 teams at the Generative UI Global Hackathon,
vibe-coded in a single session. It works, and it is genuinely impressive. But it was built fast, not
built to be owned by a team.

**Repo Recommender** is the next idea, built the disciplined way with Claude Code:

- Plan mode to lock the approach before writing code.
- A `CLAUDE.md` that steers every session.
- Custom skills and a commit-blocking quality hook.
- A recommendation engine with model tiering (Haiku to extract, Sonnet to reason).
- Two surfaces over one engine: a website for humans and an MCP server for agents.
- Shipped to a live domain, reporecommender.com, with secrets in Cloudflare.

**The contrast that runs through this whole book.** Vibe coding gets you a demo. Disciplined Claude
Code gets you something a team can own, extend, and trust: readable history, enforced guardrails,
governance written down, and every decision visible. This book teaches the second.

**Why start here.** Every later lesson points back to a real file in this repo. When you learn hooks,
you can open the hook we wrote. When you learn MCP, you can call the server we shipped. The example is
the spine; the lessons hang off it.

**How to use it.** When you onboard a team to Claude Code, lead with the artifact and the goal, not the
feature list. Show them something real, then explain how it was made.
