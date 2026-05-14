import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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

async function proxy(req: NextRequest, path: string[]) {
  const backendBase = getBackendBaseUrl();
  const qs = req.nextUrl.searchParams.toString();
  const target = `${backendBase}/api/ramp/${path.join("/")}${qs ? `?${qs}` : ""}`;
  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const idempotencyKey = req.headers.get("Idempotency-Key") ||
    `next_${crypto.createHash("sha256").update(`${req.method}:${target}:${body || ""}`).digest("hex")}`;

  const init: RequestInit = {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") || "application/json",
      "Idempotency-Key": idempotencyKey,
      ...(req.headers.get("x-wallet-pin") ? { "X-Wallet-Pin": req.headers.get("x-wallet-pin") || "" } : {}),
      ...(req.headers.get("x-talktostellar-wallet-pin") ? { "X-TalkToStellar-Wallet-Pin": req.headers.get("x-talktostellar-wallet-pin") || "" } : {}),
    },
  };

  if (body !== undefined) init.body = body;

  try {
    const res = await fetch(target, init);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: `Ramp proxy error: ${error?.message || "fetch failed"}. Check BACKEND_URL or NEXT_PUBLIC_BACKEND_URL.`,
        target,
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path || []);
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path || []);
}
