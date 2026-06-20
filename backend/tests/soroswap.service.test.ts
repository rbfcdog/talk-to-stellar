process.env.STELLAR_NETWORK = 'mainnet';

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { SoroswapService } from '../src/integrations/soroswap/service';

const USDC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNZT7WSEE9MCZGE6H4SXNVGXNWMSE';
const XLM  = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';

describe('SoroswapService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    SoroswapService.clearTokenCache();
  });

  afterEach(() => {
    SoroswapService.clearTokenCache();
    jest.clearAllMocks();
  });

  describe('resolveTokenAddress', () => {
    it('returns raw address unchanged if 56-char C-string (XLM SAC is 56 chars)', () => {
      // XLM SAC address is 56 chars — passes the raw-address check
      expect(SoroswapService.resolveTokenAddress(XLM, 'mainnet')).toBe(XLM);
    });

    it('resolves USDC symbol to contract address', () => {
      expect(SoroswapService.resolveTokenAddress('USDC', 'mainnet')).toBe(USDC);
    });

    it('resolves XLM symbol to contract address', () => {
      expect(SoroswapService.resolveTokenAddress('XLM', 'mainnet')).toBe(XLM);
    });

    it('throws for unknown symbol', () => {
      expect(() => SoroswapService.resolveTokenAddress('FAKETOKEN', 'mainnet'))
        .toThrow('Unknown token symbol');
    });
  });

  describe('humanToStroops / stroopsToHuman', () => {
    it('converts 1.5 to 15000000 stroops', () => {
      expect(SoroswapService.humanToStroops('1.5')).toBe('15000000');
    });

    it('converts 15000000 stroops back to 1.5', () => {
      expect(SoroswapService.stroopsToHuman('15000000')).toBe('1.5');
    });

    it('throws on invalid amount string', () => {
      expect(() => SoroswapService.humanToStroops('not-a-number')).toThrow('Invalid amount');
    });
  });

  describe('getQuote', () => {
    it('parses successful quote response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          amountOut: '20000000',
          priceImpact: '0.01',
          protocols: ['soroswap', 'phoenix'],
          path: [USDC, XLM],
        }),
      } as any);

      const result = await SoroswapService.getQuote({
        assetIn: 'USDC',
        assetOut: 'XLM',
        amount: '1',
      });

      expect(result.amountIn).toBe('1');
      expect(result.amountOut).toBe('2');
      expect(result.amountOutStroops).toBe('20000000');
      expect(result.protocols).toEqual(['soroswap', 'phoenix']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws on non-ok API response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      } as any);

      await expect(SoroswapService.getQuote({ assetIn: 'USDC', assetOut: 'XLM', amount: '1' }))
        .rejects.toThrow('Soroswap /quote returned 400');
    });

    it('throws on network error', async () => {
      fetchMock.mockRejectedValue(new Error('Network unreachable'));

      await expect(SoroswapService.getQuote({ assetIn: 'USDC', assetOut: 'XLM', amount: '1' }))
        .rejects.toThrow('Network unreachable');
    });
  });

  describe('buildSwapXdr', () => {
    it('returns xdr from successful build response', async () => {
      const mockQuote = {
        assetIn: USDC,
        assetOut: XLM,
        amountIn: '1',
        amountOut: '2',
        amountInStroops: '10000000',
        amountOutStroops: '20000000',
        priceImpact: 0,
        protocols: ['soroswap'],
        route: null,
        rawQuote: { amountOut: '20000000' },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ xdr: 'AAAA...FAKE_XDR...ZZZZ' }),
      } as any);

      const result = await SoroswapService.buildSwapXdr({
        quote: mockQuote,
        senderAddress: 'GABC1234',
      });

      expect(result.xdr).toBe('AAAA...FAKE_XDR...ZZZZ');
      expect(result.quote).toBe(mockQuote);
    });

    it('throws if xdr field missing from response', async () => {
      const mockQuote = {
        assetIn: USDC, assetOut: XLM, amountIn: '1', amountOut: '2',
        amountInStroops: '10000000', amountOutStroops: '20000000',
        priceImpact: 0, protocols: [], route: null, rawQuote: {},
      };

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ transaction: undefined }),
      } as any);

      await expect(SoroswapService.buildSwapXdr({ quote: mockQuote, senderAddress: 'GABC' }))
        .rejects.toThrow('missing xdr field');
    });
  });

  describe('getTokenList', () => {
    it('returns parsed token array from bare-array response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ([
          { address: USDC, symbol: 'USDC', name: 'USD Coin', decimals: 7 },
          { address: XLM,  symbol: 'XLM',  name: 'Stellar Lumens', decimals: 7 },
        ]),
      } as any);

      const tokens = await SoroswapService.getTokenList();
      expect(tokens).toHaveLength(2);
      expect(tokens[0].symbol).toBe('USDC');
    });

    it('returns parsed token array from wrapped {tokens:[]} response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tokens: [{ address: USDC, symbol: 'USDC', name: 'USD Coin', decimals: 7 }] }),
      } as any);

      const tokens = await SoroswapService.getTokenList();
      expect(tokens).toHaveLength(1);
    });
  });
});
