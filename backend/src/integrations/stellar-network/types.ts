export interface FeeStats {
  lastLedger: number;
  baseFeeStroops: number;
  capacityUsage: number;
  p50FeeStroops: number;
  p99FeeStroops: number;
}

export interface LedgerStats {
  sequence: number;
  successfulTxCount: number;
  failedTxCount: number;
  operationCount: number;
  closedAt: string;
  baseFeeInStroops: number;
  baseReserveInStroops: number;
  totalCoins: string;
}

export interface NetworkStats {
  ledger: LedgerStats;
  fees: FeeStats;
  tps: number;
  networkPassphrase: string;
  horizonUrl: string;
  fetchedAt: string;
}

export interface NetworkHealth {
  healthy: boolean;
  latencyMs: number;
  latestLedger: number;
  closedAt: string;
}
