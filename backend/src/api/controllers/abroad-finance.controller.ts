import { Request, Response } from 'express';
import { AbroadFinanceService } from '../../integrations/abroad-finance/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[abroad-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const AbroadFinanceController = {
  async getCorridors(req: Request, res: Response) {
    try {
      const corridors = await AbroadFinanceService.getCorridors();
      const stellar = await AbroadFinanceService.getStellarCorridor();
      ok(res, { corridors, stellar_usdc_pix: stellar });
    } catch (e) { err(res, e); }
  },

  async decodePixQr(req: Request, res: Response) {
    try {
      const payload = String(req.body?.payload ?? req.query.payload ?? '').trim();
      if (!payload) return err(res, 'payload is required (raw PIX QR code string)', 400);
      if (payload.length < 10) return err(res, 'payload too short to be a valid PIX QR code', 400);

      const result = await AbroadFinanceService.decodePixQr(payload);
      ok(res, result);
    } catch (e) { err(res, e, 400); }
  },

  async getQuote(req: Request, res: Response) {
    try {
      const amount = parseFloat(String(req.query.amount ?? '0'));
      if (isNaN(amount) || amount <= 0) return err(res, 'amount must be a positive number (USDC)', 400);

      const quote = await AbroadFinanceService.getQuote(amount);
      if (!quote) {
        return ok(res, {
          available: false,
          message: 'Set ABROAD_PARTNER_API_KEY to enable Abroad Finance quotes',
        });
      }
      ok(res, { available: true, ...quote });
    } catch (e) { err(res, e); }
  },
};
