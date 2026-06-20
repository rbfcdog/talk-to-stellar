import { Request, Response } from 'express';
import { ReflectorService } from '../../integrations/reflector/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[reflector-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const ReflectorController = {
  /**
   * GET /reflector/price/:asset
   * Returns price data for a single asset (e.g. XLM, USDC, BRL).
   */
  async getPrice(req: Request, res: Response) {
    try {
      const { asset } = req.params;
      if (!asset) return err(res, 'asset param required', 400);
      const result = await ReflectorService.getPrice(asset);
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  /**
   * GET /reflector/prices?assets=XLM,USDC,BRL
   * Returns a price map for multiple assets.
   */
  async getPrices(req: Request, res: Response) {
    try {
      const raw = (req.query.assets as string) ?? '';
      if (!raw) return err(res, 'assets query param required (comma-separated)', 400);
      const assets = raw.split(',').map((a) => a.trim()).filter(Boolean);
      if (assets.length === 0) return err(res, 'at least one asset required', 400);
      if (assets.length > 20) return err(res, 'max 20 assets per request', 400);
      const result = await ReflectorService.getPrices(assets);
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  /**
   * GET /reflector/rates
   * Returns common exchange rates for the AI agent:
   *   { xlm_usd, brl_usd, usdc_usd }
   *
   * usdc_usd is always 1 (USDC is pegged).
   * brl_usd is USD per 1 BRL (~0.18 when 1 USD = 5.5 BRL).
   */
  async getRates(req: Request, res: Response) {
    try {
      const [xlmEntry, brlEntry] = await Promise.all([
        ReflectorService.getPrice('XLM'),
        ReflectorService.getPrice('BRL'),
      ]);

      ok(res, {
        xlm_usd: xlmEntry.price,
        brl_usd: brlEntry.price,
        usdc_usd: 1,
        meta: {
          xlm: { source: xlmEntry.source, age_seconds: xlmEntry.age_seconds },
          brl: { source: brlEntry.source, age_seconds: brlEntry.age_seconds },
        },
      });
    } catch (e) { err(res, e); }
  },
};
