export type AssetDistributionInput = {
  asset: string
  value: number
}

export type AssetDistributionItem = AssetDistributionInput & {
  percent: number
  exactPercent: number
  barPercent: number
}

function positiveNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function materialThreshold(asset: string) {
  const normalized = asset.toUpperCase()
  if (normalized === "BRL" || normalized === "TESOURO" || normalized === "USDC" || normalized === "USD") {
    return 0.005
  }
  return 0.00000005
}

export function calculateAssetDistribution(rows: AssetDistributionInput[]): AssetDistributionItem[] {
  const positiveRows = rows
    .map((row) => ({
      asset: String(row.asset || "").trim(),
      value: positiveNumber(row.value),
    }))
    .filter((row) => row.asset && row.value >= materialThreshold(row.asset))

  const total = positiveRows.reduce((sum, row) => sum + row.value, 0)
  if (total <= 0) return []

  const prepared = positiveRows.map((row, index) => {
    const exactPercent = (row.value / total) * 100
    return {
      ...row,
      index,
      exactPercent,
      percent: Math.floor(exactPercent),
    }
  })

  let currentTotal = prepared.reduce((sum, row) => sum + row.percent, 0)

  if (currentTotal > 100) {
    const byLargest = [...prepared].sort((a, b) => {
      if (b.percent !== a.percent) return b.percent - a.percent
      return b.exactPercent - a.exactPercent
    })
    let cursor = 0
    while (currentTotal > 100 && byLargest.some((row) => row.percent > 1)) {
      const row = byLargest[cursor % byLargest.length]
      if (row.percent > 1) {
        row.percent -= 1
        currentTotal -= 1
      }
      cursor += 1
    }
  }

  if (currentTotal < 100) {
    const byRemainder = [...prepared].sort((a, b) => {
      const remainderA = a.exactPercent - Math.floor(a.exactPercent)
      const remainderB = b.exactPercent - Math.floor(b.exactPercent)
      if (remainderB !== remainderA) return remainderB - remainderA
      return b.exactPercent - a.exactPercent
    })
    let cursor = 0
    while (currentTotal < 100 && byRemainder.length > 0) {
      byRemainder[cursor % byRemainder.length].percent += 1
      currentTotal += 1
      cursor += 1
    }
  }

  return prepared
    .sort((a, b) => a.index - b.index)
    .map(({ index: _index, ...row }) => ({
      ...row,
      barPercent: row.percent > 0 ? Math.max(2, row.percent) : 0,
    }))
}
