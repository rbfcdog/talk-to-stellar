import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  augmentJsonBodyWithSession,
  buildSessionHeaders,
  passthroughResponseWithSession,
  requestSessionSourceFromBody,
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

type ProxyOptions = {
  injectSession?: boolean;
  forwardTransferOpsAuthorization?: boolean;
};

/** Forward an incoming Next.js API request to the backend, attaching session headers + idempotency key. */
export async function proxyBackendApi(
  req: NextRequest,
  basePath: string,
  path: string[],
  options: ProxyOptions = {},
): Promise<NextResponse> {
  const backendBase = getBackendBaseUrl();
  const qs = req.nextUrl.searchParams.toString();
  const target = `${backendBase}/${basePath.replace(/^\/|\/$/g, "")}/${path.join("/")}${qs ? `?${qs}` : ""}`;
  const rawBody = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const requestSource = requestSessionSourceFromBody(req, rawBody);
  const body = options.injectSession === false ? rawBody : augmentJsonBodyWithSession(rawBody, req);
  const idempotencyKey = req.headers.get("Idempotency-Key") ||
    `next_${crypto.createHash("sha256").update(`${req.method}:${target}:${body || ""}`).digest("hex")}`;
  const requestId = req.headers.get("x-request-id") || `next_${crypto.randomUUID()}`;
  const correlationId = req.headers.get("x-correlation-id") || requestId;
  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    "Idempotency-Key": idempotencyKey,
    "X-Request-Id": requestId,
    "X-Correlation-Id": correlationId,
    ...buildSessionHeaders(req, requestSource),
  };
  if (options.forwardTransferOpsAuthorization) {
    const opsSecret = req.headers.get("x-international-transfer-ops-secret");
    if (opsSecret) headers["x-international-transfer-ops-secret"] = opsSecret;
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (body !== undefined) init.body = body;

  try {
    const res = await fetch(target, init);
    const text = await res.text();
    const response = passthroughResponseWithSession(text, res.status, res.headers.get("content-type") || "application/json", requestSource);
    response.headers.set("x-request-id", res.headers.get("x-request-id") || requestId);
    response.headers.set("x-correlation-id", res.headers.get("x-correlation-id") || correlationId);
    return response;
  } catch (error: any) {
    console.error("[backend-proxy] request failed", { target, error: error?.message || error });
    const response = NextResponse.json(
      { ...publicErrorPayload(error, { code: "backend_unavailable" }), request_id: requestId, correlation_id: correlationId },
      { status: 502 },
    );
    response.headers.set("x-request-id", requestId);
    response.headers.set("x-correlation-id", correlationId);
    return response;
  }
}
