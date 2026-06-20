import { Request, Response } from 'express';
import { PaymentLinksService } from '../../integrations/payment-links/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown, status = 200) { res.status(status).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[pay-links-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const PaymentLinksController = {
  async create(req: Request, res: Response) {
    try {
      const { stellar_address, amount, asset_code, asset_issuer, memo, memo_type, label, message, expires_in_hours } = req.body;
      if (!stellar_address) return err(res, 'stellar_address required', 400);
      const link = await PaymentLinksService.create({ stellar_address, amount, asset_code, asset_issuer, memo, memo_type, label, message, expires_in_hours });
      ok(res, link, 201);
    } catch (e) { err(res, e); }
  },

  async get(req: Request, res: Response) {
    try {
      const link = await PaymentLinksService.get(req.params.id);
      if (!link) return err(res, 'Not found', 404);
      ok(res, link);
    } catch (e) { err(res, e); }
  },

  async list(req: Request, res: Response) {
    try {
      const address = req.query.address as string;
      if (!address) return err(res, 'address query param required', 400);
      const links = await PaymentLinksService.list(address);
      ok(res, { links });
    } catch (e) { err(res, e); }
  },

  async remove(req: Request, res: Response) {
    try {
      await PaymentLinksService.delete(req.params.id);
      ok(res, { deleted: true });
    } catch (e) { err(res, e); }
  },

  async redirect(req: Request, res: Response) {
    try {
      const link = await PaymentLinksService.get(req.params.id);
      if (!link) return res.status(404).send('Not found');
      await PaymentLinksService.recordUse(req.params.id);
      const ua = req.headers['user-agent'] || '';
      const isMobile = /android|iphone|ipad/i.test(ua);
      if (isMobile) return res.redirect(link.uri);
      return res.json({ uri: link.uri, short_url: link.short_url, label: link.label });
    } catch (e) { err(res, e); }
  },
};
