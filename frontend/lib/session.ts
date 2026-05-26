export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_CREATED_AT_KEY = "talk-to-stellar.sessionCreatedAt";
const SESSION_LAST_SEEN_AT_KEY = "talk-to-stellar.sessionLastSeenAt";
const SESSION_ID_KEY = "talk-to-stellar.sessionId";
const SESSION_TOKEN_KEY = "talk-to-stellar.sessionToken";
const SESSION_REQUEST_TIMEOUT_MS = 5000;

function normalizeTimestamp(raw: string | null): number {
  const parsed = Number(raw || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  // Backward compatibility in case a value was persisted in seconds.
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

/** Read the server's view of the current session (sessionId + authenticated flag) via /api/session. */
export async function getClientSession(): Promise<{ sessionId: string; authenticated: boolean }> {
  if (typeof window === "undefined") return { sessionId: "", authenticated: false };
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      sessionId: String(payload?.session_id || payload?.sessionId || "").trim(),
      authenticated: Boolean(payload?.authenticated),
    };
  } catch {
    return { sessionId: "", authenticated: false };
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Stamp localStorage with a fresh session timestamp. Session id/token now live in HttpOnly cookies set server-side. */
export function saveClientSession() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(SESSION_ID_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
  const now = String(Date.now());
  localStorage.setItem(SESSION_CREATED_AT_KEY, now);
  localStorage.setItem(SESSION_LAST_SEEN_AT_KEY, now);
}

/** Wipe local session timestamps and ask /api/session to clear the server-side cookies. */
export function clearClientSession() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(SESSION_ID_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_CREATED_AT_KEY);
  localStorage.removeItem(SESSION_LAST_SEEN_AT_KEY);
  fetch("/api/session", { method: "DELETE", cache: "no-store" }).catch(() => {});
}

/** Update the "last seen" timestamp so the session TTL window slides forward. */
export function touchClientSessionActivity() {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_LAST_SEEN_AT_KEY, String(Date.now()));
}

/** True when the locally-tracked session has been idle longer than SESSION_TTL_MS. */
export function isClientSessionExpired() {
  if (typeof window === "undefined") return false;

  if (localStorage.getItem(SESSION_ID_KEY) || localStorage.getItem(SESSION_TOKEN_KEY)) {
    localStorage.removeItem(SESSION_ID_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    return false;
  }

  let createdAt = normalizeTimestamp(localStorage.getItem(SESSION_CREATED_AT_KEY));
  if (!createdAt) {
    createdAt = Date.now();
    localStorage.setItem(SESSION_CREATED_AT_KEY, String(createdAt));
  }
  const lastSeenAt = normalizeTimestamp(localStorage.getItem(SESSION_LAST_SEEN_AT_KEY));
  const anchor = Math.max(createdAt, lastSeenAt || 0);
  if (!anchor) return false;

  return Date.now() - anchor > SESSION_TTL_MS;
}

/** Clear local session state and send the browser to /login?expired=1. */
export function redirectToExpiredLogin() {
  if (typeof window === "undefined") return;

  clearClientSession();
  window.location.href = "/login?expired=1";
}
