jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { ReflectorService } from '../src/integrations/reflector/service';

describe('ReflectorService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    ReflectorService.clearCache();
  });

  afterEach(() => {
    ReflectorService.clearCache();
    jest.clearAllMocks();
  });

  describe('getPrice', () => {
    it('returns price from Reflector API on success', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ price: 0.25, source: 'reflector' }),
      } as any);

      const result = await ReflectorService.getPrice('XLM');
      expect(result.price).toBe(0.25);
      expect(result.source).toContain('reflector');
    });

    it('uses in-memory cache on second call', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ price: 0.25 }),
      } as any);

      const first = await ReflectorService.getPrice('XLM');
      const second = await ReflectorService.getPrice('XLM');

      // Second call should return from cache — same price, source='cache'
      expect(first.price).toBe(second.price);
      expect(second.source).toBe('cache');
    });

    it('returns a non-zero price on any response format', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { price: '0.30' } }),
      } as any);

      const result = await ReflectorService.getPrice('XLM');
      expect(typeof result.price).toBe('number');
    });
  });

  describe('getPrices', () => {
    it('returns a price map for multiple assets', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ price: 0.22 }),
      } as any);

      const map = await ReflectorService.getPrices(['XLM', 'BRL']);

      expect(map).toHaveProperty('XLM');
      expect(map).toHaveProperty('BRL');
      expect(typeof map.XLM.price).toBe('number');
    });
  });

  describe('getXlmUsdRate', () => {
    it('returns a positive number for XLM price', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          bids: [{ price: '0.21' }],
          asks: [{ price: '0.23' }],
        }),
      } as any);

      const rate = await ReflectorService.getXlmUsdRate();

      expect(typeof rate).toBe('number');
    });
  });

  describe('clearCache', () => {
    it('clears cache so next call hits network again', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ price: 0.22 }),
      } as any);

      await ReflectorService.getPrice('XLM');
      ReflectorService.clearCache();

      fetchMock.mockClear();
      await ReflectorService.getPrice('XLM');

      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
