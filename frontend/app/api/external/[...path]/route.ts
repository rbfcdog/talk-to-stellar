import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  augmentJsonBodyWithSession,
  buildSessionHeaders,
  passthroughResponseWithSession,
  readSessionCookies,
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

const PUBLIC_SHORT_LINK_PATHS = ["/create-account", "/login", "/confirm-payment", "/send-external", "/setup-passkey"];
const PUBLIC_SHORT_LINK_PURPOSES = new Set([
  "create_account_passkey_qr",
  "login_passkey_qr",
  "confirm_payment_passkey_qr",
  "setup_passkey_agent",
  "send_external_wallet",
]);

function looksLikeTechnicalError(value: unknown) {
  return /duplicate key|unique constraint|violates unique|idx_[a-z0-9_]+|23505|schema cache|relation .* does not exist/i.test(
    String(value || ""),
  );
}

function sanitizeBackendErrorResponse(text: string, status: number, contentType: string, requestId: string) {
  if (!contentType.includes("application/json") || status < 400) return null;

  try {
    const payload = JSON.parse(text || "{}");
    const rawMessage = payload?.message || payload?.error || "";
    if (!looksLikeTechnicalError(rawMessage)) return null;

    return NextResponse.json(
      {
        ...payload,
        ...publicErrorPayload(rawMessage, { code: payload?.code || "backend_error" }),
        request_id: requestId,
      },
      { status, headers: { "x-request-id": requestId } },
    );
  } catch {
    return null;
  }
}

function isAccountCreationPath(path: string[]) {
  const joined = path.join("/");
  return joined === "finalize" || joined === "check-account" || joined === "validate-token";
}

function safeBackendErrorSummary(text: string, contentType: string): Record<string, unknown> {
  if (!contentType.includes("application/json")) return {};
  try {
    const payload = JSON.parse(text || "{}");
    return {
      code: payload?.code || undefined,
      message: payload?.message || payload?.error || undefined,
      processing: payload?.processing === true || undefined,
      used: payload?.used === true || payload?.alreadyCompleted === true || undefined,
      email_confirmation_required: payload?.emailConfirmationRequired === true || undefined,
    };
  } catch {
    return {};
  }
}

function isLocalOrigin(origin: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function isAllowedShortLinkPath(pathname: string) {
  return PUBLIC_SHORT_LINK_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function validateShortLinkPayload(body: string, frontendOrigin: string): string | null {
  let payload: any;
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return "Invalid short-link payload.";
  }

  const purpose = String(payload?.purpose || "qr_passkey_confirm").trim().toLowerCase();
  if (!PUBLIC_SHORT_LINK_PURPOSES.has(purpose)) {
    return "Short-link purpose is not allowed.";
  }

  let url: URL;
  try {
    url = new URL(String(payload?.url || ""));
  } catch {
    return "Short-link URL is invalid.";
  }

  if (url.origin !== frontendOrigin) {
    return "Short-link URL must target this frontend origin.";
  }

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalOrigin(url.origin))) {
    return "Short-link URL must use HTTPS.";
  }

  if (!isAllowedShortLinkPath(url.pathname)) {
    return "Short-link path is not allowed.";
  }

  return null;
}

async function proxy(req: NextRequest, path: string[]) {
  const backendBase = getBackendBaseUrl();
  const pathText = path.join("/");
  const requestId = req.headers.get("x-request-id") || `external_${crypto.randomUUID()}`;
  const trackAccountCreation = isAccountCreationPath(path);
  const qs = req.nextUrl.searchParams.toString();
  const target = `${backendBase}/api/external/${pathText}${qs ? `?${qs}` : ""}`;
  const rawBody = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const requestSource = requestSessionSourceFromBody(req, rawBody);
  const body = augmentJsonBodyWithSession(rawBody, req);
  const inboundIdempotencyKey = req.headers.get("Idempotency-Key");
  const isShortLinkCreate = req.method === "POST" && pathText === "short-links";
  const session = readSessionCookies(req, requestSource);

  if (isShortLinkCreate) {
    const validationError = validateShortLinkPayload(body || "", req.nextUrl.origin);
    if (validationError) {
      return NextResponse.json({ success: false, message: validationError }, { status: 400 });
    }
  }

  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    "x-frontend-origin": req.nextUrl.origin,
    "x-request-id": requestId,
    ...buildSessionHeaders(req, requestSource),
  };
  if (inboundIdempotencyKey) {
    headers["Idempotency-Key"] = inboundIdempotencyKey;
  }
  if (isShortLinkCreate && (process.env.SHORT_LINK_PROXY_SECRET || process.env.INTERNAL_API_SECRET)) {
    headers["x-short-link-proxy-secret"] = process.env.SHORT_LINK_PROXY_SECRET || process.env.INTERNAL_API_SECRET || "";
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (body !== undefined) {
    init.body = body;
  }

  try {
    if (trackAccountCreation) {
      console.log("[external-proxy] account_start", {
        request_id: requestId,
        method: req.method,
        path: pathText,
        backend_base: backendBase,
        has_session: Boolean(session.sessionId && session.sessionToken),
        has_idempotency_key: Boolean(inboundIdempotencyKey),
      });
    }
    const res = await fetch(target, init);
    const text = await res.text();
    const contentType = res.headers.get("content-type") || "application/json";
    if (trackAccountCreation) {
      const fields = {
        request_id: requestId,
        method: req.method,
        path: pathText,
        status: res.status,
        ok: res.ok,
        response_bytes: text.length,
        ...safeBackendErrorSummary(text, contentType),
      };
      if (res.ok) {
        console.log("[external-proxy] account_response", fields);
      } else {
        console.error("[external-proxy] account_response_failed", fields);
      }
    }
    const sanitized = sanitizeBackendErrorResponse(text, res.status, contentType, requestId);
    if (sanitized) return sanitized;
    const response = passthroughResponseWithSession(text, res.status, res.headers.get("content-type") || "application/json", requestSource);
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error: any) {
    console.error("[external-proxy] request failed", {
      request_id: requestId,
      path: pathText,
      target,
      error: error?.message || error,
    });
    const response = NextResponse.json(
      { ...publicErrorPayload(error, { code: "external_service_unavailable", prefix: "EXT" }), request_id: requestId },
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
