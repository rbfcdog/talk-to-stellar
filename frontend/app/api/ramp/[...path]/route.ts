import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  augmentJsonBodyWithSession,
  buildSessionHeaders,
  passthroughResponseWithSession,
  readSessionCookies,
} from "@/lib/server-session";
import { publicErrorPayload } from "@/lib/public-errors";

export const maxDuration = 120;
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

function isDefindexPath(path: string[]) {
  return path.join("/").startsWith("defindex/yield");
}

function truncateLogBody(text: string, max = 900) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

async function proxy(req: NextRequest, path: string[]) {
  const backendBase = getBackendBaseUrl();
  const pathText = path.join("/");
  const requestId = req.headers.get("x-request-id") || `ramp_${crypto.randomUUID()}`;
  const trackDefindex = isDefindexPath(path);
  const qs = req.nextUrl.searchParams.toString();
  const target = `${backendBase}/api/ramp/${pathText}${qs ? `?${qs}` : ""}`;
  const rawBody = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const body = augmentJsonBodyWithSession(rawBody, req);
  const idempotencyKey = req.headers.get("Idempotency-Key") ||
    `next_${crypto.createHash("sha256").update(`${req.method}:${target}:${body || ""}`).digest("hex")}`;
  const internalSecret = process.env.RAMP_SANDBOX_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET || "";
  const session = readSessionCookies(req);

  const init: RequestInit = {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") || "application/json",
      "Idempotency-Key": idempotencyKey,
      "X-Request-Id": requestId,
      ...buildSessionHeaders(req),
      ...(internalSecret ? { "X-Internal-Api-Secret": internalSecret } : {}),
      ...(req.headers.get("x-wallet-pin") ? { "X-Wallet-Pin": req.headers.get("x-wallet-pin") || "" } : {}),
      ...(req.headers.get("x-talktostellar-wallet-pin") ? { "X-TalkToStellar-Wallet-Pin": req.headers.get("x-talktostellar-wallet-pin") || "" } : {}),
    },
  };

  if (body !== undefined) init.body = body;

  try {
    if (trackDefindex) {
      console.log("[ramp-proxy] defindex_start", {
        request_id: requestId,
        method: req.method,
        path: pathText,
        backend_base: backendBase,
        has_session: Boolean(session.sessionId && session.sessionToken),
        has_body: body !== undefined,
      });
    }
    const res = await fetch(target, init);
    const text = await res.text();
    if (trackDefindex) {
      const fields = {
        request_id: requestId,
        method: req.method,
        path: pathText,
        status: res.status,
        ok: res.ok,
        response_bytes: text.length,
        body: res.ok ? undefined : truncateLogBody(text),
      };
      if (res.ok) {
        console.log("[ramp-proxy] defindex_response", fields);
      } else {
        console.error("[ramp-proxy] defindex_response_failed", fields);
      }
    }
    const response = passthroughResponseWithSession(text, res.status, res.headers.get("content-type") || "application/json");
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error: any) {
    console.error("[ramp-proxy] request failed", {
      request_id: requestId,
      path: pathText,
      target,
      error: error?.message || error,
    });
    const response = NextResponse.json(
      { ...publicErrorPayload(error, { code: "ramp_unavailable", prefix: "RAMP" }), request_id: requestId },
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
