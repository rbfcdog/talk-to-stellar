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
  async getHealth(_req: Request, res: Response) {
    try {
      const data = await StellarBrokerService.getHealth();
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getQuote(req: Request, res: Response) {
    try {
      const { from, to, amount, direction } = req.query as Record<string, string>;
      if (!from || !to || !amount) return err(res, 'from, to, amount required', 400);
      const data = await StellarBrokerService.getQuote(from, to, amount, direction as 'send' | 'receive');
      ok(res, data);
    } catch (e) { err(res, e); }
  },
};
