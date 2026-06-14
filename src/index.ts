import { recommend, type EngineEnv } from "./engine";

export interface Env extends EngineEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, service: "reporecommender", version: "0.2.0" });
    }

    if (url.pathname === "/api/recommend" && request.method === "POST") {
      return handleRecommend(request, env);
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
