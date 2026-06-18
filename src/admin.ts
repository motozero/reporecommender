// Password-protected /admin dashboard: recent chats, repo clicks, searches, and
// contact messages, so the owner can see activity without clicking each Telegram
// link. HTTP Basic auth against the ADMIN_PASSWORD secret.

export interface AdminEnv {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
}

export async function handleAdmin(request: Request, env: AdminEnv): Promise<Response> {
  if (!env.ADMIN_PASSWORD) {
    return new Response("Admin is not configured. Set ADMIN_PASSWORD with `wrangler secret put`.", {
      status: 503,
      headers: { "content-type": "text/plain" },
    });
  }
  if (!authorized(request, env.ADMIN_PASSWORD)) {
    return new Response("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="reporecommender admin", charset="UTF-8"' },
    });
  }

  const [chats, clicks, searches, contacts] = await Promise.all([
    query(
      env,
      "SELECT s.id, s.created_at, s.repo, s.visitor_id, s.city, s.country, s.browser, (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) AS msgs FROM chat_sessions s ORDER BY s.rowid DESC LIMIT 50",
    ),
    query(env, "SELECT created_at, repo, visitor_id, city, country, browser FROM events WHERE type='repo_click' ORDER BY rowid DESC LIMIT 50"),
    query(env, "SELECT created_at, input, goal, city, country, browser FROM usage ORDER BY rowid DESC LIMIT 50"),
    query(env, "SELECT created_at, name, email, city, country, message FROM messages ORDER BY rowid DESC LIMIT 30"),
  ]);

  return new Response(adminHtml({ chats, clicks, searches, contacts }), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function authorized(request: Request, password: string): boolean {
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Basic (.+)$/);
  if (!m) return false;
  let decoded = "";
  try {
    decoded = atob(m[1]!);
  } catch {
    return false;
  }
  const given = decoded.slice(decoded.indexOf(":") + 1); // ignore the username
  // Constant-time-ish compare.
  if (given.length !== password.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ password.charCodeAt(i);
  return diff === 0;
}

async function query(env: AdminEnv, sql: string): Promise<Record<string, unknown>[]> {
  try {
    const r = await env.DB.prepare(sql).all();
    return (r.results as Record<string, unknown>[]) || [];
  } catch (err) {
    console.log("admin query error", err instanceof Error ? err.message : String(err));
    return [];
  }
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const when = (iso: unknown): string => String(iso ?? "").slice(0, 16).replace("T", " ");
const vshort = (v: unknown): string => String(v ?? "").slice(0, 8);
const place = (row: Record<string, unknown>): string => [row.city, row.country].filter(Boolean).map(esc).join(", ") || "?";

interface AdminData {
  chats: Record<string, unknown>[];
  clicks: Record<string, unknown>[];
  searches: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
}

function adminHtml(d: AdminData): string {
  const chatRows = d.chats
    .map(
      (r) =>
        `<tr><td>${esc(when(r.created_at))}</td><td><a href="https://github.com/${esc(r.repo)}" target="_blank" rel="noopener">${esc(r.repo)}</a></td><td>${esc(r.msgs)}</td><td>${esc(vshort(r.visitor_id))}</td><td>${place(r)}</td><td>${esc(r.browser)}</td><td><a href="/c/${esc(r.id)}" target="_blank" rel="noopener">view</a></td></tr>`,
    )
    .join("");
  const clickRows = d.clicks
    .map(
      (r) =>
        `<tr><td>${esc(when(r.created_at))}</td><td><a href="https://github.com/${esc(r.repo)}" target="_blank" rel="noopener">${esc(r.repo)}</a></td><td>${esc(vshort(r.visitor_id))}</td><td>${place(r)}</td><td>${esc(r.browser)}</td></tr>`,
    )
    .join("");
  const searchRows = d.searches
    .map((r) => `<tr><td>${esc(when(r.created_at))}</td><td>${esc(r.input)}</td><td>${esc(r.goal)}</td><td>${place(r)}</td><td>${esc(r.browser)}</td></tr>`)
    .join("");
  const contactRows = d.contacts
    .map(
      (r) =>
        `<tr><td>${esc(when(r.created_at))}</td><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${place(r)}</td><td>${esc(String(r.message ?? "").slice(0, 140))}</td></tr>`,
    )
    .join("");

  const section = (title: string, headers: string[], rows: string, empty: string) =>
    `<h2>${esc(title)}</h2>${rows ? `<table><thead><tr>${headers.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">${esc(empty)}</p>`}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/>
<title>Repo Recommender admin</title>
<style>
:root{--bg:#0b0f10;--panel:#131a1c;--ink:#e8f0ee;--muted:#8aa0a0;--green:#21c08b;--line:#223033}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{width:min(1100px,94vw);margin:0 auto;padding:28px 0 64px}
h1{font-size:20px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 24px;font-size:13px}
h2{font-size:15px;margin:30px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--muted);font-weight:600;padding:7px 10px;border-bottom:1px solid var(--line)}
td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:hover td{background:var(--panel)}
a{color:var(--green);text-decoration:none}a:hover{text-decoration:underline}
.empty{color:var(--muted)}
.counts{display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font-size:13px}
.counts b{color:var(--ink)}
</style></head><body><div class="wrap">
<h1>Repo Recommender admin</h1>
<p class="sub">Anonymous activity. No emails required.</p>
<div class="counts"><span><b>${d.chats.length}</b> chats</span><span><b>${d.clicks.length}</b> repo clicks</span><span><b>${d.searches.length}</b> searches</span><span><b>${d.contacts.length}</b> messages</span></div>
${section("Chats", ["When", "Repo", "Msgs", "Visitor", "Where", "Browser", ""], chatRows, "No chats yet.")}
${section("Repo clicks", ["When", "Repo", "Visitor", "Where", "Browser"], clickRows, "No clicks yet.")}
${section("Searches", ["When", "Project", "Goal", "Where", "Browser"], searchRows, "No searches yet.")}
${section("Contact messages", ["When", "Name", "Email", "Where", "Message"], contactRows, "No messages yet.")}
</div></body></html>`;
}
