import { NextRequest, NextResponse } from "next/server";
import { normalizeSessionSource, setSessionCookies } from "@/lib/server-session";

function sourceFromPayload(payload: any): string {
  const direct =
    payload?.session_source ||
    payload?.sessionSource ||
    payload?.source ||
    payload?.provider ||
    payload?.external_source ||
    payload?.externalSource ||
    payload?.external_provider ||
    payload?.externalProvider ||
    "";
  const normalized = normalizeSessionSource(direct);
  if (normalized) return normalized;

  try {
    const target = new URL(String(payload?.url || ""));
    return normalizeSessionSource(
      target.searchParams.get("provider") ||
        target.searchParams.get("source") ||
        target.searchParams.get("external_source") ||
        target.searchParams.get("channel") ||
        "",
    );
  } catch {
    return "";
  }
}

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
    sessionSource: sourceFromPayload(payload),
  });
  return redirect;
}
