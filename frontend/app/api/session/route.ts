import { NextResponse } from "next/server";
import { clearSessionCookies, isExternalPrioritySource, readSessionCookies, requestSessionSource } from "@/lib/server-session";

export async function GET(req: Request) {
  const source = requestSessionSource(req);
  const session = readSessionCookies(req, source);
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

export async function DELETE(req: Request) {
  return clearForRequest(req);
}

async function clearForRequest(req?: Request) {
  const source = req ? requestSessionSource(req) : "";
  const response = NextResponse.json({ success: true }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
  clearSessionCookies(response, source);
  return response;
}

export async function POST(req: Request) {
  return clearForRequest(req);
}
