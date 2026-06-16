import { NextRequest, NextResponse } from "next/server";

const RAILWAY_BACKEND_URL = "https://talk-to-stellar-production-e284.up.railway.app";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function backendCandidates(request: NextRequest) {
  const configured = [
    process.env.BACKEND_URL,
    process.env.NEXT_PUBLIC_BACKEND_URL,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map(normalizeBaseUrl);

  const host = request.nextUrl.hostname;
  const localDefault = host === "localhost" || host === "127.0.0.1"
    ? "http://localhost:3001"
    : RAILWAY_BACKEND_URL;

  return Array.from(new Set([...configured, localDefault, RAILWAY_BACKEND_URL]));
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  return String(data.message || data.error || data.code || fallback);
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      error: "backend_non_json_response",
      backend_response_preview: text.slice(0, 500),
    };
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const headers = {
    "Content-Type": "application/json",
    "x-international-transfer-ops-secret": request.headers.get("x-international-transfer-ops-secret") || "",
    "x-ops-token": request.headers.get("x-ops-token") || "",
    authorization: request.headers.get("authorization") || "",
  };
  const errors: Array<Record<string, unknown>> = [];

  for (const backendUrl of backendCandidates(request)) {
    const target = `${backendUrl}/api/transfers/wire-test/send`;
    try {
      const response = await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = await readResponse(response);
      const payload = data && typeof data === "object"
        ? {
            ...(data as Record<string, unknown>),
            backend_url: backendUrl,
            backend_http_status: response.status,
          }
        : {
            success: false,
            backend_url: backendUrl,
            backend_http_status: response.status,
            error: "backend_invalid_response",
          };

      return NextResponse.json(payload, { status: response.status });
    } catch (error) {
      errors.push({
        backend_url: backendUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const lastError = errors[errors.length - 1];
  const message = errorMessageFromPayload(
    lastError,
    "Could not reach the wire payout backend. Check BACKEND_URL and backend deployment status.",
  );

  return NextResponse.json(
    {
      success: false,
      code: "wire_backend_unreachable",
      message,
      attempts: errors,
    },
    { status: 502 },
  );
}
