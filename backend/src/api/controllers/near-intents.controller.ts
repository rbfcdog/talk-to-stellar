import { Request, Response } from 'express';
import { NearIntentsService } from '../../integrations/near-intents/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[near-intents-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const NearIntentsController = {
  async getTokens(_req: Request, res: Response) {
    try {
      const data = await NearIntentsService.getTokens();
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getQuote(req: Request, res: Response) {
    try {
      const {
        asset_in,
        asset_out,
        amount_in,
        amount_out,
      } = req.body;
      if (!asset_in || !asset_out) return err(res, 'asset_in, asset_out required', 400);
      if (!amount_in && !amount_out) return err(res, 'amount_in or amount_out required', 400);
      const data = await NearIntentsService.getQuote({
        defuse_asset_identifier_in: asset_in,
        defuse_asset_identifier_out: asset_out,
        exact_amount_in: amount_in,
        exact_amount_out: amount_out,
        min_deadline_ms: 60_000,
      });
      ok(res, data);
    } catch (e) { err(res, e); }
  },

  async getSupportedRoutes(_req: Request, res: Response) {
    try {
      const routes = await NearIntentsService.getSupportedRoutes();
      ok(res, { routes });
    } catch (e) { err(res, e); }
  },
};
