import { NextResponse } from "next/server";
import crypto from "crypto";
import { buildSessionHeaders, isExternalPrioritySource, readSessionCookies, requestSessionSource, setSessionCookies } from "@/lib/server-session";
import { publicErrorPayload } from "@/lib/public-errors";

const getBackendBaseUrl = () => {
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
};

const getAgentApiUrl = () => {
  return `${getBackendBaseUrl()}/api/agent/query`;
};

const AGENT_API_URL = getAgentApiUrl();

const getAgentMessagesUrl = (sessionId: string, limit = 50) => {
  const queryUrl = new URL(AGENT_API_URL);
  queryUrl.pathname = /\/query\/?$/.test(queryUrl.pathname)
    ? queryUrl.pathname.replace(/\/query\/?$/, `/messages/${sessionId}`)
    : `${queryUrl.pathname.replace(/\/$/, "")}/messages/${sessionId}`;
  queryUrl.search = `limit=${limit}`;
  return queryUrl.toString();
};

const getExternalCheckAccountUrl = () => {
  return `${getBackendBaseUrl()}/api/external/check-account`;
};

function isExpectedSessionAuthFailure(status: number, body: string): boolean {
  if (status === 401 || status === 403 || status === 410) return true;
  const normalized = String(body || "").toLowerCase();
  return (
    normalized.includes("session expired") ||
    normalized.includes("sessao expirou") ||
    normalized.includes("sessão expirou") ||
    normalized.includes("invalid or expired session")
  );
}

const WEB_SESSION_LOOKUP_TTL_MS = 5000;
const webSessionLookupCache = new Map<string, { sessionId: string | null; expiresAt: number }>();

