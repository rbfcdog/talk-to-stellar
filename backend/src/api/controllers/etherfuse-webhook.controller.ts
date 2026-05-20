import { Request, Response } from 'express';
import { timingSafeEqualString } from '../../utils/password';
import { internationalTransferService } from '../services/international-transfer.service';

function readBearerToken(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function webhookAuthorized(req: Request): boolean {
  const expected = String(process.env.ETHERFUSE_WEBHOOK_SECRET || '').trim();
  if (!expected) return true;
  const provided = String(
    req.headers['x-etherfuse-webhook-secret'] ||
    req.headers['x-webhook-secret'] ||
    req.query.secret ||
    readBearerToken(req) ||
    ''
  ).trim();
  return Boolean(provided && timingSafeEqualString(expected, provided));
}

function statusFromError(error: any): number {
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('not found')) return 404;
  if (message.includes('missing')) return 400;
  return Number(error?.status || error?.statusCode || 500);
}

export class EtherfuseWebhookController {
  static async pix(req: Request, res: Response) {
    if (!webhookAuthorized(req)) {
      return res.status(401).json({ success: false, message: 'Invalid Etherfuse webhook secret.' });
    }

    try {
      const transfer = await internationalTransferService.handlePixConfirmation(req.body || {});
      return res.status(200).json({ success: true, transfer });
    } catch (error: any) {
      return res.status(statusFromError(error)).json({
        success: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
