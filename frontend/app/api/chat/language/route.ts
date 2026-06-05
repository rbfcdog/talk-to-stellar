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

function normalizeLanguage(value: unknown): "pt-BR" | "en" | "" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-") || normalized.includes("english")) return "en";
  if (normalized === "pt" || normalized === "pt-br" || normalized.startsWith("pt-") || normalized.includes("portugu")) return "pt-BR";
  return "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const language = normalizeLanguage(body?.language || body?.lang || body?.locale);
    if (!language) {
      return NextResponse.json({ success: false, message: "language must be en or pt-BR" }, { status: 400 });
    }

    const source = requestSessionSource(req, body);
    const session = readSessionCookies(req, source);
    const response = await fetch(`${getBackendBaseUrl()}/api/agent/language`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildSessionHeaders(req, source),
      },
      body: JSON.stringify({
        ...body,
        language,
        source: source || body?.source || "web",
        session_id: body?.session_id || body?.sessionId || session.sessionId || undefined,
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save language preference." }, { status: 502 });
  }
}
