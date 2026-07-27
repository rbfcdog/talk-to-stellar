import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  augmentJsonBodyWithSession,
  buildSessionHeaders,
  passthroughResponseWithSession,
  requestSessionSourceFromBody,
} from "@/lib/server-session";
import { publicErrorPayload } from "@/lib/public-errors";

export const maxDuration = 60;
export const runtime = "nodejs";

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
  const pathText = path.join("/");
  const requestId = req.headers.get("x-request-id") || `pgf_${crypto.randomUUID()}`;
  const qs = req.nextUrl.searchParams.toString();
  const target = `${backendBase}/api/pagfinance/${pathText}${qs ? `?${qs}` : ""}`;
  const rawBody = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const requestSource = requestSessionSourceFromBody(req, rawBody);
  const body = augmentJsonBodyWithSession(rawBody, req);

  const init: RequestInit = {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") || "application/json",
      "X-Request-Id": requestId,
      ...buildSessionHeaders(req, requestSource),
    },
  };
  if (body !== undefined) init.body = body;

  try {
    const res = await fetch(target, init);
    const text = await res.text();
    const response = passthroughResponseWithSession(
      text,
      res.status,
      res.headers.get("content-type") || "application/json",
      requestSource,
    );
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error: unknown) {
    console.error("[pagfinance-proxy] request failed", {
      request_id: requestId,
      path: pathText,
      error: error instanceof Error ? error.message : String(error),
    });
    const response = NextResponse.json(
      { ...publicErrorPayload(error, { code: "pix_unavailable", prefix: "PIX" }), request_id: requestId },
      { status: 502 },
    );
    response.headers.set("x-request-id", requestId);
    return response;
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
