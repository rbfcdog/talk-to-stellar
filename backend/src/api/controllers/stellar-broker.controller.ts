import { Request, Response } from 'express';
import { StellarBrokerService } from '../../integrations/stellar-broker/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[stellar-broker-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const StellarBrokerController = {
  async getQuote(req: Request, res: Response) {
    try {
      const { from, to, amount, slippage } = req.query as Record<string, string>;
      if (!from || !to || !amount) return err(res, 'from, to, amount required', 400);
      const data = await StellarBrokerService.getQuote(from, to, amount, slippage);
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getRoutes(req: Request, res: Response) {
    try {
      const { from, to } = req.query as Record<string, string>;
      if (!from || !to) return err(res, 'from, to required', 400);
      const data = await StellarBrokerService.getRoutes(from, to);
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getAssets(_req: Request, res: Response) {
    try {
      const data = await StellarBrokerService.getSupportedAssets();
      ok(res, data);
    } catch (e) { err(res, e); }
  },
};
