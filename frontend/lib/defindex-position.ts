const CONTRACT_DECIMALS = 7
const CONTRACT_SCALE = 10n ** BigInt(CONTRACT_DECIMALS)

const DECIMAL_KEYS = [
  "amount_decimal",
  "amountDecimal",
  "balance_decimal",
  "balanceDecimal",
  "display_amount",
  "displayAmount",
  "formatted_amount",
  "formattedAmount",
  "ui_amount",
  "uiAmount",
  "underlying_amount_decimal",
  "underlyingAmountDecimal",
]

const UNDERLYING_UNIT_KEYS = [
  "underlyingBalance",
  "underlying_balance",
  "underlyingBalances",
  "underlying_balances",
]

const RAW_UNIT_KEYS = [
  "total_amount",
  "totalAmount",
  "underlying_amount",
  "underlyingAmount",
  "invested_amount",
  "investedAmount",
  "idle_amount",
  "idleAmount",
  "managed_funds",
  "managedFunds",
  "total_managed_funds",
  "totalManagedFunds",
  "amount",
  "balance",
  "vault_balance",
  "vaultBalance",
]

const SHARE_UNIT_KEYS = [
  "dfTokens",
  "df_tokens",
  "df_token_balance",
  "dfTokenBalance",
  "shares",
  "shares_amount",
  "sharesAmount",
  "vault_shares",
  "vaultShares",
]

function normalizeNumberText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".")
}

function decimalStringFromNumber(value: unknown) {
  const raw = normalizeNumberText(value)
  if (!/^\d+(\.\d+)?$/.test(raw)) return ""
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return ""
  return String(parsed)
}

function decimalStringFromUnits(value: unknown) {
  const raw = normalizeNumberText(value)
  if (!/^\d+$/.test(raw)) return decimalStringFromNumber(value)

  const units = BigInt(raw)
  if (units <= 0n) return ""
  const whole = units / CONTRACT_SCALE
  const fraction = (units % CONTRACT_SCALE).toString().padStart(CONTRACT_DECIMALS, "0").replace(/0+$/, "")
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString()
}

function firstPositive(values: unknown[], rawUnits: boolean) {
  for (const value of values) {
    const amount = rawUnits ? decimalStringFromUnits(value) : decimalStringFromNumber(value)
    if (Number(amount) > 0) return amount
  }
  return ""
}

function sumUnitArray(values: unknown[]) {
  let total = 0n
  for (const value of values) {
    const raw = normalizeNumberText(value)
    if (/^\d+$/.test(raw)) total += BigInt(raw)
  }
  return total > 0n ? decimalStringFromUnits(total.toString()) : ""
}

export function extractDefindexPositionAmount(value: unknown): string {
  if (value === null || value === undefined) return "0"

  if (typeof value === "number" || typeof value === "string") {
    return decimalStringFromUnits(value) || "0"
  }

  if (Array.isArray(value)) {
    return sumUnitArray(value) || "0"
  }

  if (typeof value !== "object") return "0"

  const record = value as Record<string, unknown>

  for (const key of DECIMAL_KEYS) {
    const amount = decimalStringFromNumber(record[key])
    if (Number(amount) > 0) return amount
  }

  for (const key of UNDERLYING_UNIT_KEYS) {
    const item = record[key]
    const amount = Array.isArray(item)
      ? sumUnitArray(item)
      : decimalStringFromUnits(item)
    if (Number(amount) > 0) return amount
  }

  for (const key of RAW_UNIT_KEYS) {
    const item = record[key]
    if (item === undefined || item === null) continue
    const amount = typeof item === "object"
      ? extractDefindexPositionAmount(item)
      : decimalStringFromUnits(item)
    if (Number(amount) > 0) return amount
  }

  for (const key of SHARE_UNIT_KEYS) {
    const amount = decimalStringFromUnits(record[key])
    if (Number(amount) > 0) return amount
  }

  for (const item of Object.values(record)) {
    if (typeof item !== "object" || item === null) continue
    const amount = extractDefindexPositionAmount(item)
    if (Number(amount) > 0) return amount
  }

  return firstPositive(Object.values(record), true) || "0"
}
