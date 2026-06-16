import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const response = await fetch(`${BACKEND_URL}/api/transfers/wire-test/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-international-transfer-ops-secret": request.headers.get("x-international-transfer-ops-secret") || "",
        "x-ops-token": request.headers.get("x-ops-token") || "",
        authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Wire test proxy error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to proxy request to backend" },
      { status: 500 }
    );
  }
}
