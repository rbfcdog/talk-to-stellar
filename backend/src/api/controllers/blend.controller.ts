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
      ok(res, { pools, count: Array.isArray(pools) ? pools.length : 0 });
    } catch (e) { err(res, e); }
  },

  async getPool(req: Request, res: Response) {
    try {
      const { pool } = req.params;
      if (!pool) return err(res, 'pool address required', 400);
      const data = await BlendService.getPool(pool);
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getUserPositions(req: Request, res: Response) {
    try {
      const address = (req.params.address ?? req.query.address) as string;
      if (!address) return err(res, 'address required', 400);
      const data = await BlendService.getUserPositions(address);
      ok(res, data);
    } catch (e) { err(res, e); }
  },
};
