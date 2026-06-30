export type PortfolioHistoryAction = "deposit" | "withdraw" | string;

export type PortfolioHistoryPoint = {
  date: string;
  amount?: string | number | null;
  delta?: string | number | null;
  action?: PortfolioHistoryAction | null;
  operation_id?: string | null;
};

export type PortfolioPeriodAnalysis = {
  change: number;
  changePercent: number;
  cashflowChange: number;
  rawChange: number;
  baseline: number;
  denominator: number;
  pointCount: number;
  lastPoint?: PortfolioHistoryPoint;
};

const EPSILON = 0.0000001;

function parseDecimal(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePositiveDecimal(value: unknown): number {
  return Math.max(0, parseDecimal(value));
}

function normalizeSmall(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : value;
}

function pointTime(point: PortfolioHistoryPoint): number {
  const time = Date.parse(String(point.date || ""));
  return Number.isFinite(time) ? time : Number.NaN;
}

function sortedHistoryPoints(points: PortfolioHistoryPoint[] = []): PortfolioHistoryPoint[] {
  return [...points]
    .filter((point) => Number.isFinite(pointTime(point)))
    .sort((a, b) => pointTime(a) - pointTime(b));
}

function cashflowDelta(point: PortfolioHistoryPoint): number {
  const action = String(point.action || "").trim().toLowerCase();
  if (action !== "deposit" && action !== "withdraw") return 0;

  const explicitDelta = parseDecimal(point.delta);
  if (Math.abs(explicitDelta) > EPSILON) {
    return action === "withdraw" ? -Math.abs(explicitDelta) : Math.abs(explicitDelta);
  }

  const amount = parsePositiveDecimal(point.amount);
  return action === "withdraw" ? -amount : amount;
}

export function analyzePortfolioPeriod(input: {
  currentAmount: number;
  historyPoints?: PortfolioHistoryPoint[];
  days: number;
  now?: number | Date;
}): PortfolioPeriodAnalysis {
  const currentAmount = Math.max(0, Number.isFinite(input.currentAmount) ? input.currentAmount : 0);
  // Allow sub-day windows (e.g. the 1-hour "Live" view = 1/24) — only fall back
  // to 1 day when the input is missing/invalid, not when it's a small fraction.
  const days = Number.isFinite(input.days) && input.days > 0 ? input.days : 1;
  const nowMs = input.now instanceof Date ? input.now.getTime() : Number(input.now || Date.now());
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  const history = sortedHistoryPoints(input.historyPoints || []);
  const inWindow = history.filter((point) => pointTime(point) >= cutoff && pointTime(point) <= nowMs);
  const lastPoint = history[history.length - 1];

  if (!inWindow.length) {
    return {
      change: 0,
      changePercent: 0,
      cashflowChange: 0,
      rawChange: 0,
      baseline: currentAmount,
      denominator: currentAmount,
      pointCount: 0,
      lastPoint,
    };
  }

  const firstWindowPoint = inWindow[0];
  const previousPoint = [...history].reverse().find((point) => pointTime(point) < cutoff);
  const firstWindowCashflow = cashflowDelta(firstWindowPoint);
  const baseline = previousPoint
    ? parsePositiveDecimal(previousPoint.amount)
    : Math.max(0, parsePositiveDecimal(firstWindowPoint.amount) - firstWindowCashflow);
  // Walk the balance series step by step and split each move into cashflow
  // (deposits/withdrawals — the user's own money in/out) vs return (yield).
  // Points without an explicit deposit/withdraw marker (e.g. the mainnet
  // position snapshots) are still handled: a step larger than ~10% of the
  // balance (and ≥ $0.25) is treated as a cashflow, since real yield moves in
  // tiny increments — so money the user puts in never shows up as "return".
  const series: Array<{ amount: number; point?: PortfolioHistoryPoint }> = [{ amount: baseline }];
  for (const point of inWindow) series.push({ amount: parsePositiveDecimal(point.amount), point });
  series.push({ amount: currentAmount });

  let change = 0;
  let cashflowChange = 0;
  for (let i = 1; i < series.length; i += 1) {
    const prevAmount = series[i - 1].amount;
    const curAmount = series[i].amount;
    const point = series[i].point;
    const delta = curAmount - prevAmount;
    let cashflow = point ? cashflowDelta(point) : 0;
    if (Math.abs(cashflow) <= EPSILON) {
      const base = Math.max(prevAmount, curAmount, 1);
      const threshold = Math.max(0.25, base * 0.1);
      if (Math.abs(delta) >= threshold) cashflow = delta;
    }
    if (Math.abs(cashflow) > EPSILON) {
      cashflowChange += cashflow;
      change += delta - cashflow;
    } else {
      change += delta;
    }
  }
  change = normalizeSmall(change);
  cashflowChange = normalizeSmall(cashflowChange);
  const rawChange = normalizeSmall(currentAmount - baseline);
  const denominator = Math.max(0, currentAmount - change);
  const changePercent = denominator > EPSILON ? (change / denominator) * 100 : 0;

  return {
    change,
    changePercent: normalizeSmall(changePercent),
    cashflowChange,
    rawChange,
    baseline,
    denominator,
    pointCount: inWindow.length,
    lastPoint,
  };
}
