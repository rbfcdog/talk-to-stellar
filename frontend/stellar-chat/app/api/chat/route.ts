import { NextResponse } from "next/server";

const AGENT_API_URL =
  process.env.AGENT_API_URL ||
  process.env.NEXT_PUBLIC_AGENT_API_URL ||
  "http://localhost:3001/api/agent/query";

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
  try {
    const { messages, session_id } = await req.json();
    const userMessage = messages?.[messages.length - 1];

    if (!userMessage?.content) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Use provided session_id or generate a new UUID
    const sessionId = session_id || generateSessionId();

    const dataToSend = {
      query: userMessage.content,
      session_id: sessionId,
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}