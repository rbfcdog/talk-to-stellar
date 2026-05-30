import { NextResponse } from "next/server";
import crypto from "crypto";
import { clearSessionCookies, readSessionCookies } from "@/lib/server-session";

const getAgentLogoutUrl = () => {
  if (process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL}/api/agent/logout`;
  }
  if (process.env.AGENT_API_URL) {
    const queryUrl = new URL(process.env.AGENT_API_URL);
    queryUrl.pathname = queryUrl.pathname.replace(/\/query$/, "/logout");
    return queryUrl.toString();
  }
  return "http://localhost:3001/api/agent/logout";
};

const AGENT_LOGOUT_URL = getAgentLogoutUrl();

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const session = readSessionCookies(req);
    const sessionId = String(body?.session_id || session.sessionId || "").trim();
    const sessionToken = String(session.sessionToken || "").trim();
    const token = String(body?.token || "").trim();
    const provider = String(body?.provider || "").trim();
    const providerUserId = String(body?.provider_user_id || "").trim();
    const isBrowserOnlyLogout = !token && !provider && !providerUserId;
    if (isBrowserOnlyLogout) {
      const response = NextResponse.json({ success: true, localOnly: true });
      clearSessionCookies(response);
      return response;
    }
    if (!sessionId && !token) {
      const response = NextResponse.json({ success: true, alreadyLoggedOut: true });
      clearSessionCookies(response);
      return response;
    }

    const response = await fetch(AGENT_LOGOUT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": req.headers.get("Idempotency-Key") ||
          `next_${crypto.createHash("sha256").update(JSON.stringify({ sessionId, token, provider, providerUserId })).digest("hex")}`,
      },
      body: JSON.stringify({
        session_id: sessionId || undefined,
        session_token: sessionToken || undefined,
        token: token || undefined,
        provider: provider || undefined,
        provider_user_id: providerUserId || undefined,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorResponse = NextResponse.json(
        {
          success: false,
          error: payload?.error || payload?.message || "Logout failed",
          alreadyUsed: Boolean(payload?.alreadyUsed),
          expired: Boolean(payload?.expired),
        },
        { status: response.status }
      );
      if (response.status === 401 || response.status === 410) clearSessionCookies(errorResponse);
      return errorResponse;
    }

    const successResponse = NextResponse.json({ success: true });
    clearSessionCookies(successResponse);
    return successResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
