jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { StellarNetworkService } from '../src/integrations/stellar-network/service';

const MOCK_FEE_STATS = {
  last_ledger: '63000000',
  last_ledger_base_fee: '100',
  ledger_capacity_usage: '0.07',
  fee_charged: {
    max: '10000', min: '100', mode: '100',
    p10: '100', p20: '100', p30: '100', p40: '100',
    p50: '100', p60: '100', p70: '100', p80: '100',
    p90: '100', p95: '200', p99: '500',
  },
};

const MOCK_LEDGER_RESPONSE = {
  _embedded: {
    records: [{
      sequence: 63000000,
      successful_transaction_count: 80,
      failed_transaction_count: 20,
      operation_count: 400,
      tx_set_operation_count: 500,
      closed_at: '2026-06-20T22:00:00Z',
      total_coins: '105443902087.3472865',
      fee_pool: '9994095.8147721',
      base_fee_in_stroops: 100,
      base_reserve_in_stroops: 5000000,
    }],
  },
};

describe('StellarNetworkService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    StellarNetworkService.clearCache();
  });

  afterEach(() => {
    StellarNetworkService.clearCache();
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    it('returns ledger and fee stats from Horizon', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => MOCK_FEE_STATS,
        } as any)
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => MOCK_LEDGER_RESPONSE,
        } as any);

      const stats = await StellarNetworkService.getStats();

      expect(stats.ledger.sequence).toBe(63000000);
      expect(stats.ledger.operationCount).toBe(400);
      expect(stats.fees.capacityUsage).toBeCloseTo(0.07, 2);
      expect(stats.fees.p99FeeStroops).toBe(500);
      expect(stats.tps).toBeGreaterThan(0);
    });

    it('returns cached result on second call', async () => {
      fetchMock
        .mockResolvedValue({ ok: true, status: 200, json: async () => MOCK_FEE_STATS } as any)
        .mockResolvedValue({ ok: true, status: 200, json: async () => MOCK_LEDGER_RESPONSE } as any);

      await StellarNetworkService.getStats();
      await StellarNetworkService.getStats();

      // Only 2 fetch calls total (fee_stats + ledgers), not 4
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('throws when Horizon is unreachable and no cache', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(StellarNetworkService.getStats()).rejects.toThrow();
    });
  });

  describe('getHealth', () => {
    it('returns healthy=true when Horizon responds', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_LEDGER_RESPONSE,
      } as any);

      const health = await StellarNetworkService.getHealth();

      expect(health.healthy).toBe(true);
      expect(health.latestLedger).toBe(63000000);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns healthy=false when fetch fails', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));

      const health = await StellarNetworkService.getHealth();

      expect(health.healthy).toBe(false);
    });
  });

  describe('getRecommendedFeeMicroXlm', () => {
    it('returns base fee when capacity is low', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ ...MOCK_FEE_STATS, ledger_capacity_usage: '0.03' }),
        } as any)
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => MOCK_LEDGER_RESPONSE,
        } as any);

      const result = await StellarNetworkService.getRecommendedFeeMicroXlm();

      expect(result.feeStroops).toBe(100);
      expect(result.reason).toContain('base fee');
    });

    it('returns p99 fee when capacity is high (≥90%)', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({ ...MOCK_FEE_STATS, ledger_capacity_usage: '0.95' }),
        } as any)
        .mockResolvedValueOnce({
          ok: true, status: 200, json: async () => MOCK_LEDGER_RESPONSE,
        } as any);

      const result = await StellarNetworkService.getRecommendedFeeMicroXlm();

      expect(result.feeStroops).toBe(500);
      expect(result.reason).toContain('p99');
    });

    it('falls back to 100 stroops when stats fail', async () => {
      fetchMock.mockRejectedValue(new Error('network error'));

      const result = await StellarNetworkService.getRecommendedFeeMicroXlm();

      expect(result.feeStroops).toBe(100);
      expect(result.reason).toContain('minimum');
    });
  });
});
