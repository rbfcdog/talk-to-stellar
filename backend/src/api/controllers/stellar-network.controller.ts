import { Request, Response } from 'express';
import { StellarNetworkService } from '../../integrations/stellar-network/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[stellar-network-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const StellarNetworkController = {
  async getStats(req: Request, res: Response) {
    try {
      const stats = await StellarNetworkService.getStats();
      ok(res, stats);
    } catch (e) { err(res, e); }
  },

  async getHealth(req: Request, res: Response) {
    try {
      const health = await StellarNetworkService.getHealth();
      res.status(health.healthy ? 200 : 503).json(health);
    } catch (e) { err(res, e); }
  },

  async getRecommendedFee(req: Request, res: Response) {
    try {
      const result = await StellarNetworkService.getRecommendedFeeMicroXlm();
      ok(res, result);
    } catch (e) { err(res, e); }
  },
};
