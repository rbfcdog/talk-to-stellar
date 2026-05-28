import { describe, expect, it } from "vitest"
import { extractDefindexPositionAmount } from "@/lib/defindex-position"

describe("extractDefindexPositionAmount", () => {
  it("converts DeFindex integer contract units to decimal amounts", () => {
    expect(extractDefindexPositionAmount({ balance: 8911209 })).toBe("0.8911209")
    expect(extractDefindexPositionAmount({ amount: "1000000000" })).toBe("100")
  })

  it("prefers underlying balance units over vault share counts", () => {
    expect(extractDefindexPositionAmount({
      dfTokens: 8911209,
      underlyingBalance: [1000000000],
    })).toBe("100")
  })

  it("keeps explicit decimal display fields as decimal values", () => {
    expect(extractDefindexPositionAmount({
      amount_decimal: "100.25",
      underlyingBalance: [1002500000],
    })).toBe("100.25")
  })

  it("sums multi-asset underlying balance arrays", () => {
    expect(extractDefindexPositionAmount({
      underlyingBalance: [500000000, "250000000"],
    })).toBe("75")
  })
})
