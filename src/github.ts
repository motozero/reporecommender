// GitHub REST helpers. The engine calls these server-side; we never expose the
// token to the browser. A token is optional but lifts the rate limit from 60 to
// 5000 requests per hour. See lessons/14-secrets-and-keys.md.

const API = "https://api.github.com";
const UA = "reporecommender (https://reporecommender.com)";

export interface RepoMeta {
  fullName: string;
  owner: string;
  repo: string;
  description: string | null;
  stars: number;
  language: string | null;
  topics: string[];
  pushedAt: string | null;
  license: string | null;
  archived: boolean;
  openIssues: number;
  url: string;
}

function headers(token?: string): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/** Accept a full GitHub URL or a bare "owner/repo" string. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  const pair = fromUrl
    ? [fromUrl[1], fromUrl[2]]
    : trimmed.match(/^([^/\s]+)\/([^/\s]+)$/)?.slice(1);
  if (!pair) return null;
  const owner = pair[0];
  const repo = pair[1].replace(/\.git$/, "");
  if (!owner || !repo) return null;
  return { owner, repo };
}

export async function getRepo(owner: string, repo: string, token?: string): Promise<RepoMeta> {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub repo ${owner}/${repo}: ${res.status}`);
  const d = (await res.json()) as Record<string, any>;
  return {
    fullName: d.full_name,
    owner: d.owner?.login ?? owner,
    repo: d.name ?? repo,
    description: d.description ?? null,
    stars: d.stargazers_count ?? 0,
    language: d.language ?? null,
    topics: Array.isArray(d.topics) ? d.topics : [],
    pushedAt: d.pushed_at ?? null,
    license: d.license?.spdx_id ?? null,
    archived: Boolean(d.archived),
    openIssues: d.open_issues_count ?? 0,
    url: d.html_url ?? `https://github.com/${owner}/${repo}`,
  };
}

/** README as plain text, truncated to keep token cost down. Empty string if none. */
export async function getReadme(
  owner: string,
  repo: string,
  token?: string,
  maxChars = 6000,
): Promise<string> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/readme`, { headers: headers(token) });
  if (!res.ok) return "";
  const d = (await res.json()) as { content?: string; encoding?: string };
  if (!d.content || d.encoding !== "base64") return "";
  const bytes = Uint8Array.from(atob(d.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  return text.slice(0, maxChars);
}

/** Search repos, most-starred first. Excludes the source repo if it shows up. */
export async function searchRepos(
  query: string,
  token?: string,
  perPage = 8,
  exclude?: string,
): Promise<RepoMeta[]> {
  const url = `${API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perPage}`;
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub search: ${res.status}`);
  const d = (await res.json()) as { items?: Record<string, any>[] };
  const items = d.items ?? [];
  return items
    .filter((it) => it.full_name?.toLowerCase() !== exclude?.toLowerCase())
    .map((it) => ({
      fullName: it.full_name,
      owner: it.owner?.login ?? "",
      repo: it.name ?? "",
      description: it.description ?? null,
      stars: it.stargazers_count ?? 0,
      language: it.language ?? null,
      topics: Array.isArray(it.topics) ? it.topics : [],
      pushedAt: it.pushed_at ?? null,
      license: it.license?.spdx_id ?? null,
      archived: Boolean(it.archived),
      openIssues: it.open_issues_count ?? 0,
      url: it.html_url ?? "",
    }));
}