async function resolveWebSessionId(browserId: string): Promise<string | null> {
  if (!browserId) return null;

  const cached = webSessionLookupCache.get(browserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.sessionId;
  }

  const response = await fetch(getExternalCheckAccountUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "web",
      provider_user_id: browserId,
      lookup_only: true,
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const sessionId = payload?.exists && payload?.sessionId ? String(payload.sessionId) : null;
  webSessionLookupCache.set(browserId, {
    sessionId,
    expiresAt: Date.now() + WEB_SESSION_LOOKUP_TTL_MS,
  });
  return sessionId;
}

/**
 * Generate a UUID v4 for session tracking
 */
function generateSessionId(): string {
  // Use crypto.randomUUID() if available (Node.js 15+, browsers with Web Crypto)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function POST(req: Request) {
  let sessionId: string | null = null;
  let requestLanguage = "pt-BR";

  try {
    const { messages, session_id, source, metadata, language } = await req.json();
    requestLanguage = language || metadata?.language || "pt-BR";
    const browserSessionExpired = metadata?.browser_session_expired === true || metadata?.force_relogin === true;
    const requestSource = requestSessionSource(req, { source, metadata });
    const session = browserSessionExpired ? { sessionId: "", sessionToken: "", sessionSource: "" } : readSessionCookies(req, requestSource);
    const userMessage = messages?.[messages.length - 1];

    if (!userMessage?.content) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const browserId = String(metadata?.browser_id || "").trim();
    const requestHasExternalPriority = isExternalPrioritySource(requestSource);
    const cookieHasExternalPriority = isExternalPrioritySource(session.sessionSource);
    const linkedSessionId = requestHasExternalPriority ? null : await resolveWebSessionId(browserId).catch(() => null);

    // Browser links opened from WhatsApp/Telegram use a channel-scoped session.
    // A normal browser tab keeps using the web-scoped session.
    sessionId = requestHasExternalPriority
      ? (session.sessionId || session_id || linkedSessionId || generateSessionId())
      : cookieHasExternalPriority
        ? (session.sessionId || session_id || linkedSessionId || generateSessionId())
        : (session.sessionId || linkedSessionId || session_id || generateSessionId());
    const sessionTokenForSelectedSession =
      session.sessionId && session.sessionId === sessionId ? (session.sessionToken || "") : "";
    const forwardSessionHeaders =
      !browserSessionExpired && session.sessionId && session.sessionId === sessionId
        ? buildSessionHeaders(req, requestSource)
        : {};

    const dataToSend = {
      query: userMessage.content,
      session_id: sessionId,
      session_token: sessionTokenForSelectedSession || undefined,
      source: requestSource || source || "web",
      language: language || metadata?.language || "pt-BR",
      metadata: {
        ...(metadata || {}),
        language: language || metadata?.language || "pt-BR",
        source: requestSource || source || metadata?.source || "web",
      },
    };
    const idempotencyKey =
      req.headers.get("Idempotency-Key") ||
      `next_${crypto.createHash("sha256").update(JSON.stringify(dataToSend)).digest("hex")}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const agentApiResponse = await fetch(AGENT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        ...forwardSessionHeaders,
      },
      body: JSON.stringify(dataToSend),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!agentApiResponse.ok) {
      const errorText = await agentApiResponse.text();
      if (isExpectedSessionAuthFailure(agentApiResponse.status, errorText)) {
        return NextResponse.json({
          content: errorText,
          session_id: sessionId,
          action: null,
          intent: null,
          onboardingRequired: true,
          loginRequired: true,
          reason: "session_expired",
          success: true,
        });
      }
      throw new Error(`Agent API Error: ${errorText}`);
    }

    const agentApiData = await agentApiResponse.json();
    const botResponse =
      agentApiData?.message ||
      agentApiData?.result?.message ||
      "No valid response received from the agent API.";

    const response = NextResponse.json({
      content: botResponse,
      session_id: agentApiData?.session_id || sessionId,
      action: agentApiData?.action || null,
      intent: agentApiData?.intent || null,
      onboardingRequired: Boolean(agentApiData?.onboardingRequired || agentApiData?.loginRequired),
      creationUrl: agentApiData?.creationUrl || null,
      reason: agentApiData?.reason || null,
      success: typeof agentApiData?.success === "boolean" ? agentApiData.success : true,
    });
    if (requestHasExternalPriority || cookieHasExternalPriority) {
      setSessionCookies(response, {
        sessionId: String(agentApiData?.session_id || sessionId || "").trim(),
        sessionToken: sessionTokenForSelectedSession,
        sessionSource: requestSource || session.sessionSource || "",
      });
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const payload = publicErrorPayload(error, { code: "chat_unavailable", language: requestLanguage });
    console.error("Next.js API proxy error:", message, payload.support_code);
    return NextResponse.json({ 
      ...payload,
      error: payload.message,
      content: `${payload.message}\n\n${requestLanguage === "en" ? "Support code" : "Código de suporte"}: ${payload.support_code}`,
      session_id: sessionId || null 
    }, { status: 502 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    const browserId = url.searchParams.get("browser_id") || "";
    const requestSource =
      url.searchParams.get("source") ||
      url.searchParams.get("provider") ||
      url.searchParams.get("channel") ||
      url.searchParams.get("external_source") ||
      "";
    const cookieSession = readSessionCookies(req, requestSource);
    const sessionToken = cookieSession.sessionToken || "";
    const limit = url.searchParams.get("limit") || "50";

    if (!sessionId) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    const requestHasExternalPriority = isExternalPrioritySource(requestSource);
    const linkedSessionId = requestHasExternalPriority ? null : await resolveWebSessionId(browserId).catch(() => null);
    const resolvedSessionId = (isExternalPrioritySource(requestSource)
      ? (cookieSession.sessionId || sessionId || linkedSessionId)
      : isExternalPrioritySource(cookieSession.sessionSource)
        ? (cookieSession.sessionId || sessionId || linkedSessionId)
        : (cookieSession.sessionId || linkedSessionId || sessionId)) || sessionId;

    const messagesUrl = new URL(getAgentMessagesUrl(resolvedSessionId, Number(limit) || 50));

    const agentApiResponse = await fetch(messagesUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
      },
      cache: "no-store",
    });

    if (!agentApiResponse.ok) {
      const errorText = await agentApiResponse.text();
      if (isExpectedSessionAuthFailure(agentApiResponse.status, errorText)) {
        return NextResponse.json(
          {
            session_id: resolvedSessionId,
            messages: [],
            loginRequired: true,
            onboardingRequired: true,
            reason: "session_expired",
          },
          {
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          }
        );
      }
      throw new Error(`Agent API Error: ${errorText}`);
    }

    return NextResponse.json(await agentApiResponse.json(), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    const payload = publicErrorPayload(error, { code: "chat_messages_unavailable" });
    console.error("Next.js API messages proxy error:", message, payload.support_code);
    return NextResponse.json({ ...payload, error: payload.message }, { status: 502 });
  }
}
