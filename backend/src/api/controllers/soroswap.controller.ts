import { Request, Response } from 'express';
import { loadSoroswapConfig } from '../../integrations/soroswap/config';
import { SoroswapService } from '../../integrations/soroswap/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[soroswap-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const SoroswapController = {
  /**
   * GET /soroswap/quote?assetIn=USDC&assetOut=XLM&amount=10.5&tradeType=EXACT_IN
   * Returns best-route quote across Soroswap, Phoenix, Aqua, SDEX.
   */
  async quote(req: Request, res: Response) {
    try {
      const { assetIn, assetOut, amount, tradeType } = req.query as Record<string, string>;
      if (!assetIn) return err(res, 'assetIn query param required', 400);
      if (!assetOut) return err(res, 'assetOut query param required', 400);
      if (!amount) return err(res, 'amount query param required', 400);
      if (tradeType && tradeType !== 'EXACT_IN' && tradeType !== 'EXACT_OUT') {
        return err(res, 'tradeType must be EXACT_IN or EXACT_OUT', 400);
      }
      const result = await SoroswapService.getQuote({
        assetIn,
        assetOut,
        amount,
        tradeType: tradeType as 'EXACT_IN' | 'EXACT_OUT' | undefined,
      });
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  /**
   * POST /soroswap/build
   * Body: { quote: <SwapQuoteResult>, senderAddress: string, slippageBps?: number }
   * Returns: { xdr: string, quote: SwapQuoteResult }
   */
  async build(req: Request, res: Response) {
    try {
      const { quote, senderAddress, slippageBps } = req.body ?? {};
      if (!quote) return err(res, 'quote is required', 400);
      if (!senderAddress) return err(res, 'senderAddress is required', 400);
      if (!quote.rawQuote) return err(res, 'quote.rawQuote is missing — pass the full quote object from /quote', 400);
      const result = await SoroswapService.buildSwapXdr({
        quote,
        senderAddress,
        slippageBps: slippageBps !== undefined ? parseInt(String(slippageBps), 10) : undefined,
      });
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  /**
   * POST /soroswap/send
   * Body: { signedXdr: string }
   * Returns Horizon submission metadata for the signed swap transaction.
   */
  async send(req: Request, res: Response) {
    try {
      const { signedXdr } = req.body ?? {};
      if (!signedXdr) return err(res, 'signedXdr is required', 400);
      const result = await SoroswapService.sendSignedXdr(String(signedXdr));
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  /**
   * GET /soroswap/tokens
   * Returns all tradable tokens for the configured network (cached 10 min).
   */
  async tokens(_req: Request, res: Response) {
    try {
      const config = loadSoroswapConfig();
      const tokens = await SoroswapService.getTokenList();
      ok(res, { count: tokens.length, network: config.network, tokens });
    } catch (e) { err(res, e); }
  },

  /**
   * GET /soroswap/pool-info?network=mainnet
   * Returns XLM/USDC liquidity pool data from Stellar Horizon (fee_bp, reserves).
   * Always fetches from mainnet as the canonical source of real liquidity data.
   */
  async poolInfo(req: Request, res: Response) {
    try {
      const network = String(req.query.network || '').toLowerCase();
      const useMainnet = network === 'mainnet' || network === 'public' || !network;
      const horizonUrl = useMainnet
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';
      const usdcIssuer = useMainnet
        ? 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
        : 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';

      const qs = new URLSearchParams({ reserves: `native,USDC:${usdcIssuer}`, order: 'desc', limit: '5' });
      const r = await fetch(`${horizonUrl}/liquidity_pools?${qs}`, {
        signal: AbortSignal.timeout(8_000),
        headers: { Accept: 'application/json' },
      });
      if (!r.ok) throw new Error(`Horizon /liquidity_pools → ${r.status}`);
      const data: any = await r.json();
      const pools: any[] = data._embedded?.records ?? [];
      const pool = pools[0];
      if (!pool) {
        return ok(res, { fee_bp: 30, reserves: [], network: useMainnet ? 'mainnet' : 'testnet' });
      }
      ok(res, {
        pool_id: pool.id,
        fee_bp: pool.fee_bp ?? 30,
        total_shares: pool.total_shares,
        total_trustlines: pool.total_trustlines,
        reserves: pool.reserves ?? [],
        network: useMainnet ? 'mainnet' : 'testnet',
      });
    } catch (e) { err(res, e); }
  },
};
