import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "https://talk-to-stellar-production-e284.up.railway.app";

async function proxy(req: NextRequest, path: string[]) {
  const sub = path.length ? `/${path.join("/")}` : "";
  const qs = req.nextUrl.searchParams.toString();
  const target = `${BACKEND}/api/scf${sub}${qs ? `?${qs}` : ""}`;

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return proxy(req, path);
}
