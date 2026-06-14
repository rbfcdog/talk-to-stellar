type ParsedDecimal = {
  sign: bigint;
  units: bigint;
  scale: number;
};

function parseDecimal(value: string | null | undefined): ParsedDecimal | null {
  const raw = String(value || '').trim().replace(',', '.');
  if (!raw) return null;
  const match = raw.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const whole = match[2] || '0';
  const fraction = match[3] || '';
  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '') || '0';
  return {
    sign: match[1] ? -1n : 1n,
    units: BigInt(digits),
    scale: fraction.length,
  };
}

function pow10(scale: number): bigint {
  if (scale <= 0) return 1n;
  return 10n ** BigInt(scale);
}

function formatScaled(units: bigint, scale: number): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const divisor = pow10(scale);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(scale, '0');
  const body = scale > 0 ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${body}` : body;
}

export function divideDecimalStrings(
  dividendValue: string | null | undefined,
  divisorValue: string | null | undefined,
  outputScale = 2,
): string | null {
  const dividend = parseDecimal(dividendValue);
  const divisor = parseDecimal(divisorValue);
  if (!dividend || !divisor || divisor.units === 0n) return null;

  const numerator = dividend.sign * dividend.units * pow10(divisor.scale + outputScale);
  const denominator = divisor.sign * divisor.units * pow10(dividend.scale);
  if (denominator === 0n) return null;

  const sameSign = (numerator >= 0n && denominator >= 0n) || (numerator < 0n && denominator < 0n);
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const rounded = (absNumerator + absDenominator / 2n) / absDenominator;
  const signed = sameSign ? rounded : -rounded;
  return formatScaled(signed, outputScale);
}

export function addDecimalStrings(values: Array<string | null | undefined>, outputScale = 2): string {
  let total = 0n;
  for (const value of values) {
    const parsed = parseDecimal(value);
    if (!parsed) continue;
    const scaled = parsed.sign * parsed.units * pow10(Math.max(0, outputScale - parsed.scale));
    const reduced = parsed.scale > outputScale
      ? scaled / pow10(parsed.scale - outputScale)
      : scaled;
    total += reduced;
  }
  return formatScaled(total, outputScale);
}

export function decimalAbsDiffWithin(
  leftValue: string | null | undefined,
  rightValue: string | null | undefined,
  toleranceValue: string,
  scale = 7,
): boolean {
  const left = parseDecimal(leftValue);
  const right = parseDecimal(rightValue);
  const tolerance = parseDecimal(toleranceValue);
  if (!left || !right || !tolerance) return false;

  const leftScaled = left.sign * left.units * pow10(Math.max(0, scale - left.scale)) / pow10(Math.max(0, left.scale - scale));
  const rightScaled = right.sign * right.units * pow10(Math.max(0, scale - right.scale)) / pow10(Math.max(0, right.scale - scale));
  const toleranceScaled = tolerance.sign * tolerance.units * pow10(Math.max(0, scale - tolerance.scale)) / pow10(Math.max(0, tolerance.scale - scale));
  const diff = leftScaled >= rightScaled ? leftScaled - rightScaled : rightScaled - leftScaled;
  return diff <= (toleranceScaled < 0n ? -toleranceScaled : toleranceScaled);
}
