export const SESSION_TTL_MS = 60 * 60 * 1000;

export function saveClientSession(sessionId?: string, sessionToken?: string) {
  if (typeof window === "undefined") return;

  if (sessionId) {
    localStorage.setItem("talk-to-stellar.sessionId", sessionId);
  }
  if (sessionToken) {
    localStorage.setItem("talk-to-stellar.sessionToken", sessionToken);
  }
  localStorage.setItem("talk-to-stellar.sessionCreatedAt", String(Date.now()));
}

export function clearClientSession() {
  if (typeof window === "undefined") return;

  localStorage.removeItem("talk-to-stellar.sessionId");
  localStorage.removeItem("talk-to-stellar.sessionToken");
  localStorage.removeItem("talk-to-stellar.sessionCreatedAt");
}

export function isClientSessionExpired() {
  if (typeof window === "undefined") return false;

  const sessionId = localStorage.getItem("talk-to-stellar.sessionId");
  if (!sessionId) return false;

  const createdAt = Number(localStorage.getItem("talk-to-stellar.sessionCreatedAt") || "0");
  if (!createdAt) return true;

  return Date.now() - createdAt > SESSION_TTL_MS;
}

export function redirectToExpiredLogin() {
  if (typeof window === "undefined") return;

  clearClientSession();
  window.location.href = "/login?expired=1";
}
