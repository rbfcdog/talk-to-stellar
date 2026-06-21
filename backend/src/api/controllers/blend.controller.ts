import { Request, Response } from 'express';
import { BlendService } from '../../integrations/blend/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[blend-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const BlendController = {
  async listPools(_req: Request, res: Response) {
    try {
      const pools = await BlendService.listPools();
      ok(res, { pools, count: pools.length });
    } catch (e) { err(res, e); }
  },

  async getPool(req: Request, res: Response) {
    try {
      const poolId = req.params.pool ?? req.query.pool as string;
      if (!poolId) return err(res, 'pool id or contract required', 400);
      const data = await BlendService.getPool(poolId);
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getAddresses(_req: Request, res: Response) {
    ok(res, { pools: BlendService.getPoolAddresses() });
  },
};
