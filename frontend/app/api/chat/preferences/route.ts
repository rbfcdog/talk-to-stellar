import { NextResponse } from "next/server";
import { buildSessionHeaders, readSessionCookies, requestSessionSource } from "@/lib/server-session";

const getBackendBaseUrl = () => {
  const raw =
    process.env.BACKEND_URL ||
    process.env.AGENT_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_AGENT_API_URL ||
    "http://localhost:3001";

  return raw
    .replace(/\/api\/agent\/query\/?$/, "")
    .replace(/\/api\/agent\/?$/, "")
    .replace(/\/api\/?$/, "")
    .replace(/\/$/, "");
};

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "1", "yes", "sim", "on", "hidden", "hide"].includes(normalized)) return true;
  if (["false", "0", "no", "nao", "off", "visible", "show"].includes(normalized)) return false;
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const hideAmounts = normalizeBoolean(
      body?.hide_amounts ??
        body?.hideAmounts ??
        body?.amounts_hidden ??
        body?.amountsHidden
    );
    if (hideAmounts === null) {
      return NextResponse.json({ success: false, message: "hide_amounts must be boolean" }, { status: 400 });
    }

    const source = requestSessionSource(req, body);
    const session = readSessionCookies(req, source);
    const response = await fetch(`${getBackendBaseUrl()}/api/agent/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildSessionHeaders(req, source),
      },
      body: JSON.stringify({
        ...body,
        hide_amounts: hideAmounts,
        source: source || body?.source || "web",
        session_id: body?.session_id || body?.sessionId || session.sessionId || undefined,
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save preferences." }, { status: 502 });
  }
}
