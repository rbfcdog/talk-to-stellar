import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  augmentJsonBodyWithSession,
  buildSessionHeaders,
  passthroughResponseWithSession,
} from "@/lib/server-session";

function getBackendBaseUrl() {
  const raw =
    process.env.BACKEND_URL ||
    process.env.AGENT_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_AGENT_API_URL ||
    "http://localhost:3001";

  return raw
    .replace(/\/api\/agent\/query\/?$/, "")
    .replace(/\/api\/agent\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "");
}

async function proxy(req: NextRequest, path: string[]) {
  const backendBase = getBackendBaseUrl();
  const qs = req.nextUrl.searchParams.toString();
  const target = `${backendBase}/api/agent/${path.join("/")}${qs ? `?${qs}` : ""}`;
  const rawBody = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const body = augmentJsonBodyWithSession(rawBody, req);
  const idempotencyKey = req.headers.get("Idempotency-Key") ||
    `next_${crypto.createHash("sha256").update(`${req.method}:${target}:${body || ""}`).digest("hex")}`;

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") || "application/json",
        "Idempotency-Key": idempotencyKey,
        ...buildSessionHeaders(req),
      },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return passthroughResponseWithSession(text, res.status, res.headers.get("content-type") || "application/json");
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: `Agent proxy error: ${error?.message || "fetch failed"}. Check BACKEND_URL or AGENT_API_URL.`,
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxy(req, params.path || []);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxy(req, params.path || []);
}
