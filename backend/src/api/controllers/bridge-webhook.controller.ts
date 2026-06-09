/**
 * Bridge.xyz Webhook Controller
 *
 * Receives webhook events from Bridge API:
 *   transfer.completed, transfer.failed, virtual_account.deposit_received,
 *   virtual_account.activated, customer.kyc_approved, etc.
 */

import { Request, Response } from 'express';
import { getBridgeService } from '../../integrations/bridge';
import { logger } from '../../utils/logger';

export default class BridgeWebhookController {
  static async webhook(req: Request, res: Response) {
    try {
      const bridge = getBridgeService();

      const signature = String(req.headers['x-bridge-signature'] || '').trim();
      const rawBody = JSON.stringify(req.body);

      if (!bridge.config.webhookSecret && process.env.NODE_ENV !== 'test') {
        logger.warn('[bridge-webhook] received webhook but BRIDGE_WEBHOOK_SECRET is not configured; skipping signature verification');
      } else if (signature && bridge.config.webhookSecret) {
        const valid = bridge.verifyWebhookSignature(rawBody, signature);
        if (!valid) {
          logger.warn('[bridge-webhook] invalid webhook signature');
          return res.status(401).json({ success: false, error: 'Invalid signature' });
        }
      }

      const event = bridge.parseWebhookEvent(req.body);
      if (!event) {
        logger.warn('[bridge-webhook] could not parse webhook event');
        return res.status(400).json({ success: false, error: 'Invalid event payload' });
      }

      logger.info(`[bridge-webhook] received event=${event.type} id=${event.id}`);

      switch (event.type) {
        case 'transfer.completed':
          logger.info(`[bridge-webhook] transfer completed id=${(event.data as any)?.id || '?'}`);
          break;
        case 'transfer.failed':
          logger.warn(`[bridge-webhook] transfer failed id=${(event.data as any)?.id || '?'}`);
          break;
        case 'virtual_account.deposit_received':
          logger.info(`[bridge-webhook] virtual account deposit received va=${(event.data as any)?.virtual_account_id || '?'}`);
          break;
        case 'customer.kyc_approved':
          logger.info(`[bridge-webhook] customer KYC approved cust=${(event.data as any)?.customer_id || '?'}`);
          break;
        case 'customer.kyc_rejected':
          logger.warn(`[bridge-webhook] customer KYC rejected cust=${(event.data as any)?.customer_id || '?'}`);
          break;
        default:
          logger.info(`[bridge-webhook] unhandled event type: ${event.type}`);
      }

      return res.status(200).json({ success: true, event: event.type });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[bridge-webhook] handler error: ${message}`);
      return res.status(500).json({ success: false, error: message });
    }
  }

  static async health(_req: Request, res: Response) {
    const bridge = getBridgeService();
    return res.status(200).json({
      success: true,
      bridge: {
        enabled: bridge.enabled,
        baseUrl: bridge.config.baseUrl,
        sandbox: bridge.config.sandbox,
        developerFeePercent: bridge.developerFeePercent,
      },
    });
  }
}
