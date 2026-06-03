"use client"

type ResearchStatus = "observed" | "started" | "success" | "blocked" | "error" | "feedback"

type TrackUserResearchEventInput = {
  eventName: string
  eventGroup?: string
  taskLabel?: string
  status?: ResearchStatus
  feedbackText?: string
  evidenceUrl?: string
  evidenceType?: string
  operationId?: string
  transactionHash?: string
  metadata?: Record<string, unknown>
  dedupeKey?: string
}

function currentChannel() {
  if (typeof window === "undefined") return "web"
  const params = new URLSearchParams(window.location.search)
  const candidates = [
    params.get("channel"),
    params.get("provider"),
    params.get("external_provider"),
    params.get("source"),
    params.get("from"),
    params.get("origin"),
  ]
  const normalized = candidates
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean)
  if (!normalized) return "web"
  if (normalized.includes("whatsapp") || normalized === "phone" || normalized.includes("evolution")) return "whatsapp"
  if (normalized.includes("telegram")) return "telegram"
  return normalized
}

function currentRoute() {
  if (typeof window === "undefined") return ""
  return `${window.location.pathname}${window.location.search || ""}`
}

function currentPageUrl() {
  if (typeof window === "undefined") return ""
  return window.location.href
}

function currentNetwork() {
  return (
    process.env.NEXT_PUBLIC_STELLAR_NETWORK ||
    process.env.NEXT_PUBLIC_NETWORK ||
    process.env.NEXT_PUBLIC_CHAIN_ENV ||
    ""
  )
}

export function trackUserResearchEvent(input: TrackUserResearchEventInput) {
  if (typeof window === "undefined") return
  const eventName = String(input.eventName || "").trim()
  if (!eventName) return

  const body = {
    event_name: eventName,
    event_group: input.eventGroup || undefined,
    task_label: input.taskLabel || undefined,
    status: input.status || "observed",
    feedback_text: input.feedbackText || undefined,
    evidence_url: input.evidenceUrl || undefined,
    evidence_type: input.evidenceType || undefined,
    operation_id: input.operationId || undefined,
    transaction_hash: input.transactionHash || undefined,
    metadata: input.metadata || {},
    dedupe_key: input.dedupeKey || undefined,
    channel: currentChannel(),
    source: currentChannel(),
    page_url: currentPageUrl(),
    route: currentRoute(),
    stellar_network: currentNetwork(),
  }

  window.setTimeout(() => {
    fetch("/api/financial/user-research-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      // Evidence tracking must never block product usage.
    })
  }, 0)
}
