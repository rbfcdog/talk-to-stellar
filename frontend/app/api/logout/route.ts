import { NextResponse } from "next/server";

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
    const sessionId = String(body?.session_id || "").trim();
    if (!sessionId) {
      return NextResponse.json({ success: false, error: "session_id is required" }, { status: 400 });
    }

    const response = await fetch(AGENT_LOGOUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: payload?.error || payload?.message || "Logout failed" },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

