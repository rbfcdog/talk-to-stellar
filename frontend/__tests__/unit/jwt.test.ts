import { describe, expect, it } from "vitest"
import { decodeJwtPayload } from "@/lib/jwt"

function tokenFor(payload: unknown) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `header.${encoded}.signature`
}

describe("decodeJwtPayload", () => {
  it("decodes base64url object payloads", () => {
    expect(decodeJwtPayload(tokenFor({ provider: "whatsapp", session_id: "session-1" }))).toEqual({
      provider: "whatsapp",
      session_id: "session-1",
    })
  })

  it("returns null for malformed tokens and non-object payloads", () => {
    expect(decodeJwtPayload("not-a-token")).toBeNull()
    expect(decodeJwtPayload(tokenFor(["unexpected"]))).toBeNull()
    expect(decodeJwtPayload("header.%%%.signature")).toBeNull()
  })
})
