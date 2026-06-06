export function truncateCustomerAmount(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(value)) * factor;
  const truncated = Math.trunc((value + Math.sign(value || 1) * epsilon) * factor) / factor;
  return Object.is(truncated, -0) ? 0 : truncated;
}

export function formatCustomerNumber(value: number, locale = "en-US", decimals = 2) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(truncateCustomerAmount(value, decimals));
}
