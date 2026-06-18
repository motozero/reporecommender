// Two anonymous-visitor features over D1:
//   1. events  - log when a visitor clicks a recommended repo.
//   2. chat    - let a visitor chat with Claude about a specific repo; store the
//      session and message it to the owner with a link to the transcript.
// No email or login: visitor_id is a random id the browser keeps in localStorage.

import { parseRepo, getRepo, getReadme } from "./github";
import { callClaudeMessages, MODELS, type ChatTurn } from "./claude";
import { visitor, notify, tgEsc, locationLine, networkLine, type Visitor } from "./telemetry";

export interface ChatEnv {
  ANTHROPIC_API_KEY: string;
  GITHUB_TOKEN?: string;
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

const vid8 = (id: string) => (id || "anon").slice(0, 8);
const now = () => new Date().toISOString();

// POST /api/event - a visitor clicked a recommended repo (or similar).
export async function handleEvent(request: Request, env: ChatEnv, ctx: ExecutionContext): Promise<Response> {
  let body: { visitorId?: string; type?: string; repo?: string; input?: string; goal?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const type = (body.type ?? "").trim() || "event";
  const v = visitor(request);
  const vId = (body.visitorId ?? "").slice(0, 64);
  const repo = (body.repo ?? "").slice(0, 200);
  const input = (body.input ?? "").slice(0, 300);
  const goal = (body.goal ?? "").slice(0, 300);

  ctx.waitUntil(
    (async () => {
      try {
        await env.DB.prepare(
          "INSERT INTO events (created_at, visitor_id, type, repo, input, goal, ip, user_agent, browser, os, asn, as_org, country, city, region) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
          .bind(now(), vId, type, repo, input, goal, v.ip, v.ua, v.browser, v.os, v.asn, v.asOrg, v.country, v.city, v.region)
          .run();
      } catch (err) {
        console.log("d1 events error", err instanceof Error ? err.message : String(err));
      }
      if (type === "repo_click" && repo) {
        await notify(
          env,
          [
            "👆 <b>Repo click</b>",
            `${tgEsc(vid8(vId))} opened ${tgEsc(repo)}`,
            input ? `Building: ${tgEsc(input)}${goal ? " / " + tgEsc(goal) : ""}` : "",
            `${tgEsc(locationLine(v))} · ${tgEsc(networkLine(v))} · ${tgEsc(v.browser)}/${tgEsc(v.os)}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    })(),
  );
  return Response.json({ ok: true });
}

// POST /api/chat - one turn of a chat about a repo. Stores the turn and returns
// Claude's reply. On the first turn it pings the owner with a transcript link.
export async function handleChat(request: Request, env: ChatEnv, ctx: ExecutionContext): Promise<Response> {
  let body: { visitorId?: string; sessionId?: string; repo?: string; input?: string; goal?: string; message?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const sessionId = (body.sessionId ?? "").trim();
  const repo = (body.repo ?? "").trim();
  const message = (body.message ?? "").trim();
  if (!sessionId || !repo || !message) {
    return Response.json({ error: "sessionId, repo, and message are required." }, { status: 400 });
  }
  if (message.length > 2000) return Response.json({ error: "Message is too long." }, { status: 400 });
  if (!env.ANTHROPIC_API_KEY) return Response.json({ error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });

  const v = visitor(request);
  const vId = (body.visitorId ?? "").slice(0, 64);
  const input = (body.input ?? "").slice(0, 300);
  const goal = (body.goal ?? "").slice(0, 300);

  // New session? (drives the Telegram ping and the session row.)
  let isNew = false;
  try {
    const existing = await env.DB.prepare("SELECT id FROM chat_sessions WHERE id=?").bind(sessionId).first();
    isNew = !existing;
    if (isNew) {
      await env.DB.prepare(
        "INSERT INTO chat_sessions (id, created_at, visitor_id, repo, input, goal, ip, user_agent, browser, os, asn, as_org, country, city, region) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(sessionId, now(), vId, repo, input, goal, v.ip, v.ua, v.browser, v.os, v.asn, v.asOrg, v.country, v.city, v.region)
        .run();
    }
  } catch (err) {
    console.log("d1 chat_sessions error", err instanceof Error ? err.message : String(err));
  }

  // Prior turns for context (oldest first), capped.
  let history: ChatTurn[] = [];
  try {
    const rows = await env.DB.prepare("SELECT role, content FROM chat_messages WHERE session_id=? ORDER BY id").bind(sessionId).all();
    history = (rows.results as { role: string; content: string }[]).map((r): ChatTurn => ({
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
    }));
  } catch {
    /* no history yet */
  }

  let reply: string;
  try {
    const system = await buildSystem(repo, input, goal, env);
    reply = await callClaudeMessages({
      apiKey: env.ANTHROPIC_API_KEY,
      model: MODELS.sonnet,
      system,
      messages: [...history, { role: "user" as const, content: message }].slice(-12),
      maxTokens: 700,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Chat failed." }, { status: 502 });
  }

  // Persist the turn (do not block the response on it).
  ctx.waitUntil(
    (async () => {
      try {
        await env.DB.prepare("INSERT INTO chat_messages (session_id, created_at, role, content) VALUES (?,?,?,?)").bind(sessionId, now(), "user", message).run();
        await env.DB.prepare("INSERT INTO chat_messages (session_id, created_at, role, content) VALUES (?,?,?,?)").bind(sessionId, now(), "assistant", reply).run();
      } catch (err) {
        console.log("d1 chat_messages error", err instanceof Error ? err.message : String(err));
      }
      if (isNew) {
        const link = `https://reporecommender.com/c/${sessionId}`;
        await notify(
          env,
          [
            "💬 <b>New chat with a repo</b>",
            `${tgEsc(vid8(vId))} is chatting with ${tgEsc(repo)}`,
            input ? `Building: ${tgEsc(input)}${goal ? " / " + tgEsc(goal) : ""}` : "",
            `${tgEsc(locationLine(v))} · ${tgEsc(v.browser)}/${tgEsc(v.os)}`,
            `Transcript: ${link}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    })(),
  );

  return Response.json({ reply });
}

async function buildSystem(repo: string, input: string, goal: string, env: ChatEnv): Promise<string> {
  let context = `Repo: ${repo}`;
  const parsed = parseRepo(repo);
  if (parsed) {
    try {
      const meta = await getRepo(parsed.owner, parsed.repo, env.GITHUB_TOKEN);
      const readme = await getReadme(parsed.owner, parsed.repo, env.GITHUB_TOKEN, 3500);
      context = [
        `Repo: ${meta.fullName}`,
        `Description: ${meta.description ?? "(none)"}`,
        `Language: ${meta.language ?? "(unknown)"} | Stars: ${meta.stars}`,
        "",
        "README excerpt:",
        readme.slice(0, 3500) || "(no README)",
      ].join("\n");
    } catch {
      /* fall back to just the name */
    }
  }
  return [
    `You are a concise, friendly guide to the GitHub repo ${repo}.`,
    input ? `The visitor is working on ${input}${goal ? ` and wants to ${goal}` : ""}.` : "",
    "Help them understand what it does, whether it fits their goal, how to add it, and any tradeoffs.",
    "Answer in a few short sentences. Be concrete. No em dashes. If you are unsure, say so.",
    "",
    "Context about the repo:",
    context,
  ]
    .filter(Boolean)
    .join("\n");
}

// GET /c/<id> - read-only transcript. The unguessable session id is the access key.
export async function renderTranscript(sessionId: string, env: ChatEnv): Promise<Response> {
  let session: Record<string, unknown> | null = null;
  let messages: { role: string; content: string }[] = [];
  try {
    session = await env.DB.prepare("SELECT * FROM chat_sessions WHERE id=?").bind(sessionId).first();
    if (session) {
      const rows = await env.DB.prepare("SELECT role, content FROM chat_messages WHERE session_id=? ORDER BY id").bind(sessionId).all();
      messages = rows.results as { role: string; content: string }[];
    }
  } catch (err) {
    console.log("d1 transcript error", err instanceof Error ? err.message : String(err));
  }
  if (!session) {
    return new Response("Transcript not found.", { status: 404, headers: { "content-type": "text/plain" } });
  }
  return new Response(transcriptHtml(session, messages), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const h = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function transcriptHtml(session: Record<string, unknown>, messages: { role: string; content: string }[]): string {
  const geo = [session.city, session.region, session.country].filter(Boolean).join(", ") || "unknown location";
  const net = session.asn ? `AS${session.asn} ${session.as_org ?? ""}` : String(session.as_org ?? "unknown network");
  const bubbles = messages
    .map(
      (m) =>
        `<div class="msg ${m.role === "assistant" ? "a" : "u"}"><span class="who">${m.role === "assistant" ? "repo" : "visitor"}</span><div class="bubble">${h(m.content)}</div></div>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Chat transcript: ${h(session.repo)}</title>
<style>
:root{--bg:#0b0f10;--panel:#131a1c;--panel2:#182123;--ink:#e8f0ee;--muted:#8aa0a0;--green:#21c08b;--line:#223033}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{width:min(720px,92vw);margin:0 auto;padding:32px 0 64px}
h1{font-size:18px;margin:0 0 4px}.meta{color:var(--muted);font-size:13px;margin:0 0 22px}
.msg{margin:0 0 14px;display:flex;flex-direction:column}.msg.u{align-items:flex-end}.who{font-size:11px;color:var(--muted);margin:0 4px 4px}
.bubble{max-width:80%;padding:10px 13px;border-radius:12px;white-space:pre-wrap;border:1px solid var(--line)}
.msg.a .bubble{background:var(--panel)}.msg.u .bubble{background:var(--panel2)}
a{color:var(--green)}
</style></head><body><div class="wrap">
<h1>Chat about <a href="https://github.com/${h(session.repo)}" target="_blank" rel="noopener">${h(session.repo)}</a></h1>
<p class="meta">visitor ${h(String(session.visitor_id ?? "").slice(0, 8))} · ${h(geo)} · ${h(net)} · ${h(session.browser)}/${h(session.os)}${session.input ? ` · building ${h(session.input)}${session.goal ? " / " + h(session.goal) : ""}` : ""}</p>
${bubbles || '<p class="meta">No messages.</p>'}
</div></body></html>`;
}
