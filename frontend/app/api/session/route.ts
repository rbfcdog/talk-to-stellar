import { NextResponse } from "next/server";
import { clearSessionCookies, isExternalPrioritySource, readSessionCookies } from "@/lib/server-session";

export async function GET(req: Request) {
  const session = readSessionCookies(req);
  return NextResponse.json({
    authenticated: Boolean(session.sessionId && session.sessionToken),
    session_id: session.sessionId || "",
    session_source: session.sessionSource || "",
    external_priority: isExternalPrioritySource(session.sessionSource),
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
  clearSessionCookies(response);
  return response;
}

export async function POST() {
  return DELETE();
}
