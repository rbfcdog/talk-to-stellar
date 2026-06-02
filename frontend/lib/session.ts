export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_CREATED_AT_KEY = "talk-to-stellar.sessionCreatedAt";
const SESSION_LAST_SEEN_AT_KEY = "talk-to-stellar.sessionLastSeenAt";
const SESSION_ID_KEY = "talk-to-stellar.sessionId";
const SESSION_TOKEN_KEY = "talk-to-stellar.sessionToken";
const SESSION_REQUEST_TIMEOUT_MS = 5000;

export type ClientSession = {
  sessionId: string;
  authenticated: boolean;
  sessionSource: string;
  externalPriority: boolean;
};

function normalizeTimestamp(raw: string | null): number {
  const parsed = Number(raw || "0");
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  // Backward compatibility in case a value was persisted in seconds.
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}

const EMPTY_CLIENT_SESSION: ClientSession = {
  sessionId: "",
  authenticated: false,
  sessionSource: "",
  externalPriority: false,
};

export function normalizeClientSessionSource(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "telegram" || normalized.includes("telegram")) return "telegram";
  if (
    normalized === "whatsapp" ||
    normalized === "phone" ||
    normalized === "evolution" ||
    normalized === "whatsapp_evolution" ||
    normalized === "whatsapp-evolution" ||
    normalized.includes("whatsapp")
  ) return "whatsapp";
  if (normalized === "web" || normalized === "browser" || normalized === "chat" || normalized === "chat_link") return "web";
  return normalized;
}

export function currentPageSessionSource(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search || "");
  const candidates = [
    params.get("external_provider"),
    params.get("externalProvider"),
    params.get("provider"),
    params.get("channel"),
    params.get("session_source"),
    params.get("sessionSource"),
    params.get("external_source"),
    params.get("externalSource"),
    params.get("source"),
    params.get("session_scope"),
    params.get("from"),
    params.get("origin"),
  ];
  const normalized = candidates.map(normalizeClientSessionSource).filter(Boolean);
  return normalized.find((source) => source === "whatsapp" || source === "telegram") || normalized[0] || "";
}

export function currentClientSessionScope(): string {
  return normalizeClientSessionSource(currentPageSessionSource()) || "web";
}

export function scopedClientStorageKey(baseKey: string, source?: unknown): string {
  const scope = normalizeClientSessionSource(source) || currentClientSessionScope();
  return `${baseKey}:${scope || "web"}`;
}

function removeScopedAndLegacySessionSecret(key: string, source: string) {
  localStorage.removeItem(scopedClientStorageKey(key, source));
  if (source === "web") localStorage.removeItem(key);
}

function readScopedTimestamp(key: string, source: string): number {
  const scoped = normalizeTimestamp(localStorage.getItem(scopedClientStorageKey(key, source)));
  if (scoped || source !== "web") return scoped;
  return normalizeTimestamp(localStorage.getItem(key));
}

function writeScopedTimestamp(key: string, source: string, value: string) {
  localStorage.setItem(scopedClientStorageKey(key, source), value);
  if (source === "web") localStorage.setItem(key, value);
}

/** Read the server's view of the current session via /api/session. */
export async function getClientSession(): Promise<ClientSession> {
  if (typeof window === "undefined") return EMPTY_CLIENT_SESSION;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS);
  const source = currentPageSessionSource();
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  try {
    const response = await fetch(`/api/session${qs}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      sessionId: String(payload?.session_id || payload?.sessionId || "").trim(),
      authenticated: Boolean(payload?.authenticated),
      sessionSource: String(payload?.session_source || payload?.sessionSource || "").trim(),
      externalPriority: Boolean(payload?.external_priority || payload?.externalPriority),
    };
  } catch {
    return EMPTY_CLIENT_SESSION;
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Stamp localStorage with a fresh session timestamp. Session id/token now live in HttpOnly cookies set server-side. */
export function saveClientSession() {
  if (typeof window === "undefined") return;

  const source = currentClientSessionScope();
  removeScopedAndLegacySessionSecret(SESSION_ID_KEY, source);
  removeScopedAndLegacySessionSecret(SESSION_TOKEN_KEY, source);
  const now = String(Date.now());
  writeScopedTimestamp(SESSION_CREATED_AT_KEY, source, now);
  writeScopedTimestamp(SESSION_LAST_SEEN_AT_KEY, source, now);
}

/** Wipe local session timestamps and ask /api/session to clear the server-side cookies. */
export function clearClientSession() {
  if (typeof window === "undefined") return;

  const source = currentClientSessionScope();
  const keys = [SESSION_ID_KEY, SESSION_TOKEN_KEY, SESSION_CREATED_AT_KEY, SESSION_LAST_SEEN_AT_KEY];
  for (const key of keys) {
    localStorage.removeItem(scopedClientStorageKey(key, source));
    if (source === "web") localStorage.removeItem(key);
  }
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  fetch(`/api/session${qs}`, { method: "DELETE", cache: "no-store" }).catch(() => {});
}

/** Update the "last seen" timestamp so the session TTL window slides forward. */
export function touchClientSessionActivity() {
  if (typeof window === "undefined") return;
  writeScopedTimestamp(SESSION_LAST_SEEN_AT_KEY, currentClientSessionScope(), String(Date.now()));
}

/** True when the locally-tracked session has been idle longer than SESSION_TTL_MS. */
export function isClientSessionExpired() {
  if (typeof window === "undefined") return false;

  const source = currentClientSessionScope();
  const scopedIdKey = scopedClientStorageKey(SESSION_ID_KEY, source);
  const scopedTokenKey = scopedClientStorageKey(SESSION_TOKEN_KEY, source);
  const legacyId = source === "web" ? localStorage.getItem(SESSION_ID_KEY) : null;
  const legacyToken = source === "web" ? localStorage.getItem(SESSION_TOKEN_KEY) : null;
  if (localStorage.getItem(scopedIdKey) || localStorage.getItem(scopedTokenKey) || legacyId || legacyToken) {
    removeScopedAndLegacySessionSecret(SESSION_ID_KEY, source);
    removeScopedAndLegacySessionSecret(SESSION_TOKEN_KEY, source);
    return false;
  }

  let createdAt = readScopedTimestamp(SESSION_CREATED_AT_KEY, source);
  if (!createdAt) {
    createdAt = Date.now();
    writeScopedTimestamp(SESSION_CREATED_AT_KEY, source, String(createdAt));
  }
  const lastSeenAt = readScopedTimestamp(SESSION_LAST_SEEN_AT_KEY, source);
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
