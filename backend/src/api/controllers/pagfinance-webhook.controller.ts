/**
 * PagFinance webhook receiver (CASHIN_COMPLETED → USDC credit).
 *
 * Signature is verified over the RAW request bytes captured by the
 * express.json verify hook. A missing webhook secret rejects — never
 * fail-open. The handler acks 200 immediately after the atomic claim and
 * settles asynchronously: PagFinance's 2s/4s/8s retries are useless for a
 * Stellar submit, and failed credits are recovered by the intent poll or the
 * signed replay tool.
 */

import { Request, Response } from 'express';
import { getPagfinanceService } from '../../integrations/pagfinance';
import {
  claimOperationForCredit,
  findOperationByPagfinanceIntentId,
  settleCashinOperation,
} from '../../integrations/pagfinance/settlement';
import type { CashinWebhookEnvelope } from '../../integrations/pagfinance/types';
import { logger } from '../../utils/logger';

function str(value: unknown): string {
  return String(value ?? '').trim();
}

export class PagfinanceWebhookController {
  static async cashin(req: Request, res: Response) {
    try {
      const service = getPagfinanceService();
      const rawBody: Buffer | undefined = (req as any).rawBody;
      const signature = str(req.headers['x-app-signature']);

      if (!service.settings.webhookSecret) {
        logger.error('[pagfinance-webhook] rejected delivery: PAGFINANCE_WEBHOOK_SECRET is not configured');
        return res.status(401).json({ success: false, code: 'webhook_secret_missing' });
      }
      if (!rawBody || !Buffer.isBuffer(rawBody) || !service.verifyWebhookSignature(rawBody, signature)) {
        logger.warn('[pagfinance-webhook] rejected delivery: invalid signature');
        return res.status(401).json({ success: false, code: 'invalid_signature' });
      }

      let envelope: CashinWebhookEnvelope;
      try {
        envelope = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return res.status(400).json({ success: false, code: 'invalid_payload' });
      }

      const event = str(envelope.event || req.headers['x-app-event']);
      if (event !== 'CASHIN_COMPLETED') {
        return res.json({ success: true, ignored: true, event });
      }

      const intentId = str(envelope.intentId || envelope.data?.intentId || envelope.data?.correlationID);
      if (!intentId) {
        logger.warn('[pagfinance-webhook] CASHIN_COMPLETED without an intentId');
        return res.json({ success: true, ignored: true });
      }

      const operation = await findOperationByPagfinanceIntentId(intentId);
      if (!operation) {
        logger.warn(`[pagfinance-webhook] no operation found for intent ${intentId}`);
        return res.json({ success: true, ignored: true });
      }

      const claimed = await claimOperationForCredit(operation.id, ['PENDING']);
      if (!claimed) {
        return res.json({ success: true, duplicate: true });
      }

      // Ack before the (slow) Stellar credit; settlement owns failure handling.
      res.json({ success: true });
      void settleCashinOperation(operation, {
        transactionId: str(envelope.data?.transactionID) || undefined,
        completedAt: str(envelope.data?.completedAt) || undefined,
        expectedWallet: str(envelope.data?.walletAddress) || undefined,
        expectedValueCents:
          envelope.data?.valueCents != null ? Number(envelope.data.valueCents) : undefined,
        trigger: 'webhook',
      }).catch((error) => {
        logger.error(
          `[pagfinance-webhook] settlement crashed for ${operation.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
      return res;
    } catch (error) {
      logger.error(`[pagfinance-webhook] handler error: ${error instanceof Error ? error.message : String(error)}`);
      return res.status(500).json({ success: false, code: 'internal_error' });
    }
  }

  static health(_req: Request, res: Response) {
    const service = getPagfinanceService();
    return res.json({ success: true, enabled: service.enabled });
  }
}
