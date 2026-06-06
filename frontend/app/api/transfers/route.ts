import { NextRequest } from "next/server";
import { proxyBackendApi } from "@/lib/backend-proxy";

export async function GET(req: NextRequest) {
  return proxyBackendApi(req, "api/transfers", [], { forwardTransferOpsAuthorization: true });
}

export async function POST(req: NextRequest) {
  return proxyBackendApi(req, "api/transfers", [], { forwardTransferOpsAuthorization: true });
}
