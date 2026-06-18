import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://talk-to-stellar-production-e284.up.railway.app";

export async function GET(request: NextRequest) {
  return proxy(request);
}

export async function POST(request: NextRequest) {
  return proxy(request);
}

export async function PUT(request: NextRequest) {
  return proxy(request);
}

export async function DELETE(request: NextRequest) {
  return proxy(request);
}

async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname.replace("/api/bridge", "");
  const target = `${BACKEND_URL}/api/bridge${path}${request.nextUrl.search}`;

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
      },
      body: request.method !== "GET" && request.method !== "HEAD"
        ? await request.text()
        : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Bridge backend unreachable" },
      { status: 502 },
    );
  }
}
