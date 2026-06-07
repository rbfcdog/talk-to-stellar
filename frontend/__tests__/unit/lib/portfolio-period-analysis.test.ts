import { describe, expect, it } from "vitest"
import { analyzePortfolioPeriod } from "@/lib/portfolio-period-analysis"

const NOW = Date.parse("2026-06-07T12:00:00.000Z")
const HOURS = 60 * 60 * 1000
const DAYS = 24 * HOURS

describe("analyzePortfolioPeriod", () => {
  it("does not count deposits as portfolio return", () => {
    const result = analyzePortfolioPeriod({
      currentAmount: 60,
      days: 1,
      now: NOW,
      historyPoints: [
        { date: new Date(NOW - 2 * DAYS).toISOString(), amount: "50", delta: "50", action: "deposit" },
        { date: new Date(NOW - 2 * HOURS).toISOString(), amount: "60", delta: "10", action: "deposit" },
      ],
    })

    expect(result.change).toBe(0)
    expect(result.changePercent).toBe(0)
    expect(result.cashflowChange).toBe(10)
    expect(result.pointCount).toBe(1)
  })

  it("does not count withdrawals as portfolio loss", () => {
    const result = analyzePortfolioPeriod({
      currentAmount: 40,
      days: 1,
      now: NOW,
      historyPoints: [
        { date: new Date(NOW - 2 * DAYS).toISOString(), amount: "60", delta: "60", action: "deposit" },
        { date: new Date(NOW - 3 * HOURS).toISOString(), amount: "40", delta: "-20", action: "withdraw" },
      ],
    })

    expect(result.change).toBe(0)
    expect(result.changePercent).toBe(0)
    expect(result.cashflowChange).toBe(-20)
  })

  it("keeps only vault-originated growth after cashflow is removed", () => {
    const result = analyzePortfolioPeriod({
      currentAmount: 61,
      days: 1,
      now: NOW,
      historyPoints: [
        { date: new Date(NOW - 2 * DAYS).toISOString(), amount: "50", delta: "50", action: "deposit" },
        { date: new Date(NOW - 2 * HOURS).toISOString(), amount: "60", delta: "10", action: "deposit" },
      ],
    })

    expect(result.change).toBe(1)
    expect(result.cashflowChange).toBe(10)
    expect(result.changePercent).toBeCloseTo(1.6666, 3)
  })

  it("does not use stale points outside the selected window to invent current return", () => {
    const result = analyzePortfolioPeriod({
      currentAmount: 60,
      days: 1,
      now: NOW,
      historyPoints: [
        { date: new Date(NOW - 8 * DAYS).toISOString(), amount: "50", delta: "50", action: "deposit" },
      ],
    })

    expect(result.change).toBe(0)
    expect(result.changePercent).toBe(0)
    expect(result.pointCount).toBe(0)
  })

  it("can use non-cashflow balance observations as return evidence", () => {
    const result = analyzePortfolioPeriod({
      currentAmount: 60,
      days: 1,
      now: NOW,
      historyPoints: [
        { date: new Date(NOW - 2 * HOURS).toISOString(), amount: "55" },
      ],
    })

    expect(result.change).toBe(5)
    expect(result.cashflowChange).toBe(0)
    expect(result.changePercent).toBeCloseTo(9.0909, 3)
  })
})
