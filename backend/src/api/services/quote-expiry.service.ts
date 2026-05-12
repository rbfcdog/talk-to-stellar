const DEFAULT_QUOTE_TTL_SECONDS = 30;

function configuredTtlSeconds(): number {
  const raw = Number(process.env.QUOTE_TTL_SECONDS || DEFAULT_QUOTE_TTL_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_QUOTE_TTL_SECONDS;
  return Math.min(Math.max(Math.floor(raw), 5), 300);
}

export function quoteTtlSeconds(): number {
  return configuredTtlSeconds();
}

export function attachQuoteExpiry<T extends Record<string, any>>(quote: T, now = Date.now()): T & {
  quote_issued_at: string;
  quote_expires_at: string;
  quote_ttl_seconds: number;
} {
  const ttl = quoteTtlSeconds();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttl * 1000).toISOString();
  return {
    ...quote,
    quote_issued_at: String((quote as any).quote_issued_at || (quote as any).issued_at || issuedAt),
    quote_expires_at: String((quote as any).quote_expires_at || (quote as any).expires_at || expiresAt),
    quote_ttl_seconds: Number((quote as any).quote_ttl_seconds || (quote as any).ttl_seconds || ttl),
  };
}

export function getQuoteExpiry(payload: any): string {
  return String(
    payload?.quote_expires_at ||
    payload?.quote?.quote_expires_at ||
    payload?.quote?.expires_at ||
    ''
  ).trim();
}

export function getQuoteIssuedAt(payload: any): string {
  return String(
    payload?.quote_issued_at ||
    payload?.quote?.quote_issued_at ||
    payload?.quote?.issued_at ||
    ''
  ).trim();
}

export function isQuoteExpired(payload: any, now = Date.now()): boolean {
  const expiresAt = getQuoteExpiry(payload);
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp <= now;
}

export function quoteExpiryMessage(): string {
  return 'Cotação expirada. Solicite uma nova cotação para confirmar com preço atualizado.';
}
