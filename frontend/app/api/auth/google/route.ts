import { NextResponse } from "next/server"
import { jsonResponseWithSession } from "@/lib/server-session"

function getBackendBaseUrl() {
  const fromBackend = process.env.BACKEND_URL
  if (fromBackend) return fromBackend.replace(/\/$/, "")

  const fromAgent = process.env.AGENT_API_URL
  if (fromAgent) return fromAgent.replace(/\/api\/agent\/query$/, "").replace(/\/$/, "")

  const fromPublic =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_AGENT_API_URL ||
    ""

  if (!fromPublic) return "http://localhost:3001"
  return fromPublic.replace(/\/api\/agent\/query$/, "").replace(/\/$/, "")
}

export async function POST(req: Request) {
  const backendBase = getBackendBaseUrl()
  const body = await req.text()

  const response = await fetch(`${backendBase}/api/auth/google`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    return NextResponse.json(payload, { status: response.status })
  }

  return jsonResponseWithSession(payload, { status: 200 })
}
