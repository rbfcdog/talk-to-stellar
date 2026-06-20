import { Request, Response } from 'express';
import { AquariusService } from '../../integrations/aquarius/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[aquarius-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const AquariusController = {
  async getPoolRewards(req: Request, res: Response) {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10), 100);
      const data = await AquariusService.getPoolRewards(limit);
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getPairReward(req: Request, res: Response) {
    try {
      const asset1 = String(req.query.asset1 ?? req.params.asset1 ?? '').toUpperCase();
      const asset2 = String(req.query.asset2 ?? req.params.asset2 ?? '').toUpperCase();
      if (!asset1 || !asset2) return err(res, 'asset1 and asset2 are required', 400);

      const reward = await AquariusService.getPairReward(asset1, asset2);
      if (!reward) return ok(res, { found: false, pair: `${asset1}/${asset2}`, message: 'No AQUA reward programme for this pair' });
      ok(res, { found: true, ...reward });
    } catch (e) { err(res, e); }
  },

  async estimateDailyAqua(req: Request, res: Response) {
    try {
      const poolTvl = parseFloat(String(req.query.pool_tvl_usd ?? '0'));
      const userUsd = parseFloat(String(req.query.user_usd ?? '0'));
      const asset1 = String(req.query.asset1 ?? 'XLM').toUpperCase();
      const asset2 = String(req.query.asset2 ?? 'USDC').toUpperCase();

      if (poolTvl <= 0) return err(res, 'pool_tvl_usd must be > 0', 400);
      if (userUsd <= 0) return err(res, 'user_usd must be > 0', 400);

      const result = await AquariusService.estimateDailyAqua(poolTvl, userUsd, asset1, asset2);
      ok(res, result);
    } catch (e) { err(res, e); }
  },
};
