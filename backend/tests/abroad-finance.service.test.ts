jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { AbroadFinanceService } from '../src/integrations/abroad-finance/service';

const MOCK_CORRIDORS = {
  corridors: [
    {
      blockchain: 'STELLAR',
      chainFamily: 'stellar',
      chainId: 'stellar:pubnet',
      cryptoCurrency: 'USDC',
      maxAmount: 20000,
      minAmount: 1,
      notify: { endpoint: null, required: false },
      paymentMethod: 'PIX',
      targetCurrency: 'BRL',
    },
    {
      blockchain: 'SOLANA',
      chainFamily: 'solana',
      chainId: 'solana:mainnet',
      cryptoCurrency: 'USDC',
      maxAmount: null,
      minAmount: 0,
      notify: { endpoint: '/payments/notify', required: true },
      paymentMethod: 'PIX',
      targetCurrency: 'BRL',
    },
  ],
};

describe('AbroadFinanceService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    AbroadFinanceService.clearCache();
  });

  afterEach(() => {
    AbroadFinanceService.clearCache();
    jest.clearAllMocks();
  });

  describe('getCorridors', () => {
    it('returns all corridors from the API', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_CORRIDORS,
      } as any);

      const corridors = await AbroadFinanceService.getCorridors();

      expect(corridors).toHaveLength(2);
      expect(corridors[0].blockchain).toBe('STELLAR');
    });

    it('uses in-memory cache on second call', async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => MOCK_CORRIDORS,
      } as any);

      await AbroadFinanceService.getCorridors();
      await AbroadFinanceService.getCorridors();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns empty array and does not throw on API failure', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));

      const corridors = await AbroadFinanceService.getCorridors();
      expect(Array.isArray(corridors)).toBe(true);
    });
  });

  describe('getStellarCorridor', () => {
    it('returns the STELLAR USDC→PIX corridor', async () => {
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => MOCK_CORRIDORS,
      } as any);

      const corridor = await AbroadFinanceService.getStellarCorridor();

      expect(corridor).not.toBeNull();
      expect(corridor?.blockchain).toBe('STELLAR');
      expect(corridor?.cryptoCurrency).toBe('USDC');
      expect(corridor?.paymentMethod).toBe('PIX');
      expect(corridor?.minAmount).toBe(1);
      expect(corridor?.maxAmount).toBe(20000);
    });

    it('returns null when no Stellar corridor found', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ corridors: [MOCK_CORRIDORS.corridors[1]] }), // Only Solana
      } as any);

      const corridor = await AbroadFinanceService.getStellarCorridor();
      expect(corridor).toBeNull();
    });
  });

  describe('decodePixQr', () => {
    it('decodes a PIX QR payload and returns structured data', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          pixKey: '12345678000195',
          recipientName: 'João Silva',
          amount: 50.00,
          city: 'São Paulo',
          description: 'Pagamento de serviços',
        }),
      } as any);

      const result = await AbroadFinanceService.decodePixQr('00020126...FAKEPIXQR');

      expect(result.pixKey).toBe('12345678000195');
      expect(result.recipientName).toBe('João Silva');
      expect(result.amount).toBe(50.00);
      expect(result.city).toBe('São Paulo');
    });

    it('throws on invalid QR code', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid PIX QR code',
      } as any);

      await expect(AbroadFinanceService.decodePixQr('bad payload'))
        .rejects.toThrow();
    });

    it('includes rawData in result', async () => {
      const raw = { pixKey: 'cpf@example.com', amount: 100 };
      fetchMock.mockResolvedValue({
        ok: true, status: 200, json: async () => raw,
      } as any);

      const result = await AbroadFinanceService.decodePixQr('00020126...');
      expect(result.rawData).toEqual(raw);
    });
  });

  describe('getQuote', () => {
    it('returns null when ABROAD_PARTNER_API_KEY is not set', async () => {
      // Default env has no API key
      const result = await AbroadFinanceService.getQuote(100);
      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
