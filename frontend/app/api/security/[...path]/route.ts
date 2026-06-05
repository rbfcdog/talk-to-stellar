import { NextRequest } from "next/server";
import { proxyBackendApi } from "@/lib/backend-proxy";

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyBackendApi(req, "api/security", params.path || []);
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyBackendApi(req, "api/security", params.path || []);
}
