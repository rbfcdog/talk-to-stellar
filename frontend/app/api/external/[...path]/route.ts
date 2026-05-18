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

const PUBLIC_SHORT_LINK_PATHS = ["/create-account", "/login", "/confirm-payment"];
const PUBLIC_SHORT_LINK_PURPOSES = new Set([
  "create_account_passkey_qr",
  "login_passkey_qr",
  "confirm_payment_passkey_qr",
]);

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
  const qs = req.nextUrl.searchParams.toString();
  const target = `${backendBase}/api/external/${path.join("/")}${qs ? `?${qs}` : ""}`;
  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const inboundIdempotencyKey = req.headers.get("Idempotency-Key");
  const isShortLinkCreate = req.method === "POST" && path.join("/") === "short-links";

  if (isShortLinkCreate) {
    const validationError = validateShortLinkPayload(body || "", req.nextUrl.origin);
    if (validationError) {
      return NextResponse.json({ success: false, message: validationError }, { status: 400 });
    }
  }

  const headers: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    "x-frontend-origin": req.nextUrl.origin,
  };
  if (inboundIdempotencyKey) {
    headers["Idempotency-Key"] = inboundIdempotencyKey;
  }
  if (process.env.SHORT_LINK_PROXY_SECRET || process.env.INTERNAL_API_SECRET) {
    headers["x-internal-api-secret"] = process.env.SHORT_LINK_PROXY_SECRET || process.env.INTERNAL_API_SECRET || "";
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
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        message: `Proxy error: ${error?.message || "fetch failed"}. Check BACKEND_URL or AGENT_API_URL on frontend deployment.`,
        target,
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
