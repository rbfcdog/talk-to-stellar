export type JwtPayload = Record<string, unknown>

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=")
  return atob(padded)
}

export function decodeJwtPayload<T extends JwtPayload = JwtPayload>(token: string): T | null {
  const payload = String(token || "").split(".")[1]
  if (!payload) return null

  try {
    const decoded = JSON.parse(decodeBase64Url(payload))
    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded as T
      : null
  } catch {
    return null
  }
}
