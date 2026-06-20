jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

// Mock all upstream services before import
jest.mock('../src/integrations/reflector/service', () => ({
  ReflectorService: {
    getPrice: jest.fn().mockImplementation(async (asset: string) => {
      if (asset === 'XLM') return { price: 0.22, source: 'reflector', asset: 'XLM', priceStr: '0.22', timestamp: Date.now(), age_seconds: 0 };
      if (asset === 'BRL') return { price: 0.18, source: 'reflector', asset: 'BRL', priceStr: '0.18', timestamp: Date.now(), age_seconds: 0 };
      return { price: 1, source: 'reflector', asset, priceStr: '1', timestamp: Date.now(), age_seconds: 0 };
    }),
  },
}));

jest.mock('../src/integrations/aquarius/service', () => ({
  AquariusService: {
    getPoolRewards: jest.fn().mockResolvedValue({
      topPools: [
        { pair: 'XLM/USDC', asset1: 'XLM', asset2: 'USDC', dailySdexReward: 200000, dailyAmmReward: 500000, dailyTotalReward: 700000, updatedAt: '2026-06-20T09:00:00Z' },
      ],
      xlmUsdcDailyAqua: 700000,
      aquaIssuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
      fetchedAt: '2026-06-20T09:00:00Z',
    }),
    clearCache: jest.fn(),
  },
}));

jest.mock('../src/integrations/stellar-network/service', () => ({
  StellarNetworkService: {
    getStats: jest.fn().mockResolvedValue({
      ledger: { sequence: 63000000, successfulTxCount: 80, failedTxCount: 20, operationCount: 400, closedAt: '2026-06-20T22:00:00Z', baseFeeInStroops: 100, baseReserveInStroops: 5000000, totalCoins: '105443902087' },
      fees: { lastLedger: 63000000, baseFeeStroops: 100, capacityUsage: 0.07, p50FeeStroops: 100, p99FeeStroops: 500 },
      tps: 80,
      networkPassphrase: 'Test SDF Network ; September 2015',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      fetchedAt: '2026-06-20T22:00:00Z',
    }),
  },
}));

jest.mock('../src/integrations/fraud-screening/service', () => ({
  FraudScreeningService: {
    screenAddress: jest.fn().mockResolvedValue({
      address: 'GTEST',
      tags: [],
      blocked: false,
      isMalicious: false,
      isExchange: false,
      isAnchor: false,
    }),
    clearCache: jest.fn(),
  },
}));

jest.mock('../src/integrations/cctp/service', () => ({
  CctpService: {
    getSupportedChains: jest.fn().mockReturnValue([
      { chain: 'ethereum', domainId: 0, contractAddress: '0xabc', explorerUrl: 'https://etherscan.io', instructions: 'test' },
      { chain: 'base', domainId: 6, contractAddress: '0xdef', explorerUrl: 'https://basescan.org', instructions: 'test' },
    ]),
  },
}));

import { EcosystemService } from '../src/integrations/ecosystem/service';

const MOCK_HORIZON_ACCOUNT = {
  balances: [
    { asset_type: 'native', balance: '1500.0000000' },
    { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', balance: '250.0000000' },
  ],
};

describe('EcosystemService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => MOCK_HORIZON_ACCOUNT,
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOverview', () => {
    const testAddress = 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678';

    it('returns a complete ecosystem overview', async () => {
      const overview = await EcosystemService.getOverview(testAddress);

      expect(overview.address).toBe(testAddress);
      expect(overview.usdcBalance).toBe('250.0000000');
      expect(overview.xlmBalance).toBe('1500.0000000');
      expect(overview.portfolioUsd).toBeGreaterThan(0);
      expect(overview.rates.xlm_usd).toBe(0.22);
      expect(overview.rates.usdc_usd).toBe(1);
    });

    it('includes network stats from StellarNetworkService', async () => {
      const overview = await EcosystemService.getOverview(testAddress);

      expect(overview.network_stats.latestLedger).toBe(63000000);
      expect(overview.network_stats.tps).toBe(80);
      expect(overview.network_stats.healthy).toBe(true);
    });

    it('includes Aquarius DeFi data', async () => {
      const overview = await EcosystemService.getOverview(testAddress);

      expect(overview.defi.aquarius_xlm_usdc_daily_aqua).toBe(700000);
      expect(overview.defi.top_yield_pools).toHaveLength(1);
      expect(overview.defi.top_yield_pools[0].pair).toBe('XLM/USDC');
    });

    it('includes CCTP chain info', async () => {
      const overview = await EcosystemService.getOverview(testAddress);

      expect(overview.cctp.supported_source_chains).toContain('ethereum');
      expect(overview.cctp.stellar_domain_id).toBe(4);
    });

    it('includes fraud screening result', async () => {
      const overview = await EcosystemService.getOverview(testAddress);

      expect(overview.fraud_screen).toBeDefined();
      expect(overview.fraud_screen?.blocked).toBe(false);
    });

    it('calculates portfolioBrl using brl_usd rate', async () => {
      const overview = await EcosystemService.getOverview(testAddress);

      // portfolioUsd / brl_usd = BRL amount
      expect(overview.portfolioBrl).toBeGreaterThan(0);
    });

    it('returns partial data when Horizon account fetch fails', async () => {
      fetchMock.mockRejectedValue(new Error('account not found'));

      const overview = await EcosystemService.getOverview(testAddress);

      // Should not throw — returns zeros for balances
      expect(overview.usdcBalance).toBe('0');
      expect(overview.xlmBalance).toBe('0');
      expect(overview.portfolioUsd).toBe(0);
    });
  });

  describe('getSummaryText', () => {
    const testAddress = 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345678';

    it('returns Portuguese summary with key balance info', async () => {
      const text = await EcosystemService.getSummaryText(testAddress);

      expect(text).toContain('USDC');
      expect(text).toContain('XLM');
      expect(text).toContain('AQUA');
      expect(text).toContain('Stellar');
    });

    it('includes network stats in summary', async () => {
      const text = await EcosystemService.getSummaryText(testAddress);

      expect(text).toContain('63,000,000');
    });

    it('returns fallback text when everything fails', async () => {
      fetchMock.mockRejectedValue(new Error('total failure'));
      jest.spyOn(EcosystemService, 'getOverview').mockRejectedValueOnce(new Error('fail'));

      const text = await EcosystemService.getSummaryText(testAddress);

      expect(text).toContain('Não foi possível');
    });
  });
});
