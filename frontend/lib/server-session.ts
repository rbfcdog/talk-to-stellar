import { NextRequest, NextResponse } from "next/server";

export const SESSION_ID_COOKIE = "tts_session_id";
export const SESSION_TOKEN_COOKIE = "tts_session_token";
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

type SessionPair = {
  sessionId: string;
  sessionToken: string;
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

/** Extract sessionId + sessionToken from the incoming request's HttpOnly cookies. */
export function readSessionCookies(req: NextRequest | Request): Partial<SessionPair> {
  const cookieHeader = req.headers.get("cookie") || "";
  const parsed = new Map<string, string>();
  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (!rawName) continue;
    parsed.set(rawName, decodeURIComponent(rawValue.join("=") || ""));
  }
  return {
    sessionId: parsed.get(SESSION_ID_COOKIE) || "",
    sessionToken: parsed.get(SESSION_TOKEN_COOKIE) || "",
  };
}

/** Attach session cookies to a NextResponse (skips empty values). */
export function setSessionCookies(response: NextResponse, session: Partial<SessionPair>) {
  const sessionId = String(session.sessionId || "").trim();
  const sessionToken = String(session.sessionToken || "").trim();
  if (sessionId) response.cookies.set(SESSION_ID_COOKIE, sessionId, cookieOptions());
  if (sessionToken) response.cookies.set(SESSION_TOKEN_COOKIE, sessionToken, cookieOptions());
}

/** Expire both session cookies on the given NextResponse. */
export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(SESSION_ID_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(SESSION_TOKEN_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

/** Pull sessionId/sessionToken out of an arbitrary JSON body (snake or camel case). */
export function extractSessionFromPayload(payload: any): Partial<SessionPair> {
  if (!payload || typeof payload !== "object") return {};
  return {
    sessionId: String(payload.sessionId || payload.session_id || "").trim(),
    sessionToken: String(payload.sessionToken || payload.session_token || "").trim(),
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
export function buildSessionHeaders(req: NextRequest | Request): Record<string, string> {
  const session = readSessionCookies(req);
  return {
    ...(session.sessionId ? { "X-Session-Id": session.sessionId } : {}),
    ...(session.sessionToken ? { "X-Session-Token": session.sessionToken } : {}),
  };
}

/** Inject sessionId/sessionToken into an outbound JSON body if the cookies are present. */
export function augmentJsonBodyWithSession(body: string | undefined, req: NextRequest | Request): string | undefined {
  if (body === undefined) return body;
  const session = readSessionCookies(req);
  if (!session.sessionId && !session.sessionToken) return body;

  try {
    const payload = JSON.parse(body || "{}");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return body;
    if (session.sessionId && !payload.session_id && !payload.sessionId) payload.session_id = session.sessionId;
    if (session.sessionToken && !payload.session_token && !payload.sessionToken) payload.session_token = session.sessionToken;
    return JSON.stringify(payload);
  } catch {
    return body;
  }
}

/** Build a NextResponse JSON body with session secrets stripped and cookies re-attached. */
export function jsonResponseWithSession(payload: any, init: ResponseInit = {}) {
  const session = extractSessionFromPayload(payload);
  const response = NextResponse.json(stripSessionSecrets(payload), init);
  setSessionCookies(response, session);
  return response;
}

/** Return the backend response body verbatim, re-attaching session cookies when the content is JSON. */
export function passthroughResponseWithSession(text: string, status: number, contentType: string) {
  if (contentType.includes("application/json")) {
    try {
      return jsonResponseWithSession(JSON.parse(text || "{}"), {
        status,
        headers: { "content-type": "application/json" },
      });
    } catch {
      // Fall through to plain text passthrough.
    }
  }

  return new NextResponse(text, {
    status,
    headers: { "content-type": contentType || "text/plain" },
  });
}
