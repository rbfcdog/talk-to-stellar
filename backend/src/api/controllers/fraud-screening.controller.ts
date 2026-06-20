import { Request, Response } from 'express';
import { FraudScreeningService } from '../../integrations/fraud-screening/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[fraud-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const FraudScreeningController = {
  async screenAddress(req: Request, res: Response) {
    try {
      const { address } = req.params;
      const network = (req.query.network as string) === 'testnet' ? 'testnet' : 'mainnet';
      const result = await FraudScreeningService.screenAddress(address, network);
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  async screenDomain(req: Request, res: Response) {
    try {
      const result = await FraudScreeningService.screenDomain(req.params.domain);
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  async batchScreen(req: Request, res: Response) {
    try {
      const { addresses } = req.body as { addresses?: string[] };
      if (!Array.isArray(addresses) || addresses.length === 0) return err(res, 'addresses array required', 400);
      if (addresses.length > 50) return err(res, 'max 50 addresses per batch', 400);
      const results = await Promise.all(addresses.map((a) => FraudScreeningService.screenAddress(a)));
      ok(res, { results });
    } catch (e) { err(res, e); }
  },
};
