import { NextResponse } from "next/server";
import crypto from "crypto";

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

  try {
    const { messages, session_id, session_token, source, metadata, language } = await req.json();
    const userMessage = messages?.[messages.length - 1];

    if (!userMessage?.content) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const browserId = String(metadata?.browser_id || "").trim();
    const linkedSessionId = await resolveWebSessionId(browserId).catch(() => null);

    // Always prioritize the linked web session when browser_id is mapped.
    // This avoids sending chat messages with stale local session_id after login/linking.
    sessionId = linkedSessionId || session_id || generateSessionId();

    const dataToSend = {
      query: userMessage.content,
      session_id: sessionId,
      session_token: session_token || metadata?.session_token || undefined,
      source: source || "web",
      language: language || metadata?.language || "pt-BR",
      metadata: {
        ...(metadata || {}),
        language: language || metadata?.language || "pt-BR",
      },
    };
    const idempotencyKey =
      req.headers.get("Idempotency-Key") ||
      `next_${crypto.createHash("sha256").update(JSON.stringify(dataToSend)).digest("hex")}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const agentApiResponse = await fetch(AGENT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(dataToSend),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!agentApiResponse.ok) {
      const errorText = await agentApiResponse.text();
      throw new Error(`Agent API Error: ${errorText}`);
    }

    const agentApiData = await agentApiResponse.json();
    const botResponse =
      agentApiData?.message ||
      agentApiData?.result?.message ||
      "No valid response received from the agent API.";

    return NextResponse.json({ 
      content: botResponse,
      session_id: agentApiData?.session_id || sessionId,
      action: agentApiData?.action || null,
      intent: agentApiData?.intent || null,
      success: typeof agentApiData?.success === "boolean" ? agentApiData.success : true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Next.js API proxy error:", message);
    return NextResponse.json({ 
      error: message,
      content: `Error: ${message}`,
      session_id: sessionId || null 
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");
    const auth = String(req.headers.get("authorization") || "").trim();
    const sessionToken = req.headers.get("x-session-token") ||
      (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "");
    const browserId = url.searchParams.get("browser_id") || "";
    const limit = url.searchParams.get("limit") || "50";

    if (!sessionId) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    const linkedSessionId = await resolveWebSessionId(browserId).catch(() => null);
    const resolvedSessionId = linkedSessionId || sessionId;

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
      throw new Error(`Agent API Error: ${errorText}`);
    }

    return NextResponse.json(await agentApiResponse.json(), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Next.js API messages proxy error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
