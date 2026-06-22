process.env.STELLAR_NETWORK = 'mainnet';

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

const mockBrokerGetQuote = jest.fn();

jest.mock('../src/integrations/stellar-broker/service', () => ({
  StellarBrokerService: {
    getQuote: mockBrokerGetQuote,
  },
}));

import { SoroswapService } from '../src/integrations/soroswap/service';

const USDC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const XLM  = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';
const TESTNET_USDC = 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F';
const TESTNET_XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

describe('SoroswapService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.STELLAR_NETWORK = 'mainnet';
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.SOROSWAP_API_URL;
    fetchMock = jest.spyOn(global, 'fetch');
    mockBrokerGetQuote.mockResolvedValue({
      from: 'USDC',
      to: 'XLM',
      sellAmount: '1',
      buyAmount: '4.65',
      directTrade: { path: [] },
      slippageTolerance: 0.02,
      direction: 'strict_send',
    });
    SoroswapService.clearTokenCache();
  });

  afterEach(() => {
    SoroswapService.clearTokenCache();
    delete process.env.SOROSWAP_API_KEY;
    delete process.env.SOROSWAP_API_URL;
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
      process.env.SOROSWAP_API_KEY = 'sk_test_abc';
      process.env.SOROSWAP_API_URL = 'https://api.soroswap.finance/api/v1/';
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
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.soroswap.finance/quote?network=mainnet');
      const init = fetchMock.mock.calls[0][1] as any;
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk_test_abc',
      });
      expect(JSON.parse(init.body)).toMatchObject({
        assetIn: USDC,
        assetOut: XLM,
        amount: '10000000',
        tradeType: 'EXACT_IN',
        protocols: ['soroswap', 'phoenix', 'aqua', 'sdex'],
        slippageBps: 50,
      });
    });

    it('resolves testnet symbols from the Soroswap token list before quoting', async () => {
      process.env.STELLAR_NETWORK = 'testnet';
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ([
            {
              network: 'testnet',
              assets: [
                { contract: TESTNET_USDC, code: 'USDC', name: 'USD Coin', decimals: 7 },
                { contract: TESTNET_XLM, code: 'XLM', name: 'Stellar Lumens', decimals: 7 },
              ],
            },
          ]),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            amountOut: '20000000',
            protocols: ['soroswap'],
            path: [TESTNET_USDC, TESTNET_XLM],
          }),
        } as any);

      const result = await SoroswapService.getQuote({
        assetIn: 'USDC',
        assetOut: 'XLM',
        amount: '1',
      });

      expect(result.network).toBe('TESTNET');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.soroswap.finance/quote?network=testnet');
      const init = fetchMock.mock.calls[1][1] as any;
      expect(JSON.parse(init.body)).toMatchObject({
        assetIn: TESTNET_USDC,
        assetOut: TESTNET_XLM,
      });
    });

    it('returns a Stellar Broker fallback quote on non-ok Soroswap API response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Failed to get Soroswap contract address',
      } as any);

      const result = await SoroswapService.getQuote({ assetIn: 'USDC', assetOut: 'XLM', amount: '1' });

      expect(result).toMatchObject({
        assetIn: 'USDC',
        assetOut: 'XLM',
        amountIn: '1',
        amountOut: '4.65',
        protocols: ['stellar-broker'],
        source: 'stellar-broker-fallback',
        buildAvailable: false,
      });
      expect(result.rawQuote).toMatchObject({
        provider: 'stellar-broker',
        fallback: true,
      });
      expect(mockBrokerGetQuote).toHaveBeenCalledWith('USDC', 'XLM', '1', 'send');
    });

    it('returns a Stellar Broker fallback quote on Soroswap network error', async () => {
      fetchMock.mockRejectedValue(new Error('Network unreachable'));

      const result = await SoroswapService.getQuote({ assetIn: 'USDC', assetOut: 'XLM', amount: '1' });

      expect(result.source).toBe('stellar-broker-fallback');
      expect(result.rawQuote.soroswapError).toBe('Network unreachable');
    });

    it('returns a non-buildable unavailable quote for raw contract pairs when Soroswap has no route', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'No path found',
      } as any);

      const result = await SoroswapService.getQuote({
        assetIn: USDC,
        assetOut: XLM,
        amount: '1',
      });

      expect(result).toMatchObject({
        assetIn: USDC,
        assetOut: XLM,
        amountIn: '1',
        amountOut: '0',
        protocols: [],
        source: 'soroswap-unavailable',
        buildAvailable: false,
      });
      expect(result.rawQuote).toMatchObject({
        provider: 'soroswap',
        unavailable: true,
        soroswapError: 'Soroswap /quote returned 400: No path found',
      });
      expect(mockBrokerGetQuote).not.toHaveBeenCalled();
    });

    it('uses receive direction for exact-out fallback quotes', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      } as any);
      mockBrokerGetQuote.mockResolvedValue({
        sellAmount: '2.1',
        buyAmount: '10',
        directTrade: { path: ['AQUA'] },
      });

      const result = await SoroswapService.getQuote({
        assetIn: 'XLM',
        assetOut: 'USDC',
        amount: '10',
        tradeType: 'EXACT_OUT',
      });

      expect(result.amountIn).toBe('2.1');
      expect(result.amountOut).toBe('10');
      expect(result.route).toEqual(['AQUA']);
      expect(mockBrokerGetQuote).toHaveBeenCalledWith('XLM', 'USDC', '10', 'receive');
    });
  });

  describe('buildSwapXdr', () => {
    it('returns xdr from successful build response', async () => {
      process.env.SOROSWAP_API_KEY = 'sk_test_build';
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
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.soroswap.finance/quote/build?network=mainnet');
      const init = fetchMock.mock.calls[0][1] as any;
      expect(init.headers).toMatchObject({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk_test_build',
      });
      expect(JSON.parse(init.body)).toMatchObject({
        quote: mockQuote.rawQuote,
        from: 'GABC1234',
        slippageBps: 50,
      });
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

    it('rejects XDR build for fallback quotes', async () => {
      const fallbackQuote = {
        assetIn: 'USDC',
        assetOut: 'XLM',
        amountIn: '1',
        amountOut: '4.65',
        amountInStroops: '10000000',
        amountOutStroops: '46500000',
        priceImpact: 0,
        protocols: ['stellar-broker'],
        route: [],
        rawQuote: { provider: 'stellar-broker', fallback: true },
        source: 'stellar-broker-fallback',
        buildAvailable: false,
      };

      await expect(SoroswapService.buildSwapXdr({ quote: fallbackQuote, senderAddress: 'GABC' }))
        .rejects.toThrow('Soroswap XDR build unavailable for fallback quotes');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('getTokenList', () => {
    it('returns parsed token array from live network-grouped response and sends bearer auth', async () => {
      process.env.SOROSWAP_API_KEY = 'sk_test_tokens';
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ([
          { network: 'testnet', assets: [] },
          {
            network: 'mainnet',
            assets: [
              { contract: USDC, code: 'USDC', name: 'USD Coin', decimals: 7 },
              { contract: XLM, code: 'XLM', name: 'Stellar Lumens', decimals: 7 },
            ],
          },
        ]),
      } as any);

      const tokens = await SoroswapService.getTokenList();

      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toMatchObject({ address: USDC, symbol: 'USDC', network: 'mainnet' });
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.soroswap.finance/api/tokens');
      expect((fetchMock.mock.calls[0][1] as any).headers).toMatchObject({
        Accept: 'application/json',
        Authorization: 'Bearer sk_test_tokens',
      });
    });

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

    it('returns built-in tokens when upstream token discovery fails without cache', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Failed to get Soroswap contract address',
      } as any);

      const tokens = await SoroswapService.getTokenList();

      expect(tokens.map((t) => t.symbol)).toEqual(expect.arrayContaining(['USDC', 'XLM']));
      expect(tokens.find((t) => t.symbol === 'USDC')?.address).toBe(USDC);
    });

    it('returns built-in tokens when upstream token discovery returns an empty list', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ tokens: [] }),
      } as any);

      const tokens = await SoroswapService.getTokenList();

      expect(tokens.map((t) => t.symbol)).toEqual(expect.arrayContaining(['USDC', 'XLM']));
      expect(tokens).not.toHaveLength(0);
    });
  });
});
