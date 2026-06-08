import { NextRequest } from "next/server";
import { proxyBackendApi } from "@/lib/backend-proxy";

const EVOLUTION_FORWARD_HEADERS = [
  "authorization",
  "x-evolution-webhook-secret",
  "x-evolution-diagnostic-secret",
  "x-internal-api-secret",
];

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyBackendApi(req, "api/evolution", params.path || [], {
    injectSession: false,
    forwardHeaders: EVOLUTION_FORWARD_HEADERS,
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyBackendApi(req, "api/evolution", params.path || [], {
    injectSession: false,
    forwardHeaders: EVOLUTION_FORWARD_HEADERS,
  });
}
