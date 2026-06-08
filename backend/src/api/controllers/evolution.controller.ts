import { Request, Response } from 'express';
import { EvolutionService } from '../services/evolution.service';
import { TransferNotificationService } from '../services/transfer-notification.service';
import { isProductionLikeEnvironment } from '../../config/runtime';
import { timingSafeEqualString } from '../../utils/password';
import { logger, startTimer, truncate } from '../../utils/logger';

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

function shouldProcessWebhookSynchronously(): boolean {
  const value = String(process.env.EVOLUTION_WEBHOOK_SYNC_PROCESSING || '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}

function summarizeEvent(payload: any): string {
  try {
    const event = payload?.event || payload?.data?.event || payload?.type || '?';
    const body = payload?.data ?? payload;
    const messages = Array.isArray(body?.messages) ? body.messages : (body?.message ? [body.message] : []);
    const jids = messages
      .map((m: any) => m?.key?.remoteJid || m?.remoteJid || '')
      .filter(Boolean);
    const uniqueJids = [...new Set(jids)].map((jid: unknown) => String(jid).split('@')[0].replace(/\D+/g, '').slice(-4));
    const texts = messages
      .map((m: any) => (m?.message?.conversation || m?.message?.extendedTextMessage?.text || '').trim())
      .filter(Boolean);
    return `event=${truncate(String(event),40)} msgs=${messages.length} remote=${uniqueJids.join(',') || '?'} text=${truncate(texts.join(' | '),80)} bodyKB=${(JSON.stringify(body || {}).length / 1024).toFixed(1)}`;
  } catch {
    const raw = JSON.stringify(payload || {});
    return `bodyKB=${(raw.length / 1024).toFixed(1)} raw_preview=${truncate(raw, 120)}`;
  }
}

export default class EvolutionController {
  static async webhook(req: Request, res: Response) {
    const t = startTimer();
    try {
      const secret = req.query.secret || req.get('x-evolution-webhook-secret');
      const secretValid = EvolutionService.verifyWebhookSecret(secret);
      logger.info(`[evolution-webhook] request received ${summarizeEvent(req.body)} path=${truncate(req.path, 80)} secret_ok=${secretValid} remote=${req.ip || '?'}`);
      if (!secretValid) {
        logger.warn(`[evolution-webhook] rejected invalid webhook secret remote=${req.ip || '?'} elapsed=${t.elapsed()}ms`);
        return res.status(401).json({ success: false, error: 'Invalid webhook secret.' });
      }

      const payload = req.params.event
        ? { ...req.body, event: req.body?.event || req.params.event }
        : req.body;
      const syncMode = shouldProcessWebhookSynchronously();
      logger.trace(`[evolution-webhook] processing mode sync=${syncMode} event_param=${truncate(String(req.params.event || 'none'), 40)}`);

      if (!syncMode) {
        const queued = await EvolutionService.queueWebhook(payload);
        logger.info(`[evolution-webhook] queue result queued=${queued.queued} duplicate=${queued.duplicate || false} unavailable=${queued.unavailable || false} dedupe_key=${truncate(queued.dedupeKey || 'none', 30)} skipped=${queued.skipped || 'none'} elapsed=${t.elapsed()}ms`);
        if (!queued.unavailable) {
          EvolutionService.scheduleInboundDirectFallback(payload, queued);
          return res.status(200).json({ success: true, async: true, ...queued });
        }
        logger.warn(`[evolution-webhook] queue unavailable, processing synchronously as fallback`);
      }

      const result = await EvolutionService.handleWebhook(payload);
      logger.info(`[evolution-webhook] sync processing done replied=${result.replied} skipped=${result.skipped || 'none'} queued=${result.queued || false} recipient=${truncate(result.recipient || '?',16)} elapsed=${t.elapsed()}ms`);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[evolution-webhook] webhook handler crashed ${truncate(message, 300)} elapsed=${t.elapsed()}ms`);
      return res.status(500).json({ success: false, error: message });
    }
  }

  static async ping(_req: Request, res: Response) {
    return res.status(200).json({ success: true, webhook: 'evolution' });
  }

  static async health(_req: Request, res: Response) {
    try {
      const instance = configuredEvolutionInstance();
      const baseUrl = process.env.EVOLUTION_API_URL || '';
      const apiKey = process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || '';
      const backendUrl = process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_PUBLIC_URL || '';

      const result: any = {
        success: true,
        backend: {
          evolution_api_url: baseUrl || 'not set',
          evolution_instance: instance || 'not set',
          public_backend_url: backendUrl || 'not set',
          webhook_sync_processing: shouldProcessWebhookSynchronously(),
        },
        recent_webhooks: EvolutionService.getRecentWebhooks(),
      };

      if (baseUrl && apiKey && instance) {
        const webhookFindUrl = `${baseUrl}/webhook/find/${encodeURIComponent(instance)}`;
        try {
          const res = await fetch(webhookFindUrl, { headers: { apikey: apiKey } });
          const body = await res.json().catch(() => ({}));
          result.evolution_webhook = {
            reachable: true,
            status: res.status,
            config: body,
          };
        } catch (e) {
          result.evolution_webhook = {
            reachable: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }

      return res.status(200).json(result);
    } catch (error) {
      return res.status(200).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  static async echo(req: Request, res: Response) {
    logger.info(`[evolution-webhook] echo received body_size=${JSON.stringify(req.body || {}).length} headers=${JSON.stringify({ ct: req.get('content-type'), host: req.get('host') })}`);
    return res.status(200).json({
      received: true,
      body: req.body,
      query: req.query,
      headers: {
        'content-type': req.get('content-type'),
        host: req.get('host'),
        'user-agent': req.get('user-agent'),
      },
    });
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
      const whatsappQueued = report.whatsapp.attempts.some((attempt) => attempt.queued);
      const whatsappFailed =
        whatsappRequested &&
        report.whatsapp.recipients > 0 &&
        report.whatsapp.delivered === 0 &&
        !whatsappQueued;
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

  static async drainOutbox(req: Request, res: Response) {
    if (!hasDiagnosticAuthorization(req)) {
      return res.status(403).json({
        success: false,
        message: 'Internal authorization is required to drain the Evolution outbox.',
      });
    }

    const limit = Number(req.body?.limit || req.query?.limit || process.env.EVOLUTION_OUTBOUND_DRAIN_LIMIT || 20);
    try {
      const result = await EvolutionService.processQueuedOutboundDeliveries(limit);
      return res.status(200).json({
        success: true,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        success: false,
        message,
      });
    }
  }

  static async drainInbox(req: Request, res: Response) {
    if (!hasDiagnosticAuthorization(req)) {
      return res.status(403).json({
        success: false,
        message: 'Internal authorization is required to drain the Evolution inbox.',
      });
    }

    const limit = Number(req.body?.limit || req.query?.limit || process.env.EVOLUTION_INBOUND_DRAIN_LIMIT || 10);
    try {
      const result = await EvolutionService.processQueuedInboundWebhooks(limit);
      return res.status(200).json({
        success: true,
        result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        success: false,
        message,
      });
    }
  }
}
