import { NextResponse } from "next/server";

const getAgentApiUrl = () => {
  // Server-side can use BACKEND_URL directly
  if (process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL}/api/agent/query`;
  }
  
  // Fallback to explicit agent URL if set
  if (process.env.AGENT_API_URL) {
    return process.env.AGENT_API_URL;
  }
  
  // Final fallback for localhost
  return "http://localhost:3001/api/agent/query";
};

const AGENT_API_URL = getAgentApiUrl();

const getAgentMessagesUrl = (sessionId: string, limit = 50) => {
  const queryUrl = new URL(AGENT_API_URL);
  queryUrl.pathname = queryUrl.pathname.replace(/\/query$/, `/messages/${sessionId}`);
  queryUrl.search = `limit=${limit}`;
  return queryUrl.toString();
};

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
    const { messages, session_id, source, metadata } = await req.json();
    const userMessage = messages?.[messages.length - 1];

    if (!userMessage?.content) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Use provided session_id or generate a new UUID
    sessionId = session_id || generateSessionId();

    const dataToSend = {
      query: userMessage.content,
      session_id: sessionId,
      source: source || "web",
      metadata: metadata || {},
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const agentApiResponse = await fetch(AGENT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    const limit = url.searchParams.get("limit") || "50";

    if (!sessionId) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    const agentApiResponse = await fetch(getAgentMessagesUrl(sessionId, Number(limit) || 50), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!agentApiResponse.ok) {
      const errorText = await agentApiResponse.text();
      throw new Error(`Agent API Error: ${errorText}`);
    }

    return NextResponse.json(await agentApiResponse.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("Next.js API messages proxy error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
