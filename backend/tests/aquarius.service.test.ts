jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { AquariusService, AQUA_ISSUER } from '../src/integrations/aquarius/service';

const MOCK_REWARDS = {
  count: 3,
  results: [
    {
      market_key: { asset1_code: 'XLM', asset1_issuer: '', asset2_code: 'USDC', asset2_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
      daily_sdex_reward: 200000,
      daily_amm_reward: 500000,
      daily_total_reward: 700000,
      last_updated: '2026-06-20T09:00:00Z',
    },
    {
      market_key: { asset1_code: 'AQUA', asset1_issuer: AQUA_ISSUER, asset2_code: 'USDC', asset2_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
      daily_sdex_reward: 164100,
      daily_amm_reward: 410250,
      daily_total_reward: 574350,
      last_updated: '2026-06-20T09:00:00Z',
    },
    {
      market_key: { asset1_code: 'XLM', asset1_issuer: '', asset2_code: 'AQUA', asset2_issuer: AQUA_ISSUER },
      daily_sdex_reward: 162157,
      daily_amm_reward: 405394,
      daily_total_reward: 567551,
      last_updated: '2026-06-20T09:00:00Z',
    },
  ],
};

describe('AquariusService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    AquariusService.clearCache();
  });

  afterEach(() => {
    AquariusService.clearCache();
    jest.clearAllMocks();
  });

  describe('AQUA_ISSUER', () => {
    it('is the correct Aquarius issuer address', () => {
      expect(AQUA_ISSUER).toBe('GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA');
    });
  });

  describe('getPoolRewards', () => {
    it('returns sorted pool rewards with xlmUsdcDailyAqua', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_REWARDS,
      } as any);

      const result = await AquariusService.getPoolRewards(10);

      expect(result.topPools).toHaveLength(3);
      expect(result.topPools[0].pair).toBe('XLM/USDC');
      expect(result.topPools[0].dailyTotalReward).toBe(700000);
      expect(result.xlmUsdcDailyAqua).toBe(700000);
      expect(result.aquaIssuer).toBe(AQUA_ISSUER);
    });

    it('returns cached result on second call', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_REWARDS,
      } as any);

      await AquariusService.getPoolRewards();
      await AquariusService.getPoolRewards();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws when API fails and no cache is available', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
      } as any);

      await expect(AquariusService.getPoolRewards()).rejects.toThrow('Aquarius reward API returned 503');
    });

    it('each pool summary has required fields', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_REWARDS,
      } as any);

      const result = await AquariusService.getPoolRewards();

      for (const pool of result.topPools) {
        expect(pool).toHaveProperty('pair');
        expect(pool).toHaveProperty('asset1');
        expect(pool).toHaveProperty('asset2');
        expect(pool).toHaveProperty('dailySdexReward');
        expect(pool).toHaveProperty('dailyAmmReward');
        expect(pool).toHaveProperty('dailyTotalReward');
      }
    });
  });

  describe('getPairReward', () => {
    it('finds XLM/USDC reward', async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => MOCK_REWARDS,
      } as any);

      const reward = await AquariusService.getPairReward('XLM', 'USDC');

      expect(reward).not.toBeNull();
      expect(reward?.dailyTotalReward).toBe(700000);
    });

    it('finds pair regardless of asset order', async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => MOCK_REWARDS,
      } as any);

      const reward = await AquariusService.getPairReward('USDC', 'XLM');
      expect(reward).not.toBeNull();
    });

    it('returns null for unknown pair', async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => MOCK_REWARDS,
      } as any);

      const reward = await AquariusService.getPairReward('BTC', 'ETH');
      expect(reward).toBeNull();
    });
  });

  describe('estimateDailyAqua', () => {
    it('computes proportional AQUA earnings correctly', async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => MOCK_REWARDS,
      } as any);

      // User has $10K in a $1M pool (1% share) → 1% of 500K AMM rewards = 5000 AQUA/day
      const result = await AquariusService.estimateDailyAqua(1_000_000, 10_000, 'XLM', 'USDC');

      expect(result.dailyAqua).toBeCloseTo(5000, 0);
      expect(result.sharePercent).toBeCloseTo(1, 1);
      expect(result.pair).toBe('XLM/USDC');
    });

    it('returns zero for unknown pair', async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => MOCK_REWARDS,
      } as any);

      const result = await AquariusService.estimateDailyAqua(1_000_000, 10_000, 'BTC', 'ETH');
      expect(result.dailyAqua).toBe(0);
    });

    it('returns zero when pool TVL is 0', async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => MOCK_REWARDS,
      } as any);

      const result = await AquariusService.estimateDailyAqua(0, 10_000, 'XLM', 'USDC');
      expect(result.dailyAqua).toBe(0);
    });
  });
});
