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

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || "").trim();
  const response = await fetch(`${getBackendBaseUrl()}/api/external/short-links/${encodeURIComponent(code)}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload?.url) {
    return NextResponse.redirect(new URL("/chat", req.url));
  }

  return NextResponse.redirect(String(payload.url));
}
