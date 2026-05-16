import { logger } from '../../utils/logger';

type EvolutionMessage = {
  instance: string;
  remoteJid: string;
  messageId: string;
  fromMe: boolean;
};

type EvolutionWebhookResult = {
  received: boolean;
  replied: boolean;
  skipped?: string;
  recipient?: string;
  instance?: string;
};

const processedMessages = new Map<string, number>();
const PROCESSED_TTL_MS = 5 * 60 * 1000;

function normalizeBaseUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, '');
}

function publicBackendBaseUrl(): string {
  const raw =
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RENDER_EXTERNAL_URL ||
    '';
  return normalizeBaseUrl(raw);
}

function evolutionBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.EVOLUTION_API_URL ||
    process.env.EVOLUTION_BASE_URL ||
    process.env.EVOLUTION_SERVER_URL ||
    ''
  );
}

function evolutionApiKey(): string {
  return String(
    process.env.EVOLUTION_API_KEY ||
    process.env.EVOLUTION_APIKEY ||
    process.env.EVOLUTION_GLOBAL_API_KEY ||
    ''
  ).trim();
}

function configuredInstance(): string {
  return String(process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '').trim();
}

function helloText(): string {
  return String(process.env.EVOLUTION_HELLO_TEXT || 'hello').trim() || 'hello';
}

function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [key, expiresAt] of processedMessages.entries()) {
    if (expiresAt <= now) processedMessages.delete(key);
  }
}

function hasProcessed(messageKey: string): boolean {
  cleanupProcessedMessages();
  if (processedMessages.has(messageKey)) return true;
  processedMessages.set(messageKey, Date.now() + PROCESSED_TTL_MS);
  return false;
}

function normalizeEvent(value: unknown): string {
  return String(value || '').trim().replace(/[.\-]/g, '_').toUpperCase();
}

function isMessagesUpsertEvent(value: unknown): boolean {
  const event = normalizeEvent(value);
  return !event || event === 'MESSAGES_UPSERT';
}

function messageCandidates(payload: any): any[] {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (Array.isArray(payload?.messages)) return payload.messages;
  return [data || payload].filter(Boolean);
}

function extractMessage(payload: any): EvolutionMessage | null {
  if (!isMessagesUpsertEvent(payload?.event || payload?.type)) return null;

  const fallbackInstance = String(payload?.instance || payload?.instanceName || configuredInstance()).trim();
  for (const candidate of messageCandidates(payload)) {
    const key = candidate?.key || candidate?.message?.key || {};
    const remoteJid = String(
      key.remoteJid ||
      candidate?.remoteJid ||
      candidate?.jid ||
      candidate?.chatId ||
      ''
    ).trim();
    if (!remoteJid) continue;

    const messageId = String(
      key.id ||
      candidate?.id ||
      candidate?.messageId ||
      candidate?.message_id ||
      ''
    ).trim();
    const fromMe = Boolean(key.fromMe || candidate?.fromMe);
    const instance = String(candidate?.instance || candidate?.instanceName || fallbackInstance).trim();

    return {
      instance,
      remoteJid,
      messageId: messageId || `${remoteJid}:${candidate?.messageTimestamp || Date.now()}`,
      fromMe,
    };
  }

  return null;
}

function numberFromRemoteJid(remoteJid: string): string {
  const normalized = String(remoteJid || '').trim();
  if (!normalized || normalized.endsWith('@g.us')) return '';
  return normalized.split('@')[0].replace(/\D+/g, '');
}

function assertEvolutionConfig(instance: string) {
  const baseUrl = evolutionBaseUrl();
  const apiKey = evolutionApiKey();
  if (!baseUrl) throw new Error('EVOLUTION_API_URL is required.');
  if (!apiKey) throw new Error('EVOLUTION_API_KEY is required.');
  if (!instance) throw new Error('EVOLUTION_INSTANCE is required.');
  return { baseUrl, apiKey, instance };
}

export class EvolutionService {
  static buildWebhookUrl(): string {
    const baseUrl = publicBackendBaseUrl();
    if (!baseUrl) {
      throw new Error('PUBLIC_BACKEND_URL or BACKEND_PUBLIC_URL is required to configure the Evolution webhook.');
    }

    const url = new URL(`${baseUrl}/api/evolution/webhook`);
    const secret = String(process.env.EVOLUTION_WEBHOOK_SECRET || '').trim();
    if (secret) url.searchParams.set('secret', secret);
    return url.toString();
  }

  static async configureWebhook(): Promise<any> {
    const instance = configuredInstance();
    const { baseUrl, apiKey } = assertEvolutionConfig(instance);
    const webhookUrl = this.buildWebhookUrl();

    const response = await fetch(`${baseUrl}/webhook/set/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT'],
      }),
    });

    const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
    if (!response.ok) {
      throw new Error(`Evolution webhook setup failed: ${response.status} ${JSON.stringify(body)}`);
    }

    return {
      success: true,
      webhookUrl,
      response: body,
    };
  }

  static async sendText(instance: string, number: string, text: string): Promise<any> {
    const { baseUrl, apiKey } = assertEvolutionConfig(instance);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({
          number,
          text,
          delay: 300,
          linkPreview: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
    if (!response.ok) {
      throw new Error(`Evolution sendText failed: ${response.status} ${JSON.stringify(body)}`);
    }
    return body;
  }

  static verifyWebhookSecret(value: unknown): boolean {
    const expected = String(process.env.EVOLUTION_WEBHOOK_SECRET || '').trim();
    if (!expected) return true;
    return String(value || '').trim() === expected;
  }

  static async handleWebhook(payload: any): Promise<EvolutionWebhookResult> {
    const message = extractMessage(payload);
    if (!message) return { received: true, replied: false, skipped: 'not_messages_upsert' };
    if (message.fromMe) return { received: true, replied: false, skipped: 'from_me' };

    const messageKey = `${message.instance || configuredInstance()}:${message.remoteJid}:${message.messageId}`;
    if (hasProcessed(messageKey)) {
      return { received: true, replied: false, skipped: 'duplicate', instance: message.instance };
    }

    const recipient = numberFromRemoteJid(message.remoteJid);
    if (!recipient) {
      return { received: true, replied: false, skipped: 'recipient_not_number', instance: message.instance };
    }

    const instance = message.instance || configuredInstance();
    void this.sendText(instance, recipient, helloText())
      .then(() => {
        logger.info(`[evolution-webhook] replied hello to ***${recipient.slice(-4)} on instance ${instance}`);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`[evolution-webhook] failed to reply hello to ***${recipient.slice(-4)} on instance ${instance}: ${errorMessage}`);
      });

    return {
      received: true,
      replied: true,
      recipient,
      instance,
    };
  }
}
