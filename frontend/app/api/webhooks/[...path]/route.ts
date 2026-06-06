import { NextRequest } from "next/server";
import { proxyBackendApi } from "@/lib/backend-proxy";

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxyBackendApi(req, "api/webhooks", params.path || [], {
    injectSession: false,
  });
}
