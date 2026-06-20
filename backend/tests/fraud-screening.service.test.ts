process.env.STELLAR_NETWORK = 'TESTNET';

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import { FraudScreeningService } from '../src/integrations/fraud-screening/service';

describe('FraudScreeningService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    FraudScreeningService.clearCache();
  });

  afterEach(() => {
    FraudScreeningService.clearCache();
    jest.clearAllMocks();
  });

  describe('screenAddress', () => {
    it('known clean address returns empty tags and blocked=false', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tags: [] }),
      } as any);

      const result = await FraudScreeningService.screenAddress('GCLEANADDRESS');

      expect(result.blocked).toBe(false);
      expect(result.isMalicious).toBe(false);
      expect(result.isExchange).toBe(false);
      expect(result.isAnchor).toBe(false);
      expect(result.tags).toEqual([]);
    });

    it('malicious tag sets blocked=true and Portuguese warning', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tags: ['malicious'] }),
      } as any);

      const result = await FraudScreeningService.screenAddress('GBADADDRESS');

      expect(result.blocked).toBe(true);
      expect(result.isMalicious).toBe(true);
      expect(result.warning).toContain('malicioso');
    });

    it('exchange tag sets isExchange=true with warning', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tags: ['exchange'] }),
      } as any);

      const result = await FraudScreeningService.screenAddress('GEXCHANGEADDR');

      expect(result.isExchange).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.warning).toContain('exchange');
    });

    it('anchor tag sets isAnchor=true without blocking', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tags: ['anchor'] }),
      } as any);

      const result = await FraudScreeningService.screenAddress('GANCHORADDR');

      expect(result.isAnchor).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('404 from StellarExpert returns clean result (unknown address)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
      } as any);

      const result = await FraudScreeningService.screenAddress('GUNKNOWNADDR');

      expect(result.blocked).toBe(false);
      expect(result.tags).toEqual([]);
    });

    it('fetch throws, fails open (no block)', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));

      const result = await FraudScreeningService.screenAddress('GANYADDRESS');

      expect(result.blocked).toBe(false);
    });

    it('uses in-memory cache on second call', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tags: [] }),
      } as any);

      await FraudScreeningService.screenAddress('GCACHEDADDR');
      await FraudScreeningService.screenAddress('GCACHEDADDR');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('screenDomain', () => {
    it('blocked domain returns blocked=true', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      const result = await FraudScreeningService.screenDomain('evil.com');

      expect(result.blocked).toBe(true);
      expect(result.domain).toBe('evil.com');
    });

    it('unknown domain returns blocked=false', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
      } as any);

      const result = await FraudScreeningService.screenDomain('unknown.com');

      expect(result.blocked).toBe(false);
      expect(result.domain).toBe('unknown.com');
    });
  });

  describe('buildResult', () => {
    it('combines all fields correctly', () => {
      const result = FraudScreeningService.buildResult('GADDR', ['malicious', 'exchange']);

      expect(result.blocked).toBe(true);
      expect(result.isMalicious).toBe(true);
      expect(result.isExchange).toBe(true);
      expect(result.isAnchor).toBe(false);
      expect(result.tags).toEqual(['malicious', 'exchange']);
      expect(result.note).toContain('malicious');
      expect(result.note).toContain('exchange');
      expect(result.address).toBe('GADDR');
    });
  });
});
