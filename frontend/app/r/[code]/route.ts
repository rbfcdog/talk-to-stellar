import { NextRequest, NextResponse } from "next/server";

function getBackendBaseUrl() {
  const fromBackend = process.env.BACKEND_URL;
  if (fromBackend) return fromBackend.replace(/\/$/, "");

  const fromAgent = process.env.AGENT_API_URL;
  if (fromAgent) return fromAgent.replace(/\/api\/agent\/query$/, "").replace(/\/$/, "");

  const fromPublic =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_AGENT_API_URL ||
    "";

  if (!fromPublic) return "http://localhost:3001";
  return fromPublic.replace(/\/api\/agent\/query$/, "").replace(/\/$/, "");
}

export async function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  const params = await context.params;
  const rawCode = String(params.code || "").trim();
  const code = rawCode.replace(/^[\s"'`([{<]+|[\s"'`)\]}>.,;:!?]+$/g, "");
  const encodedCode = encodeURIComponent(code);

  // Prefer same-origin proxy route to keep resolution behavior aligned with the app deployment.
  let response = await fetch(`${req.nextUrl.origin}/api/external/short-links/${encodedCode}`, {
    cache: "no-store",
  }).catch(() => null as any);

  // Fallback: direct backend call if proxy is unavailable.
  if (!response || !response.ok) {
    response = await fetch(`${getBackendBaseUrl()}/api/external/short-links/${encodedCode}`, {
      cache: "no-store",
    }).catch(() => null as any);
  }

  const payload = await response?.json().catch(() => ({}));

  if (!response?.ok || !payload?.url) {
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  return NextResponse.redirect(String(payload.url));
}
