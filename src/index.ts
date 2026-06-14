export interface Env {
  ASSETS: Fetcher;
  // Added in later lessons:
  // DB: D1Database;
  // ANTHROPIC_API_KEY: string;
  // GITHUB_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API routes live under /api/*. Everything else is served by the
    // static frontend (the ASSETS binding).
    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "reporecommender",
        version: "0.1.0",
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
