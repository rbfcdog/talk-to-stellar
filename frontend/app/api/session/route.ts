import { NextResponse } from "next/server";
import { clearSessionCookies, readSessionCookies } from "@/lib/server-session";

export async function GET(req: Request) {
  const session = readSessionCookies(req);
  return NextResponse.json({
    authenticated: Boolean(session.sessionId && session.sessionToken),
    session_id: session.sessionId || "",
  });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearSessionCookies(response);
  return response;
}

export async function POST() {
  return DELETE();
}
