import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookies, isExternalPrioritySource, normalizeSessionSource, setSessionCookies } from "@/lib/server-session";

function getBackendBaseUrl() {
  const raw =
    process.env.BACKEND_URL ||
    process.env.AGENT_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_AGENT_API_URL ||
    "http://localhost:3001";

  return raw
    .replace(/\/api\/agent\/query\/?$/, "")
    .replace(/\/api\/agent\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "");
}

function sourceFromPayload(payload: any): string {
  const direct =
    payload?.session_source ||
    payload?.sessionSource ||
    payload?.source ||
    payload?.provider ||
    payload?.external_source ||
    payload?.externalSource ||
    payload?.external_provider ||
    payload?.externalProvider ||
    "";
  const normalized = normalizeSessionSource(direct);
  if (normalized) return normalized;

  try {
    const target = new URL(String(payload?.url || ""));
    return normalizeSessionSource(
      target.searchParams.get("provider") ||
        target.searchParams.get("source") ||
        target.searchParams.get("external_source") ||
        target.searchParams.get("channel") ||
        "",
    );
  } catch {
    return "";
  }
}

function redirectUrlWithSessionSource(rawUrl: string, source: string): string {
  const normalizedSource = normalizeSessionSource(source);
  if (!isExternalPrioritySource(normalizedSource)) return rawUrl;

  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.get("source")) url.searchParams.set("source", normalizedSource);
    if (!url.searchParams.get("session_scope")) url.searchParams.set("session_scope", normalizedSource);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

async function resolveShortLinkPayload(req: NextRequest, encodedCode: string) {
  const internalSecret = String(process.env.SHORT_LINK_PROXY_SECRET || process.env.INTERNAL_API_SECRET || "").trim();
  const directHeaders: Record<string, string> = {};
  if (internalSecret) directHeaders["x-internal-api-secret"] = internalSecret;

  const direct = await fetch(
    `${getBackendBaseUrl()}/api/external/short-links/${encodedCode}?include_session=1`,
    {
      cache: "no-store",
      headers: directHeaders,
    },
  ).catch(() => null as any);
  const directPayload = await direct?.json().catch(() => ({}));
  if (direct?.ok && directPayload?.url) return directPayload;

  const proxied = await fetch(
    `${req.nextUrl.origin}/api/external/short-links/${encodedCode}?include_session=1`,
    { cache: "no-store" },
  ).catch(() => null as any);
  const proxiedPayload = await proxied?.json().catch(() => ({}));
  if (proxied?.ok && proxiedPayload?.url) return proxiedPayload;
  return null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const params = await context.params;
  const rawCode = String(params.code || "").trim();
  const code = rawCode.replace(/^[\s"'`([{<]+|[\s"'`)\]}>.,;:!?]+$/g, "");
  const encodedCode = encodeURIComponent(code);

  const payload = await resolveShortLinkPayload(req, encodedCode);

  if (!payload?.url) {
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  const sessionSource = sourceFromPayload(payload);
  const redirect = NextResponse.redirect(redirectUrlWithSessionSource(String(payload.url), sessionSource));
  const sessionId = String(payload.session_id || payload.sessionId || "").trim();
  const sessionToken = String(payload.session_token || payload.sessionToken || "").trim();
  if (isExternalPrioritySource(sessionSource) && !sessionId && !sessionToken) {
    clearSessionCookies(redirect, sessionSource);
  }
  setSessionCookies(redirect, {
    sessionId,
    sessionToken,
    sessionSource,
  });
  redirect.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return redirect;
}
