import { NextRequest, NextResponse } from "next/server";

export const SESSION_ID_COOKIE = "tts_session_id";
export const SESSION_TOKEN_COOKIE = "tts_session_token";
export const SESSION_SOURCE_COOKIE = "tts_session_source";
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const EXTERNAL_SESSION_SOURCES = new Set(["whatsapp", "telegram"]);

type SessionPair = {
  sessionId: string;
  sessionToken: string;
  sessionSource: string;
};

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

function cookieName(baseName: string, source?: string) {
  const normalized = normalizeSessionSource(source);
  return EXTERNAL_SESSION_SOURCES.has(normalized) ? `${baseName}_${normalized}` : baseName;
}

function parseCookieHeader(req: NextRequest | Request): Map<string, string> {
  const cookieHeader = req.headers.get("cookie") || "";
  const parsed = new Map<string, string>();
  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (!rawName) continue;
    parsed.set(rawName, decodeURIComponent(rawValue.join("=") || ""));
  }
  return parsed;
}

function requestUrlSearchParams(req: NextRequest | Request): URLSearchParams {
  try {
    const nextUrl = (req as NextRequest).nextUrl;
    if (nextUrl?.searchParams) return nextUrl.searchParams;
  } catch {
    // Fall through to Request.url parsing.
  }

  try {
    return new URL(req.url).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/** Extract sessionId + sessionToken from the incoming request's HttpOnly cookies. */
export function readSessionCookies(req: NextRequest | Request, preferredSource?: unknown): Partial<SessionPair> {
  const parsed = parseCookieHeader(req);
  const source = normalizeSessionSource(preferredSource);

  if (EXTERNAL_SESSION_SOURCES.has(source)) {
    const scoped = {
      sessionId: parsed.get(cookieName(SESSION_ID_COOKIE, source)) || "",
      sessionToken: parsed.get(cookieName(SESSION_TOKEN_COOKIE, source)) || "",
      sessionSource: parsed.get(cookieName(SESSION_SOURCE_COOKIE, source)) || source,
    };

    if (scoped.sessionId || scoped.sessionToken) return scoped;

    // Backward compatibility for sessions created before channel-scoped cookies.
    const legacySource = normalizeSessionSource(parsed.get(SESSION_SOURCE_COOKIE) || "");
    if (legacySource === source) {
      return {
        sessionId: parsed.get(SESSION_ID_COOKIE) || "",
        sessionToken: parsed.get(SESSION_TOKEN_COOKIE) || "",
        sessionSource: legacySource,
      };
    }

    return scoped;
  }

  const commonSource = normalizeSessionSource(parsed.get(SESSION_SOURCE_COOKIE) || "");
  if (EXTERNAL_SESSION_SOURCES.has(commonSource)) {
    return {
      sessionId: "",
      sessionToken: "",
      sessionSource: "",
    };
  }

  return {
    sessionId: parsed.get(SESSION_ID_COOKIE) || "",
    sessionToken: parsed.get(SESSION_TOKEN_COOKIE) || "",
    sessionSource: commonSource,
  };
}

export function normalizeSessionSource(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "telegram" || normalized.includes("telegram")) return "telegram";
  if (
    normalized === "whatsapp" ||
    normalized === "phone" ||
    normalized === "evolution" ||
    normalized === "whatsapp_evolution" ||
    normalized === "whatsapp-evolution" ||
    normalized.includes("whatsapp")
  ) return "whatsapp";
  if (normalized === "web" || normalized === "browser" || normalized === "chat" || normalized === "chat_link") return "web";
  return normalized;
}

export function isExternalPrioritySource(value: unknown): boolean {
  const source = normalizeSessionSource(value);
  return source === "telegram" || source === "whatsapp";
}

function extractSessionSource(payload: any): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = [
    payload.external_provider,
    payload.externalProvider,
    payload.provider,
    payload.channel,
    payload.sessionSource,
    payload.session_source,
    payload.external_source,
    payload.externalSource,
    payload.source,
    payload.from,
    payload.origin,
    payload.metadata?.external_provider,
    payload.metadata?.externalProvider,
    payload.metadata?.provider,
    payload.metadata?.channel,
    payload.metadata?.external_source,
    payload.metadata?.externalSource,
    payload.metadata?.source,
    payload.metadata?.from,
    payload.metadata?.origin,
  ];
  const normalized = candidates.map(normalizeSessionSource).filter(Boolean);
  return normalized.find((source) => EXTERNAL_SESSION_SOURCES.has(source)) || normalized[0] || "";
}

export function requestSessionSource(req: NextRequest | Request, payload?: any): string {
  const payloadSource = extractSessionSource(payload);
  if (payloadSource) return payloadSource;

  const params = requestUrlSearchParams(req);
  const candidates = [
    params.get("external_provider"),
    params.get("externalProvider"),
    params.get("provider"),
    params.get("channel"),
    params.get("session_source"),
    params.get("sessionSource"),
    params.get("external_source"),
    params.get("externalSource"),
    params.get("source"),
    params.get("from"),
    params.get("origin"),
  ];
  const normalized = candidates.map(normalizeSessionSource).filter(Boolean);
  return normalized.find((source) => EXTERNAL_SESSION_SOURCES.has(source)) || normalized[0] || "";
}

export function requestSessionSourceFromBody(req: NextRequest | Request, body: string | undefined): string {
  if (body === undefined) return requestSessionSource(req);
  try {
    const payload = JSON.parse(body || "{}");
    return requestSessionSource(req, payload);
  } catch {
    return requestSessionSource(req);
  }
}

