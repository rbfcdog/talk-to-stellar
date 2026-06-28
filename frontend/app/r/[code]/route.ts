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
        target.searchParams.get("session_scope") ||
        target.searchParams.get("sessionScope") ||
        target.searchParams.get("session_source") ||
        target.searchParams.get("sessionSource") ||
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

function redirectUrlWithShortLinkCode(rawUrl: string, code: string): string {
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.get("short_link_code")) url.searchParams.set("short_link_code", code);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function linkUsedRedirect(req: NextRequest) {
  const url = new URL("/link-used", req.url);
  url.searchParams.set(
    "message",
    "Este link expirou ou já foi usado. Por segurança, os detalhes da operação não ficam mais disponíveis.",
  );
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

// The backend was unreachable/slow — the link is likely still valid. Don't show
// the alarming "expired/used" wall; offer a retry that re-resolves the same code.
function linkTransientRedirect(req: NextRequest, code: string) {
  const url = new URL("/link-used", req.url);
  url.searchParams.set("state", "transient");
  // Carry the original short link so the retry button can re-resolve it.
  if (code) url.searchParams.set("retry", `/r/${encodeURIComponent(code)}`);
  url.searchParams.set(
    "message",
    "Não conseguimos abrir este link agora (instabilidade momentânea). O link continua válido — tente novamente em instantes.",
  );
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

function linkCompletedRedirect(req: NextRequest) {
  const url = new URL("/link-used", req.url);
  url.searchParams.set("state", "completed");
  url.searchParams.set(
    "message",
    "This operation was already completed. The receipt was sent in chat and saved in history.",
  );
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

function isAccountAccessUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.pathname === "/login" || url.pathname === "/onboard" || url.pathname.startsWith("/login/");
  } catch {
    return /^\/?(login|onboard)(\/|\?|#|$)/i.test(String(rawUrl || "").trim());
  }
}

function usablePayload(payload: any): boolean {
  return Boolean(payload?.url || payload?.already_completed || payload?.completed);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null as any;
  } finally {
    clearTimeout(timer);
  }
}

// Resolve a short link, tolerating a slow/cold backend.
//
// Returns { payload, notFound }:
//  - payload set      → resolved, redirect the user.
//  - notFound: true   → the backend definitively answered 404 (genuinely
//                       expired/used) → show the "link unavailable" wall.
//  - notFound: false  → every attempt errored/timed out (cold start, 5xx,
//                       network) → the link may be perfectly valid, so we must
//                       NOT cry "expired". Show a transient/retry message.
async function resolveShortLinkPayload(
  req: NextRequest,
  encodedCode: string,
): Promise<{ payload: any | null; notFound: boolean }> {
  const internalSecret = String(process.env.SHORT_LINK_PROXY_SECRET || process.env.INTERNAL_API_SECRET || "").trim();
  const directHeaders: Record<string, string> = {};
  if (internalSecret) directHeaders["x-internal-api-secret"] = internalSecret;

  const directUrl = `${getBackendBaseUrl()}/api/external/short-links/${encodedCode}?include_session=1`;
  const proxiedUrl = `${req.nextUrl.origin}/api/external/short-links/${encodedCode}?include_session=1`;

  let sawDefinitiveNotFound = false;

  // A couple of attempts smooths over Railway/Vercel cold starts and blips.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const direct = await fetchWithTimeout(directUrl, { cache: "no-store", headers: directHeaders });
    const directPayload = await direct?.json().catch(() => ({}));
    if (direct?.ok && usablePayload(directPayload)) return { payload: directPayload, notFound: false };
    if (direct?.status === 404) sawDefinitiveNotFound = true;

    const proxied = await fetchWithTimeout(proxiedUrl, { cache: "no-store" });
    const proxiedPayload = await proxied?.json().catch(() => ({}));
    if (proxied?.ok && usablePayload(proxiedPayload)) return { payload: proxiedPayload, notFound: false };
    if (proxied?.status === 404) sawDefinitiveNotFound = true;

    // If the backend gave us a clean 404, the link is really gone — stop retrying.
    if (sawDefinitiveNotFound) break;
  }

  return { payload: null, notFound: sawDefinitiveNotFound };
}

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const params = await context.params;
  const rawCode = String(params.code || "").trim();
  const code = rawCode.replace(/^[\s"'`([{<]+|[\s"'`)\]}>.,;:!?]+$/g, "");
  const encodedCode = encodeURIComponent(code);

  const { payload, notFound } = await resolveShortLinkPayload(req, encodedCode);

  if (payload?.already_completed || payload?.completed) {
    return linkCompletedRedirect(req);
  }
  if (!payload?.url) {
    // Only call it "expired/used" when the backend definitively said 404.
    // Otherwise it was a transient failure and the link is probably fine.
    return notFound ? linkUsedRedirect(req) : linkTransientRedirect(req, code);
  }

  const sessionSource = sourceFromPayload(payload);
  const targetUrl = redirectUrlWithShortLinkCode(redirectUrlWithSessionSource(String(payload.url), sessionSource), code);
  const redirect = NextResponse.redirect(targetUrl);
  const sessionId = String(payload.session_id || payload.sessionId || "").trim();
  const sessionToken = String(payload.session_token || payload.sessionToken || "").trim();
  if (sessionId || sessionToken) {
    setSessionCookies(redirect, {
      sessionId,
      sessionToken,
      sessionSource,
    });
  } else if (isExternalPrioritySource(sessionSource) && isAccountAccessUrl(String(payload.url || ""))) {
    clearSessionCookies(redirect, sessionSource);
  }
  redirect.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return redirect;
}
