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
  async getChains(_req: Request, res: Response) {
    try {
      const data = await AllbridgeService.getChainTokenMap();
      const stellar = await AllbridgeService.getStellarTokens().catch(() => null);
      ok(res, { chains: data, stellar_tokens: stellar });
    } catch (e) { err(res, e); }
  },

  async getStellarTokens(_req: Request, res: Response) {
    try {
      const data = await AllbridgeService.getStellarTokens();
      ok(res, { stellar: data });
    } catch (e) { err(res, e); }
  },

  async getReceiveAmount(req: Request, res: Response) {
    try {
      const { amount, sourceChainId, sourceToken, destChainId, destToken } = req.body;
      if (!amount || !sourceChainId || !sourceToken || !destChainId || !destToken)
        return err(res, 'amount, sourceChainId, sourceToken, destChainId, destToken required', 400);
      const data = await AllbridgeService.getReceiveAmount({ amount, sourceChainId, sourceToken, destChainId, destToken });
      ok(res, data);
    } catch (e) { err(res, e); }
  },
};
