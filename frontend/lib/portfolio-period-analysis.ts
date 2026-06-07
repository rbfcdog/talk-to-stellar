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
  const days = Math.max(1, Number.isFinite(input.days) ? input.days : 1);
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
  const cashflowChange = inWindow.reduce((sum, point) => sum + cashflowDelta(point), 0);
  const rawChange = currentAmount - baseline;
  const change = normalizeSmall(rawChange - cashflowChange);
  const denominator = Math.max(0, currentAmount - change);
  const changePercent = denominator > EPSILON ? (change / denominator) * 100 : 0;

  return {
    change,
    changePercent: normalizeSmall(changePercent),
    cashflowChange: normalizeSmall(cashflowChange),
    rawChange: normalizeSmall(rawChange),
    baseline,
    denominator,
    pointCount: inWindow.length,
    lastPoint,
  };
}
