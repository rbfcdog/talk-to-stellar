import { NextRequest } from "next/server";
import { proxyBackendApi } from "@/lib/backend-proxy";

// This is a live proxy — never statically cache it (otherwise polled reads like
// the per-minute yield refresh keep returning the first response).
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function proxy(req: NextRequest, path: string[]) {
  return proxyBackendApi(req, "api", path, { injectSession: false });
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(req, path);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(req, path);
}
