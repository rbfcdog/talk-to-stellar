import { Request, Response } from 'express';
import { EvolutionService } from '../services/evolution.service';
import { TransferNotificationService } from '../services/transfer-notification.service';
import { isProductionLikeEnvironment } from '../../config/runtime';
import { timingSafeEqualString } from '../../utils/password';

function readBearerToken(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function hasDiagnosticAuthorization(req: Request): boolean {
  const expected = String(process.env.EVOLUTION_DIAGNOSTIC_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
  if (!expected && !isProductionLikeEnvironment()) return true;
  const provided = String(
    req.headers['x-evolution-diagnostic-secret'] ||
      req.headers['x-internal-api-secret'] ||
      readBearerToken(req) ||
      ''
  ).trim();
  return Boolean(expected && provided && timingSafeEqualString(expected, provided));
}

function configuredEvolutionInstance(): string {
  return String(
    process.env.EVOLUTION_INSTANCE ||
    process.env.EVOLUTION_INSTANCE_NAME ||
    process.env.EVOLUTION_NOTIFY_INSTANCE ||
    process.env.EVOLUTION_DEFAULT_INSTANCE ||
    process.env.EVOLUTION_INSTANCE_ID ||
    ''
  ).trim();
}

export default class EvolutionController {
  static async webhook(req: Request, res: Response) {
    try {
      const secret = req.query.secret || req.get('x-evolution-webhook-secret');
      if (!EvolutionService.verifyWebhookSecret(secret)) {
        return res.status(401).json({ success: false, error: 'Invalid webhook secret.' });
      }

      const payload = req.params.event
        ? { ...req.body, event: req.body?.event || req.params.event }
        : req.body;
      const result = await EvolutionService.handleWebhook(payload);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ success: false, error: message });
    }
  }

  static async ping(_req: Request, res: Response) {
    return res.status(200).json({ success: true, webhook: 'evolution' });
  }

  static async testSend(req: Request, res: Response) {
    if (!hasDiagnosticAuthorization(req)) {
      return res.status(403).json({
        success: false,
        message: 'Internal authorization is required to test Evolution delivery.',
      });
    }

    const instance = String(req.body?.instance || configuredEvolutionInstance()).trim();
    const number = String(req.body?.number || req.body?.phone || req.body?.provider_user_id || '').trim();
    const text = String(req.body?.text || 'Teste TalkToStellar: envio Evolution funcionando.').trim();
    if (!number) {
      return res.status(400).json({ success: false, message: 'number is required.' });
    }

    try {
      const response = await EvolutionService.sendText(instance, number, text, {
        reliable: true,
        attempts: Number(req.body?.attempts || process.env.EVOLUTION_NOTIFY_SEND_ATTEMPTS || 3),
        timeoutMs: Number(req.body?.timeout_ms || req.body?.timeoutMs || process.env.EVOLUTION_NOTIFY_SEND_TIMEOUT_MS || 45000),
      });
      return res.status(200).json({
        success: true,
        instance,
        recipient_tail: number.replace(/\D+/g, '').slice(-4),
        response,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        success: false,
        instance,
        recipient_tail: number.replace(/\D+/g, '').slice(-4),
        message,
      });
    }
  }

  static async testNotify(req: Request, res: Response) {
    if (!hasDiagnosticAuthorization(req)) {
      return res.status(403).json({
        success: false,
        message: 'Internal authorization is required to test notification delivery.',
      });
    }

    const provider = String(req.body?.provider || 'whatsapp').trim();
    const providerUserId = String(req.body?.provider_user_id || req.body?.providerUserId || req.body?.number || req.body?.phone || '').trim();
    const sessionId = String(req.body?.session_id || req.body?.sessionId || '').trim();
    const userId = String(req.body?.user_id || req.body?.userId || '').trim();
    const text = String(req.body?.text || 'Teste TalkToStellar: camada de notificação funcionando.').trim();
    if (!providerUserId && !sessionId && !userId) {
      return res.status(400).json({
        success: false,
        message: 'provider_user_id, session_id or user_id is required.',
      });
    }

    try {
      const report = await TransferNotificationService.notifyExternalChannelMessage({
        sessionId: sessionId || undefined,
        userId: userId || undefined,
        provider,
        providerUserId: providerUserId || undefined,
        text,
      });
      const providerKey = provider.toLowerCase();
      const whatsappRequested = ['whatsapp', 'phone', 'evolution', 'whatsapp_evolution'].includes(providerKey);
      const whatsappFailed =
        whatsappRequested &&
        report.whatsapp.recipients > 0 &&
        report.whatsapp.delivered === 0;
      return res.status(whatsappFailed ? 502 : 200).json({
        success: !whatsappFailed,
        provider,
        recipient_tail: providerUserId.replace(/\D+/g, '').slice(-4) || null,
        session_id: sessionId || null,
        user_id: userId || null,
        delivery: report,
        ...(whatsappFailed
          ? { message: 'Evolution notification was attempted but no WhatsApp recipient was delivered. Check delivery.attempts for the provider error.' }
          : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        success: false,
        provider,
        recipient_tail: providerUserId.replace(/\D+/g, '').slice(-4) || null,
        session_id: sessionId || null,
        user_id: userId || null,
        message,
      });
    }
  }
}
