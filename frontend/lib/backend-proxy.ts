import crypto from "crypto";
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

type ProxyOptions = {
  injectSession?: boolean;
  injectEtherfuseWebhookSecret?: boolean;
};

export async function proxyBackendApi(req: NextRequest, basePath: string, path: string[], options: ProxyOptions = {}) {
  const backendBase = getBackendBaseUrl();
  const qs = req.nextUrl.searchParams.toString();
  const target = `${backendBase}/${basePath.replace(/^\/|\/$/g, "")}/${path.join("/")}${qs ? `?${qs}` : ""}`;
  const rawBody = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const body = options.injectSession === false ? rawBody : augmentJsonBodyWithSession(rawBody, req);
  const idempotencyKey = req.headers.get("Idempotency-Key") ||
    `next_${crypto.createHash("sha256").update(`${req.method}:${target}:${body || ""}`).digest("hex")}`;
  const webhookSecret = options.injectEtherfuseWebhookSecret
    ? String(process.env.ETHERFUSE_WEBHOOK_SECRET || "").trim()
    : "";

  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    "Idempotency-Key": idempotencyKey,
    ...buildSessionHeaders(req),
  };

  if (webhookSecret) headers["X-Etherfuse-Webhook-Secret"] = webhookSecret;

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (body !== undefined) init.body = body;

  try {
    const res = await fetch(target, init);
    const text = await res.text();
    return passthroughResponseWithSession(text, res.status, res.headers.get("content-type") || "application/json");
  } catch (error: any) {
    console.error("[backend-proxy] request failed", { target, error: error?.message || error });
    return NextResponse.json(publicErrorPayload(error, { code: "backend_unavailable" }), { status: 502 });
  }
}
