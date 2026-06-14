import { NextRequest } from "next/server";
import { proxyBackendApi } from "@/lib/backend-proxy";

export async function POST(req: NextRequest) {
  return proxyBackendApi(req, "api/early-access", [], {
    injectSession: false,
    forwardHeaders: ["referer"],
  });
}
