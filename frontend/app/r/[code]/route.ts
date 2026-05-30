import { NextRequest, NextResponse } from "next/server";
import { setSessionCookies } from "@/lib/server-session";

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const params = await context.params;
  const rawCode = String(params.code || "").trim();
  const code = rawCode.replace(/^[\s"'`([{<]+|[\s"'`)\]}>.,;:!?]+$/g, "");
  const encodedCode = encodeURIComponent(code);

  const response = await fetch(
    `${req.nextUrl.origin}/api/external/short-links/${encodedCode}?include_session=1`,
    { cache: "no-store" },
  ).catch(() => null as any);

  const payload = await response?.json().catch(() => ({}));

  if (!response?.ok || !payload?.url) {
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  const redirect = NextResponse.redirect(String(payload.url));
  setSessionCookies(redirect, {
    sessionId: String(payload.session_id || payload.sessionId || "").trim(),
    sessionToken: String(payload.session_token || payload.sessionToken || "").trim(),
  });
  return redirect;
}
