import { logger } from '../../utils/logger';
import crypto from 'crypto';

type EvolutionMessage = {
  instance: string;
  remoteJid: string;
  messageId: string;
  fromMe: boolean;
  text: string;
};

type EvolutionWebhookResult = {
  received: boolean;
  replied: boolean;
  skipped?: string;
  recipient?: string;
  instance?: string;
};

type AgentResponse = {
  message: string;
  raw: any;
};

const processedMessages = new Map<string, number>();
const PROCESSED_TTL_MS = 5 * 60 * 1000;

function normalizeBaseUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const isLocalHost =
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|\/|$)/i.test(raw) ||
    /^[a-z0-9_-]+:\d+(?:\/|$)/i.test(raw);
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `${isLocalHost ? 'http' : 'https'}://${raw}`;
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

function normalizeBackendBaseUrl(value: unknown): string {
  return normalizeBaseUrl(value)
    .replace(/\/api\/agent\/query\/?$/i, '')
    .replace(/\/api\/agent\/?$/i, '')
    .replace(/\/api\/?$/i, '');
}

function internalBackendBaseUrl(): string {
  const raw =
    process.env.INTERNAL_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.AGENT_API_URL ||
    `http://127.0.0.1:${process.env.PORT || 3001}`;
  return normalizeBackendBaseUrl(raw);
}

function agentQueryUrl(): string {
  const raw = String(process.env.EVOLUTION_AGENT_URL || process.env.AGENT_API_URL || '').trim();
  if (raw) return normalizeBaseUrl(raw);
  return `${internalBackendBaseUrl()}/api/agent/query`;
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

function normalizeAgentResponse(payload: any): string {
  return String(
    payload?.message ||
    payload?.result?.message ||
    payload?.content ||
    payload?.reply ||
    ''
  ).trim() || 'Nao consegui gerar uma resposta agora. Tente novamente em alguns segundos.';
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

function unwrapMessageContainer(message: any): any {
  let current = message || {};
  for (let index = 0; index < 4; index += 1) {
    const nested =
      current?.ephemeralMessage?.message ||
      current?.viewOnceMessage?.message ||
      current?.viewOnceMessageV2?.message ||
      current?.documentWithCaptionMessage?.message ||
      current?.editedMessage?.message ||
      null;
    if (!nested) break;
    current = nested;
  }
  return current || {};
}

function extractTextFromCandidate(candidate: any): string {
  const message = unwrapMessageContainer(candidate?.message || candidate?.data?.message || candidate || {});
  const possible = [
    candidate?.text,
    candidate?.body,
    candidate?.message?.text,
    message?.conversation,
    message?.extendedTextMessage?.text,
    message?.imageMessage?.caption,
    message?.videoMessage?.caption,
    message?.documentMessage?.caption,
    message?.buttonsResponseMessage?.selectedDisplayText,
    message?.buttonsResponseMessage?.selectedButtonId,
    message?.listResponseMessage?.title,
    message?.listResponseMessage?.description,
    message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    message?.templateButtonReplyMessage?.selectedDisplayText,
    message?.templateButtonReplyMessage?.selectedId,
    message?.interactiveResponseMessage?.body?.text,
    message?.interactiveResponseMessage?.nativeFlowResponseMessage?.name,
  ];

  return String(possible.find((value) => String(value || '').trim()) || '').trim();
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
    const text = extractTextFromCandidate(candidate);

    return {
      instance,
      remoteJid,
      messageId: messageId || `${remoteJid}:${candidate?.messageTimestamp || Date.now()}`,
      fromMe,
      text,
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

async function resolveExistingSession(input: {
  phoneNumber: string;
  remoteJid: string;
  instance: string;
  messageId: string;
}): Promise<string> {
  try {
    const response = await fetch(`${internalBackendBaseUrl()}/api/external/check-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `evolution_check_${input.instance}_${input.messageId}`,
      },
      body: JSON.stringify({
        provider: 'whatsapp',
        provider_user_id: input.phoneNumber,
        phone_number: input.phoneNumber,
        remote_jid: input.remoteJid,
        instance: input.instance,
        lookup_only: true,
      }),
    });
    if (!response.ok) return '';
    const payload = await response.json().catch(() => ({})) as any;
    return payload?.exists && payload?.sessionId ? String(payload.sessionId) : '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[evolution-webhook] external account preflight failed for ***${input.phoneNumber.slice(-4)}: ${message}`);
    return '';
  }
}

async function sendAgentQuery(input: {
  text: string;
  sessionId?: string;
  phoneNumber: string;
  remoteJid: string;
  instance: string;
  messageId: string;
}): Promise<AgentResponse> {
  const payload = {
    query: input.text,
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
    source: 'whatsapp',
    metadata: {
      channel: 'whatsapp',
      provider: 'whatsapp',
      provider_user_id: input.phoneNumber,
      phone_number: input.phoneNumber,
      whatsapp_number: input.phoneNumber,
      remote_jid: input.remoteJid,
      instance: input.instance,
      message_id: input.messageId,
    },
  };
  const idempotencyKey = `evolution_query_${crypto
    .createHash('sha256')
    .update(`${input.instance}:${input.remoteJid}:${input.messageId}:${input.text}`)
    .digest('hex')}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.EVOLUTION_AGENT_TIMEOUT_MS || 45000));
  try {
    const response = await fetch(agentQueryUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Agent API Error: ${response.status} ${errorText}`);
    }

    const body = await response.json().catch(() => ({}));
    return {
      message: normalizeAgentResponse(body),
      raw: body,
    };
  } finally {
    clearTimeout(timeout);
  }
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
    const text = String(message.text || '').trim();
    if (!text) {
      return { received: true, replied: false, skipped: 'empty_or_unsupported_message', recipient, instance };
    }

    void this.replyWithAgent({
      instance,
      recipient,
      remoteJid: message.remoteJid,
      messageId: message.messageId,
      text,
    })
      .then(() => {
        logger.info(`[evolution-webhook] replied with agent to ***${recipient.slice(-4)} on instance ${instance}`);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`[evolution-webhook] failed to process agent reply for ***${recipient.slice(-4)} on instance ${instance}: ${errorMessage}`);
        void this.sendText(instance, recipient, 'Nao consegui processar sua mensagem agora. Tente novamente em alguns segundos.')
          .catch((sendError) => {
            const sendMessage = sendError instanceof Error ? sendError.message : String(sendError);
            logger.warn(`[evolution-webhook] failed to send fallback reply to ***${recipient.slice(-4)}: ${sendMessage}`);
          });
      });

    return {
      received: true,
      replied: true,
      recipient,
      instance,
    };
  }

  private static async replyWithAgent(input: {
    instance: string;
    recipient: string;
    remoteJid: string;
    messageId: string;
    text: string;
  }): Promise<void> {
    const sessionId = await resolveExistingSession({
      phoneNumber: input.recipient,
      remoteJid: input.remoteJid,
      instance: input.instance,
      messageId: input.messageId,
    });
    const response = await sendAgentQuery({
      text: input.text,
      sessionId: sessionId || undefined,
      phoneNumber: input.recipient,
      remoteJid: input.remoteJid,
      instance: input.instance,
      messageId: input.messageId,
    });
    try {
      await this.sendText(input.instance, input.recipient, response.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[evolution-webhook] generated agent reply but Evolution sendText failed for ***${input.recipient.slice(-4)}: ${message}`);
    }
  }
}
