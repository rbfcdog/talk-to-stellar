import { describe, expect, it } from "vitest"
import { calculateAssetDistribution } from "@/lib/asset-distribution"

describe("asset distribution", () => {
  it("omits zero balances and keeps displayed percentages summing to 100", () => {
    const distribution = calculateAssetDistribution([
      { asset: "BRL", value: 0 },
      { asset: "USDC", value: 6518.3582025 },
      { asset: "CETES", value: 0 },
      { asset: "XLM", value: 17.7910174 },
    ])

    expect(distribution.map((row) => row.asset)).toEqual(["USDC", "XLM"])
    expect(distribution.reduce((sum, row) => sum + row.percent, 0)).toBe(100)
    expect(distribution.find((row) => row.asset === "USDC")?.percent).toBe(100)
    expect(distribution.find((row) => row.asset === "XLM")?.percent).toBe(0)
  })

  it("does not inflate zero or dust balances with a fake minimum percentage", () => {
    const distribution = calculateAssetDistribution([
      { asset: "BRL", value: 0 },
      { asset: "USDC", value: 240 },
      { asset: "CETES", value: 0.00000001 },
      { asset: "XLM", value: 9241.3745059 },
    ])

    expect(distribution.map((row) => row.asset)).toEqual(["USDC", "XLM"])
    expect(distribution.reduce((sum, row) => sum + row.percent, 0)).toBe(100)
    expect(distribution.find((row) => row.asset === "BRL")).toBeUndefined()
    expect(distribution.find((row) => row.asset === "CETES")).toBeUndefined()
    expect(distribution.find((row) => row.asset === "USDC")?.percent).toBe(3)
    expect(distribution.find((row) => row.asset === "XLM")?.percent).toBe(97)
  })

  it("does not invent distribution for empty wallets", () => {
    expect(calculateAssetDistribution([
      { asset: "BRL", value: 0 },
      { asset: "USDC", value: 0 },
    ])).toEqual([])
  })
})
