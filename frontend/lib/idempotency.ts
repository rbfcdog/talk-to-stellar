import { safeSessionStorage } from "./browser-storage";

function stableStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const type = typeof value;
  if (type === "number") return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
  if (type === "bigint") return `bigint:${String(value)}`;
  if (type === "string" || type === "boolean") return JSON.stringify(value);
  if (type === "symbol" || type === "function") return JSON.stringify(String(value));

  if (value instanceof Date) return `date:${Number.isNaN(value.getTime()) ? "invalid" : value.toISOString()}`;

  if (Array.isArray(value)) {
    if (seen.has(value)) return '"[Circular]"';
    seen.add(value);
    const serialized = `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
    seen.delete(value);
    return serialized;
  }

  if (type === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) return '"[Circular]"';
    seen.add(objectValue);
    const serialized = `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key], seen)}`)
      .join(",")}}`;
    seen.delete(objectValue);
    return serialized;
  }

  return JSON.stringify(String(value));
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return body || "";
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/** Build a deterministic idempotency key from a scope label + JSON-serializable payload. */
export function buildIdempotencyKey(scope: string, payload: unknown) {
  const source = stableStringify({ scope, payload });
  return `tts_${hashString(source)}_${hashString(`${source}:v2`)}`;
}

/** Return the idempotency key for this scope+payload, persisting it in sessionStorage so retries reuse it. */
export function getOrCreateIdempotencyKey(scope: string, payload: unknown) {
  const key = buildIdempotencyKey(scope, payload);
  if (typeof window === "undefined") return key;

  try {
    const storageKey = `talk-to-stellar.idempotency.${hashString(scope)}.${key}`;
    const existing = safeSessionStorage.get(storageKey);
    if (existing) return existing;
    safeSessionStorage.set(storageKey, key);
  } catch {
    return key;
  }

  return key;
}

/** fetch() wrapper that injects an Idempotency-Key header on mutating methods. */
export function idempotentFetch(input: RequestInfo | URL, init: RequestInit = {}, scope?: string) {
  const method = String(init.method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return fetch(input, init);
  }

  const headers = new Headers(init.headers || {});
  if (!headers.has("Idempotency-Key")) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    headers.set("Idempotency-Key", getOrCreateIdempotencyKey(scope || url, parseBody(init.body)));
  }

  return fetch(input, { ...init, headers });
}
