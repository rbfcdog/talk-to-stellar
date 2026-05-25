function stableStringify(value: any): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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
export function buildIdempotencyKey(scope: string, payload: any) {
  const source = stableStringify({ scope, payload });
  return `tts_${hashString(source)}_${hashString(`${source}:v2`)}`;
}

/** Return the idempotency key for this scope+payload, persisting it in sessionStorage so retries reuse it. */
export function getOrCreateIdempotencyKey(scope: string, payload: any) {
  const key = buildIdempotencyKey(scope, payload);
  if (typeof window === "undefined") return key;

  const storageKey = `talk-to-stellar.idempotency.${scope}.${key}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  sessionStorage.setItem(storageKey, key);
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
