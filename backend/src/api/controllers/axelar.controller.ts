import { Request, Response } from 'express';
import { AxelarService } from '../../integrations/axelar/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[axelar-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const AxelarController = {
  async getChains(_req: Request, res: Response) {
    try {
      const data = await AxelarService.getChains();
      const chains = Array.isArray(data) ? data : (data?.data ?? []);
      ok(res, { chains, count: chains.length });
    } catch (e) { err(res, e); }
  },

  async getTransferStatus(req: Request, res: Response) {
    try {
      const txHash = req.params.txHash ?? req.query.txHash as string;
      if (!txHash) return err(res, 'txHash required', 400);
      const data = await AxelarService.getTransferStatus(txHash);
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getAssets(_req: Request, res: Response) {
    try {
      const data = await AxelarService.getAssets();
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getGMPStats(_req: Request, res: Response) {
    try {
      const data = await AxelarService.getGMPStats();
      ok(res, data);
    } catch (e) { err(res, e); }
  },
};
