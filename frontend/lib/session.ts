export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_CREATED_AT_KEY = "talk-to-stellar.sessionCreatedAt";
const SESSION_LAST_SEEN_AT_KEY = "talk-to-stellar.sessionLastSeenAt";
const SESSION_ID_KEY = "talk-to-stellar.sessionId";

function normalizeTimestamp(raw: string | null): number {
  const parsed = Number(raw || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  // Backward compatibility in case a value was persisted in seconds.
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

export function saveClientSession(sessionId?: string, sessionToken?: string) {
  if (typeof window === "undefined") return;

  if (sessionId) {
    localStorage.setItem("talk-to-stellar.sessionId", sessionId);
  }
  if (sessionToken) {
    localStorage.setItem("talk-to-stellar.sessionToken", sessionToken);
  }
  const now = String(Date.now());
  localStorage.setItem(SESSION_CREATED_AT_KEY, now);
  localStorage.setItem(SESSION_LAST_SEEN_AT_KEY, now);
}

export function clearClientSession() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(SESSION_ID_KEY);
  localStorage.removeItem("talk-to-stellar.sessionToken");
  localStorage.removeItem(SESSION_CREATED_AT_KEY);
  localStorage.removeItem(SESSION_LAST_SEEN_AT_KEY);
}

export function touchClientSessionActivity() {
  if (typeof window === "undefined") return;
  const sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) return;
  localStorage.setItem(SESSION_LAST_SEEN_AT_KEY, String(Date.now()));
}

export function isClientSessionExpired() {
  if (typeof window === "undefined") return false;

  const sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) return false;

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

export function redirectToExpiredLogin() {
  if (typeof window === "undefined") return;

  clearClientSession();
  window.location.href = "/login?expired=1";
}
