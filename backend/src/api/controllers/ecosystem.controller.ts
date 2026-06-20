import { Request, Response } from 'express';
import { EcosystemService } from '../../integrations/ecosystem/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[ecosystem-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

function isValidStellarAddress(addr: string): boolean {
  return typeof addr === 'string' && (addr.startsWith('G') || addr.startsWith('C')) && addr.length >= 54;
}

export const EcosystemController = {
  async getOverview(req: Request, res: Response) {
    try {
      const address = String(req.params.address ?? req.query.address ?? '');
      if (!isValidStellarAddress(address)) {
        return err(res, 'Valid Stellar address required (G... or C..., ≥54 chars)', 400);
      }
      const overview = await EcosystemService.getOverview(address);
      ok(res, overview);
    } catch (e) { err(res, e); }
  },

  async getSummary(req: Request, res: Response) {
    try {
      const address = String(req.params.address ?? req.query.address ?? '');
      if (!isValidStellarAddress(address)) {
        return err(res, 'Valid Stellar address required', 400);
      }
      const text = await EcosystemService.getSummaryText(address);
      ok(res, { address, summary: text });
    } catch (e) { err(res, e); }
  },
};
