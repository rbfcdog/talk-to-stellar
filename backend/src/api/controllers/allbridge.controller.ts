import { Request, Response } from 'express';
import { AllbridgeService } from '../../integrations/allbridge/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[allbridge-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const AllbridgeController = {
  async getInfo(_req: Request, res: Response) {
    try {
      const data = await AllbridgeService.getInfo();
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getStellarTokens(_req: Request, res: Response) {
    try {
      const tokens = await AllbridgeService.getStellarTokens();
      ok(res, { tokens });
    } catch (e) { err(res, e); }
  },
};
