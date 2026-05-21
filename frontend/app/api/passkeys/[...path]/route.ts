import { NextRequest, NextResponse } from "next/server";
import {
  augmentJsonBodyWithSession,
  buildSessionHeaders,
  passthroughResponseWithSession,
} from "@/lib/server-session";
import { publicErrorPayload } from "@/lib/public-errors";

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
  const target = `${backendBase}/api/passkeys/${path.join("/")}${qs ? `?${qs}` : ""}`;
  const rawBody = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const body = augmentJsonBodyWithSession(rawBody, req);
  const inboundIdempotencyKey = req.headers.get("Idempotency-Key");

  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    ...buildSessionHeaders(req),
  };
  if (inboundIdempotencyKey) {
    headers["Idempotency-Key"] = inboundIdempotencyKey;
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (body !== undefined) {
    init.body = body;
  }

  try {
    const res = await fetch(target, init);
    const text = await res.text();
    return passthroughResponseWithSession(text, res.status, res.headers.get("content-type") || "application/json");
  } catch (error: any) {
    console.error("[passkeys-proxy] request failed", { target, error: error?.message || error });
    return NextResponse.json(publicErrorPayload(error, { code: "passkey_service_unavailable" }), { status: 502 });
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxy(req, params.path || []);
}
