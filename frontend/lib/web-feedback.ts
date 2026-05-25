"use client"

export type WebChatFeedback = {
  id: string
  content: string
  createdAt: string
}

export const WEB_CHAT_FEEDBACK_EVENT = "talk-to-stellar:web-chat-feedback"
export const WEB_CHAT_FEEDBACK_CHANNEL = "talk-to-stellar-web-chat-feedback"
export const INTERMEDIATE_PAGE_CLOSE_DELAY_MS = 600
export const INTERMEDIATE_PAGE_CLOSE_COPY = "Esta tela fecha automaticamente."
const WEB_CHAT_FEEDBACK_KEY = "talk-to-stellar.webChatFeedbackQueue"

function generateFeedbackId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function sanitizeFeedbackText(content: string) {
  return String(content || "")
    .replace(/[\u2705\u2713\u26A0\u2B07\uFE0F]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .trim()
}

/** Queue a feedback message in localStorage + broadcast it so any open web chat tab picks it up. */
export function enqueueWebChatFeedback(content: string) {
  if (typeof window === "undefined") return
  const text = sanitizeFeedbackText(String(content || ""))
  if (!text) return

  const feedback: WebChatFeedback = {
    id: generateFeedbackId(),
    content: text,
    createdAt: new Date().toISOString(),
  }

  try {
    const current = JSON.parse(window.localStorage.getItem(WEB_CHAT_FEEDBACK_KEY) || "[]")
    const queue = Array.isArray(current) ? current : []
    queue.push(feedback)
    window.localStorage.setItem(WEB_CHAT_FEEDBACK_KEY, JSON.stringify(queue.slice(-25)))
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent(WEB_CHAT_FEEDBACK_EVENT, { detail: feedback }))
  } catch {}

  try {
    const channel = new BroadcastChannel(WEB_CHAT_FEEDBACK_CHANNEL)
    channel.postMessage(feedback)
    channel.close()
  } catch {}
}

/** Drain and return the queued web-chat feedback items, clearing the queue. */
export function consumeWebChatFeedback(): WebChatFeedback[] {
  if (typeof window === "undefined") return []
  try {
    const current = JSON.parse(window.localStorage.getItem(WEB_CHAT_FEEDBACK_KEY) || "[]")
    window.localStorage.removeItem(WEB_CHAT_FEEDBACK_KEY)
    return Array.isArray(current)
      ? current.filter((item) => typeof item?.content === "string" && item.content.trim())
      : []
  } catch {
    return []
  }
}

/** Close the current tab after a short delay (Telegram WebApp first, then window.close fallback). */
export function closeIntermediatePage(delayMs = INTERMEDIATE_PAGE_CLOSE_DELAY_MS) {
  if (typeof window === "undefined") return
  window.setTimeout(() => {
    try {
      ;(window as any).Telegram?.WebApp?.close?.()
    } catch {}
    try {
      window.close()
    } catch {}

    window.setTimeout(() => {
      try {
        if (!window.closed) window.location.replace("about:blank")
      } catch {}
    }, 250)
  }, delayMs)
}