/** Attach session cookies to a NextResponse (skips empty values). */
export function setSessionCookies(response: NextResponse, session: Partial<SessionPair>) {
  const sessionId = String(session.sessionId || "").trim();
  const sessionToken = String(session.sessionToken || "").trim();
  const sessionSource = normalizeSessionSource(session.sessionSource);
  const hasSessionIdentity = Boolean(sessionId || sessionToken);
  const sourceForCookie = EXTERNAL_SESSION_SOURCES.has(sessionSource) ? sessionSource : "";
  if (sessionId) response.cookies.set(cookieName(SESSION_ID_COOKIE, sourceForCookie), sessionId, cookieOptions());
  if (sessionToken) response.cookies.set(cookieName(SESSION_TOKEN_COOKIE, sourceForCookie), sessionToken, cookieOptions());
  if (sessionSource && hasSessionIdentity) response.cookies.set(cookieName(SESSION_SOURCE_COOKIE, sourceForCookie), sessionSource, cookieOptions());
  else if (hasSessionIdentity) response.cookies.set(cookieName(SESSION_SOURCE_COOKIE, sourceForCookie), "", { ...cookieOptions(), maxAge: 0 });
}

/** Expire both session cookies on the given NextResponse. */
export function clearSessionCookies(response: NextResponse, source?: unknown) {
  const normalized = normalizeSessionSource(source);
  const sourceForCookie = EXTERNAL_SESSION_SOURCES.has(normalized) ? normalized : "";
  response.cookies.set(cookieName(SESSION_ID_COOKIE, sourceForCookie), "", { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(cookieName(SESSION_TOKEN_COOKIE, sourceForCookie), "", { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(cookieName(SESSION_SOURCE_COOKIE, sourceForCookie), "", { ...cookieOptions(), maxAge: 0 });
}

/** Pull sessionId/sessionToken out of an arbitrary JSON body (snake or camel case). */
export function extractSessionFromPayload(payload: any): Partial<SessionPair> {
  if (!payload || typeof payload !== "object") return {};
  return {
    sessionId: String(payload.sessionId || payload.session_id || "").trim(),
    sessionToken: String(payload.sessionToken || payload.session_token || "").trim(),
    sessionSource: extractSessionSource(payload),
  };
}

/** Return a copy of payload with session id/token fields removed before sending to the browser. */
export function stripSessionSecrets(payload: any): any {
  if (Array.isArray(payload)) return payload.map(stripSessionSecrets);
  if (!payload || typeof payload !== "object") return payload;

  const clone: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "sessionToken" || key === "session_token") continue;
    clone[key] = stripSessionSecrets(value);
  }
  return clone;
}

/** Build X-Session-Id / X-Session-Token headers from cookies, for forwarding to the backend. */
export function buildSessionHeaders(req: NextRequest | Request, preferredSource?: unknown): Record<string, string> {
  const session = readSessionCookies(req, preferredSource || requestSessionSource(req));
  return {
    ...(session.sessionId ? { "X-Session-Id": session.sessionId } : {}),
    ...(session.sessionToken ? { "X-Session-Token": session.sessionToken } : {}),
  };
}

/** Inject sessionId/sessionToken into an outbound JSON body if the cookies are present. */
export function augmentJsonBodyWithSession(body: string | undefined, req: NextRequest | Request): string | undefined {
  if (body === undefined) return body;

  try {
    const payload = JSON.parse(body || "{}");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return body;
    const source = requestSessionSource(req, payload);
    const session = readSessionCookies(req, source);
    if (!session.sessionId && !session.sessionToken) return body;
    const shouldOverridePayloadSession = isExternalPrioritySource(source || session.sessionSource);
    if (session.sessionId && (shouldOverridePayloadSession || (!payload.session_id && !payload.sessionId))) {
      payload.session_id = session.sessionId;
      delete payload.sessionId;
    }
    if (session.sessionToken && (shouldOverridePayloadSession || (!payload.session_token && !payload.sessionToken))) {
      payload.session_token = session.sessionToken;
      delete payload.sessionToken;
    }
    if (session.sessionSource && (shouldOverridePayloadSession || (!payload.session_source && !payload.sessionSource))) {
      payload.session_source = session.sessionSource;
      delete payload.sessionSource;
    }
    return JSON.stringify(payload);
  } catch {
    return body;
  }
}

/** Build a NextResponse JSON body with session secrets stripped and cookies re-attached. */
export function jsonResponseWithSession(payload: any, init: ResponseInit = {}, fallbackSource?: unknown) {
  const session = extractSessionFromPayload(payload);
  const response = NextResponse.json(stripSessionSecrets(payload), init);
  setSessionCookies(response, {
    ...session,
    sessionSource: session.sessionSource || normalizeSessionSource(fallbackSource),
  });
  return response;
}

/** Return the backend response body verbatim, re-attaching session cookies when the content is JSON. */
export function passthroughResponseWithSession(text: string, status: number, contentType: string, fallbackSource?: unknown) {
  if (contentType.includes("application/json")) {
    try {
      return jsonResponseWithSession(JSON.parse(text || "{}"), {
        status,
        headers: { "content-type": "application/json" },
      }, fallbackSource);
    } catch {
      // Fall through to plain text passthrough.
    }
  }

  return new NextResponse(text, {
    status,
    headers: { "content-type": contentType || "text/plain" },
  });
}
