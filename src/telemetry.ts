// Visitor signals (geo, network, device) and Telegram notifications. Shared by
// the Web API surface (index.ts) and the chat surface (chat.ts).

export interface Visitor {
  ip: string;
  ua: string;
  browser: string;
  os: string;
  asn: number | null;
  asOrg: string;
  country: string;
  city: string;
  region: string;
  timezone: string;
  colo: string;
}

// Cloudflare attaches rich request metadata on `request.cf`, the same signals a
// site analytics tool surfaces. User agent gives browser and OS.
export function visitor(request: Request): Visitor {
  const cf = (request.cf ?? {}) as Record<string, unknown>;
  const ua = request.headers.get("user-agent") ?? "";
  const str = (k: string) => (typeof cf[k] === "string" ? (cf[k] as string) : "");
  const { browser, os } = parseUA(ua);
  return {
    ip: request.headers.get("cf-connecting-ip") ?? "",
    ua,
    browser,
    os,
    asn: typeof cf.asn === "number" ? (cf.asn as number) : null,
    asOrg: str("asOrganization"),
    country: str("country"),
    city: str("city"),
    region: str("region"),
    timezone: str("timezone"),
    colo: str("colo"),
  };
}

export function parseUA(ua: string): { browser: string; os: string } {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Unknown";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown";
  return { browser, os };
}

export const tgEsc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function locationLine(v: Visitor): string {
  const geo = [v.city, v.region, v.country].filter(Boolean).join(", ") || "unknown location";
  return v.timezone ? `${geo} (${v.timezone})` : geo;
}

export function networkLine(v: Visitor): string {
  if (v.asn) return `AS${v.asn}${v.asOrg ? " " + v.asOrg : ""}`;
  return v.asOrg || "unknown network";
}

interface NotifyEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export async function notify(env: NotifyEnv, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.log("telegram error", err instanceof Error ? err.message : String(err));
  }
}
