import { recommend, type EngineEnv } from "./engine";
import { RecommenderMCP } from "./mcp";
import { handleEvent, handleChat, renderTranscript } from "./chat";
import { handleAdmin } from "./admin";
import { visitor, notify, tgEsc, locationLine, networkLine, type Visitor } from "./telemetry";

export { RecommenderMCP };

export interface Env extends EngineEnv {
  ASSETS: Fetcher;
  MCP_OBJECT: DurableObjectNamespace;
  DB: D1Database;
  // Contact + notifications. Set with `wrangler secret put`, kept out of the repo.
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  ADMIN_PASSWORD?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Surface 2: our own MCP server (Streamable HTTP at /mcp, SSE at /sse).
    if (url.pathname === "/mcp") {
      return RecommenderMCP.serve("/mcp").fetch(request, env, ctx);
    }
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return RecommenderMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "reporecommender", version: "0.5.0" });
    }

    if (url.pathname === "/api/recommend" && request.method === "POST") {
      return handleRecommend(request, env, ctx);
    }

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env, ctx);
    }

    if (url.pathname === "/api/event" && request.method === "POST") {
      return handleEvent(request, env, ctx);
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, env, ctx);
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    // Read-only chat transcript at /c/<session_id>.
    if (url.pathname.startsWith("/c/") && request.method === "GET") {
      const id = url.pathname.slice(3);
      if (id) return renderTranscript(id, env);
    }

    // Password-protected activity dashboard.
    if (url.pathname === "/admin" && request.method === "GET") {
      return handleAdmin(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleRecommend(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: { repoUrl?: string; goal?: string };
  try {
    body = (await request.json()) as { repoUrl?: string; goal?: string };
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const repoUrl = (body.repoUrl ?? "").trim();
  const goal = (body.goal ?? "").trim();
  if (!repoUrl) return Response.json({ error: "repoUrl is required." }, { status: 400 });
  if (!goal) return Response.json({ error: "goal is required." }, { status: 400 });
  if (goal.length > 300) return Response.json({ error: "goal is too long (max 300 chars)." }, { status: 400 });
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }

  // Someone is trying the tool. Record who (geo, network, device) and ping
  // Telegram, without blocking or breaking the request if either is unconfigured.
  const v = visitor(request);
  ctx.waitUntil(Promise.allSettled([logUsage(env, repoUrl, goal, v), notify(env, usageText(repoUrl, goal, v))]));

  try {
    const result = await recommend(repoUrl, goal, env);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return Response.json({ error: message }, { status: 502 });
  }
}

async function handleContact(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: { name?: string; email?: string; message?: string; website?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // Honeypot: bots tend to fill the hidden "website" field. Accept and drop it
  // silently so they get no signal that they were caught.
  if ((body.website ?? "").trim()) return Response.json({ ok: true });

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const message = (body.message ?? "").trim();
  if (!name || !email || !message) {
    return Response.json({ error: "Name, email, and message are required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "That email does not look valid." }, { status: 400 });
  }
  if (name.length > 120 || email.length > 200 || message.length > 4000) {
    return Response.json({ error: "One of the fields is too long." }, { status: 400 });
  }

  const v = visitor(request);

  // D1 is the durable record, so a message is never lost even if email or
  // Telegram is down. Email and Telegram are best-effort notifications on top.
  let stored = false;
  if (env.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO messages (created_at, name, email, message, ip, user_agent, asn, as_org, country, city, region) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
        .bind(new Date().toISOString(), name, email, message, v.ip, v.ua, v.asn, v.asOrg, v.country, v.city, v.region)
        .run();
      stored = true;
    } catch (err) {
      console.log("d1 messages error", err instanceof Error ? err.message : String(err));
    }
  }

  const emailPromise = sendContactEmail(env, name, email, message);
  const tgPromise = notify(env, contactText(name, email, message, v));

  if (stored) {
    ctx.waitUntil(Promise.allSettled([emailPromise, tgPromise]));
    return Response.json({ ok: true });
  }

  // No durable store available (e.g. local dev without D1): only claim success
  // if a notification actually went out.
  const emailOk = await emailPromise;
  await tgPromise;
  if (emailOk || (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)) return Response.json({ ok: true });
  if (!env.RESEND_API_KEY && !env.TELEGRAM_BOT_TOKEN) {
    return Response.json({ error: "Contact is not configured on the server yet." }, { status: 503 });
  }
  return Response.json({ error: "Could not send the message. Please try again later." }, { status: 502 });
}

async function logUsage(env: Env, input: string, goal: string, v: Visitor): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO usage (created_at, input, goal, ip, user_agent, browser, os, asn, as_org, country, city, region, timezone, colo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
      .bind(new Date().toISOString(), input, goal, v.ip, v.ua, v.browser, v.os, v.asn, v.asOrg, v.country, v.city, v.region, v.timezone, v.colo)
      .run();
  } catch (err) {
    console.log("d1 usage error", err instanceof Error ? err.message : String(err));
  }
}

async function sendContactEmail(env: Env, name: string, email: string, message: string): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL) return false;
  try {
    const from = env.CONTACT_FROM_EMAIL || "Repo Recommender <onboarding@resend.dev>";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [env.CONTACT_TO_EMAIL],
        reply_to: email,
        subject: `Repo Recommender contact from ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
      }),
    });
    if (!res.ok) {
      console.log("resend error", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.log("resend exception", err instanceof Error ? err.message : String(err));
    return false;
  }
}

function usageText(input: string, goal: string, v: Visitor): string {
  return [
    "🔎 <b>Someone tried Repo Recommender</b>",
    `Input: ${tgEsc(input)}`,
    `Goal: ${tgEsc(goal)}`,
    `Where: ${tgEsc(locationLine(v))}`,
    `Network: ${tgEsc(networkLine(v))}`,
    `Device: ${tgEsc(v.browser)} on ${tgEsc(v.os)}`,
    v.colo ? `Edge: ${tgEsc(v.colo)}` : "",
    v.ip ? `IP: ${tgEsc(v.ip)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function contactText(name: string, email: string, message: string, v: Visitor): string {
  return [
    "✉️ <b>New contact message</b>",
    `From: ${tgEsc(name)} (${tgEsc(email)})`,
    `Where: ${tgEsc(locationLine(v))}`,
    `Network: ${tgEsc(networkLine(v))}`,
    `Device: ${tgEsc(v.browser)} on ${tgEsc(v.os)}`,
    "",
    tgEsc(message),
  ].join("\n");
}
