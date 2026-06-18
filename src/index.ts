import { recommend, type EngineEnv } from "./engine";
import { RecommenderMCP } from "./mcp";

export { RecommenderMCP };

export interface Env extends EngineEnv {
  ASSETS: Fetcher;
  MCP_OBJECT: DurableObjectNamespace;
  // Contact form (set with `wrangler secret put`, kept out of the repo). When
  // unset, /api/contact returns a clear "not configured" error.
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
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
      return Response.json({ ok: true, service: "reporecommender", version: "0.3.0" });
    }

    if (url.pathname === "/api/recommend" && request.method === "POST") {
      return handleRecommend(request, env);
    }

    if (url.pathname === "/api/contact" && request.method === "POST") {
      return handleContact(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleRecommend(request: Request, env: Env): Promise<Response> {
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

  try {
    const result = await recommend(repoUrl, goal, env);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return Response.json({ error: message }, { status: 502 });
  }
}

async function handleContact(request: Request, env: Env): Promise<Response> {
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

  if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL) {
    return Response.json({ error: "Contact is not configured on the server yet." }, { status: 503 });
  }

  // Resend delivers the message to the site owner's inbox. The visitor's address
  // goes in reply_to so a reply lands straight back with them.
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
    return Response.json({ error: "Could not send the message. Please try again later." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
