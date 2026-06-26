import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "https://talk-to-stellar-production-e284.up.railway.app";

export async function POST(request: NextRequest) {
  return proxy(request);
}

export async function GET(request: NextRequest) {
  return proxy(request);
}

export async function DELETE(request: NextRequest) {
  return proxy(request);
}

async function proxy(request: NextRequest) {
  const url = new URL(request.url);
  const rawPath =
    request.headers.get("x-bridge-path") ||
    url.searchParams.get("_path") ||
    "/customers";
  const [pathOnly, queryString] = rawPath.split("?");
  const targetQuery = queryString ? `?${queryString}` : url.search;
  const target = `${BACKEND}/api/bridge${pathOnly}${targetQuery}`;
  const bridgePw = request.cookies.get("bridge_pw")?.value || request.headers.get("x-bridge-password") || "";

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        ...(bridgePw ? { "x-bridge-password": bridgePw } : {}),
      },
      body: request.method !== "GET" && request.method !== "HEAD"
        ? await request.text()
        : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { success: false, message: "Backend unreachable" },
      { status: 502 },
    );
  }
}
