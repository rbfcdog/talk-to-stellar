import { logger } from '../../../utils/logger';
import { isProductionLikeEnvironment } from '../../../config/runtime';
import { timingSafeEqualString } from '../../../utils/password';
import { supabase } from '../../../config/supabase';
import { buildCapabilityHelpMessage } from '../../agent/capability-help';
import crypto from 'crypto';

type EvolutionMessage = {
  instance: string;
  instanceId?: string;
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
  success?: boolean;
  intent?: string;
  action?: string;
  message: string;
  raw: any;
};

type EvolutionSendTextOptions = {
  reliable?: boolean;
  attempts?: number;
  timeoutMs?: number;
};

type EvolutionSendTextBodyVariant = 'v2' | 'v1' | 'hybrid';

let webhookAutoConfigurationStarted = false;

class EvolutionSendTextError extends Error {
  status?: number;
  body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const processedMessages = new Map<string, number>();
const processedMessageContent = new Map<string, number>();
const PROCESSED_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CONTENT_DEDUPE_TTL_MS = 90 * 1000;

type PersistentDedupeStatus = 'reserved' | 'duplicate' | 'unavailable';

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

function readAgentIngestSecret(): string {
  const names = ['AGENT_INGEST_SECRET', 'INTERNAL_API_SECRET', 'TELEGRAM_NOTIFY_SECRET'];
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
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
    process.env.AUTHENTICATION_API_KEY ||
    ''
  ).trim();
}

function configuredInstanceName(): string {
  return String(
    process.env.EVOLUTION_INSTANCE ||
    process.env.EVOLUTION_INSTANCE_NAME ||
    process.env.EVOLUTION_NOTIFY_INSTANCE ||
    process.env.EVOLUTION_DEFAULT_INSTANCE ||
    ''
  ).trim();
}

function configuredInstance(): string {
  return String(
    configuredInstanceName() ||
    process.env.EVOLUTION_INSTANCE_ID ||
    ''
  ).trim();
}

function isLikelyEvolutionInstanceId(value: unknown): boolean {
  const raw = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
}

function firstString(values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function extractEvolutionInstanceId(payload: any, candidate: any): string {
  const explicit = firstString([
    candidate?.instanceId,
    candidate?.instance_id,
    candidate?.data?.instanceId,
    candidate?.data?.instance_id,
    payload?.instanceId,
    payload?.instance_id,
    payload?.data?.instanceId,
    payload?.data?.instance_id,
  ]);
  if (explicit) return explicit;

  const rawInstance = firstString([candidate?.instance, payload?.instance]);
  return isLikelyEvolutionInstanceId(rawInstance) ? rawInstance : '';
}

function extractEvolutionInstanceName(payload: any, candidate: any): string {
  const rawInstance = firstString([candidate?.instance, payload?.instance]);
  const namedInstance = firstString([
    candidate?.instanceName,
    candidate?.instance_name,
    candidate?.evolution_instance,
    candidate?.evolutionInstance,
    candidate?.data?.instanceName,
    candidate?.data?.instance_name,
    candidate?.data?.evolution_instance,
    candidate?.data?.evolutionInstance,
    payload?.instanceName,
    payload?.instance_name,
    payload?.evolution_instance,
    payload?.evolutionInstance,
    payload?.data?.instanceName,
    payload?.data?.instance_name,
    payload?.data?.evolution_instance,
    payload?.data?.evolutionInstance,
  ]);

  if (namedInstance) return namedInstance;
  if (rawInstance && !isLikelyEvolutionInstanceId(rawInstance)) return rawInstance;
  return configuredInstance() || rawInstance;
}

function sendableEvolutionInstance(value: unknown): string {
  const raw = String(value || '').trim();
  if (isLikelyEvolutionInstanceId(raw)) {
    return configuredInstanceName() || raw;
  }
  return raw || configuredInstance();
}

function isEnvDisabled(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no';
}

function shouldAutoConfigureEvolutionWebhook(): boolean {
  if (isEnvDisabled(process.env.EVOLUTION_AUTO_CONFIGURE_WEBHOOK)) return false;
  if (process.env.NODE_ENV === 'test' && String(process.env.EVOLUTION_AUTO_CONFIGURE_WEBHOOK || '').trim() === '') return false;
  return true;
}

function maskWebhookUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.searchParams.has('secret')) url.searchParams.set('secret', '***');
    return url.toString();
  } catch {
    return value;
  }
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

function isGenericAgentReply(value: string): boolean {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return true;
  return (
    normalized.includes('nao consegui processar sua mensagem') ||
    normalized.includes('desculpe, nao consegui processar sua mensagem') ||
    normalized.includes('nao consegui entender com seguranca') ||
    normalized.includes('posso ajudar com:') ||
    normalized.includes('diga o objetivo em uma frase') ||
    normalized.includes('diga seu objetivo em uma frase') ||
    normalized === 'nao consegui gerar uma resposta agora. tente novamente em alguns segundos.'
  );
}

function buildEvolutionFallbackReply(intent?: string): string {
  const normalizedIntent = String(intent || '').trim().toLowerCase();
  if (normalizedIntent === 'contacts') {
    return 'Posso listar seus contatos ou ajudar a salvar um novo. Diga: "quero ver meus contatos" ou "adicionar Ana ao meu contato".';
  }
  if (normalizedIntent === 'balance') {
    return 'Posso mostrar seu saldo agora. Diga: "ver saldo".';
  }
  if (normalizedIntent === 'history') {
    return 'Posso mostrar seu histórico e comprovantes. Diga: "ver histórico".';
  }
  if (normalizedIntent === 'pix') {
    return 'Posso ajudar com PIX de entrada, saída ou pagamento. Diga: "trazer 100 reais via PIX" ou "sacar 50 reais para meu PIX".';
  }
  if (normalizedIntent === 'payment_link') {
    return 'Posso criar um link de pagamento para receber ou cobrar. Diga: "criar link de pagamento de 50 dólares".';
  }
  if (normalizedIntent === 'conversion') {
    return 'Posso converter entre R$, US$ e CETES. Diga: "converter 200 reais para dólar".';
  }
  if (normalizedIntent === 'yield') {
    return 'Posso abrir a área de aplicações e posições. Diga: "quero investir".';
  }
  if (normalizedIntent === 'wallet' || normalizedIntent === 'onboard' || normalizedIntent === 'login') {
    return 'Posso ajudar com acesso, conta e início de uso. Diga: "entrar na conta" ou "criar conta".';
  }
  return buildCapabilityHelpMessage();
}

function buildUsefulEvolutionReply(response: AgentResponse): string {
  const message = String(response.message || '').trim();
  if (!isGenericAgentReply(message)) return message;

  const intent = String(response.intent || response.raw?.intent || '').trim();
  if (intent) return buildEvolutionFallbackReply(intent);

  const action = String(response.action || response.raw?.action || '').trim().toLowerCase();
  if (action.includes('contact')) return buildEvolutionFallbackReply('contacts');
  if (action.includes('history')) return buildEvolutionFallbackReply('history');
  if (action.includes('balance')) return buildEvolutionFallbackReply('balance');
  if (action.includes('pix')) return buildEvolutionFallbackReply('pix');
  if (action.includes('payment')) return buildEvolutionFallbackReply('payment_link');
  if (action.includes('convert')) return buildEvolutionFallbackReply('conversion');
  if (action.includes('yield') || action.includes('invest')) return buildEvolutionFallbackReply('yield');
  if (action.includes('wallet') || action.includes('login') || action.includes('onboard')) {
    return buildEvolutionFallbackReply('wallet');
  }

  return buildEvolutionFallbackReply();
}

function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [key, expiresAt] of processedMessages.entries()) {
    if (expiresAt <= now) processedMessages.delete(key);
  }
  for (const [key, expiresAt] of processedMessageContent.entries()) {
    if (expiresAt <= now) processedMessageContent.delete(key);
  }
}

function contentDedupeTtlMs(): number {
  const configured = Number(process.env.EVOLUTION_CONTENT_DEDUPE_TTL_MS || DEFAULT_CONTENT_DEDUPE_TTL_MS);
  if (!Number.isFinite(configured) || configured < 10_000) return DEFAULT_CONTENT_DEDUPE_TTL_MS;
  return Math.min(configured, 10 * 60 * 1000);
}

function hasProcessed(messageKey: string): boolean {
  cleanupProcessedMessages();
  if (processedMessages.has(messageKey)) return true;
  processedMessages.set(messageKey, Date.now() + PROCESSED_TTL_MS);
  return false;
}

function hasRecentlyProcessedContent(messageKey: string): boolean {
  cleanupProcessedMessages();
  if (processedMessageContent.has(messageKey)) return true;
  processedMessageContent.set(messageKey, Date.now() + contentDedupeTtlMs());
  return false;
}

function normalizeDedupeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function dedupeHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function evolutionDedupeKey(kind: string, value: string): string {
  return `evolution_${kind}_${dedupeHash(value)}`;
}

function isUniqueViolation(error: any): boolean {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

async function reservePersistentDedupeKey(
  idempotencyKey: string,
  requestPayload: Record<string, unknown>
): Promise<PersistentDedupeStatus> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('idempotency_keys').insert({
    idempotency_key: idempotencyKey,
    request_hash: dedupeHash(JSON.stringify(requestPayload)),
    method: 'POST',
    route: '/api/evolution/webhook',
    status: 'completed',
    response_status: 200,
    response_body: {
      success: true,
      dedupe: 'evolution_webhook',
    },
    locked_at: now,
    completed_at: now,
    created_at: now,
    updated_at: now,
  });

  if (!error) return 'reserved';
  if (isUniqueViolation(error)) return 'duplicate';

  const message = String((error as any)?.message || error);
  logger.warn(`[evolution-webhook] persistent dedupe unavailable: ${message}`);
  return 'unavailable';
}

async function reserveEvolutionWebhookDedupe(input: {
  instance: string;
  remoteJid: string;
  messageId: string;
  text: string;
}): Promise<string> {
  const normalizedText = normalizeDedupeText(input.text);
  const ttl = contentDedupeTtlMs();
  const bucket = Math.floor(Date.now() / ttl);
  const commonPayload = {
    instance: input.instance,
    remote_jid: input.remoteJid,
    message_id: input.messageId,
    text_hash: dedupeHash(normalizedText),
  };

  const reservations = [
    {
      reason: 'duplicate_persistent_message',
      key: evolutionDedupeKey('incoming_message', `${input.instance}:${input.remoteJid}:${input.messageId}`),
      payload: {
        ...commonPayload,
        dedupe_kind: 'message_id',
      },
    },
    {
      reason: 'duplicate_persistent_content',
      key: evolutionDedupeKey('incoming_content', `${input.instance}:${input.remoteJid}:${normalizedText}:${bucket}`),
      payload: {
        ...commonPayload,
        dedupe_kind: 'content',
        bucket,
        ttl_ms: ttl,
      },
    },
  ];

  for (const reservation of reservations) {
    const status = await reservePersistentDedupeKey(reservation.key, reservation.payload);
    if (status === 'duplicate') return reservation.reason;
  }

  return '';
}

function shouldSendFailureFallback(): boolean {
  const value = String(process.env.EVOLUTION_SEND_FAILURE_FALLBACK || '').trim().toLowerCase();
  return value !== 'false' && value !== '0';
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function normalizeOutboundWhatsAppNumber(value: unknown): string {
  const raw = String(value || '').trim();
  const withoutPrefix = raw.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;
  const withoutJid = withoutPrefix.split('@')[0] || withoutPrefix;
  return withoutJid.replace(/\D+/g, '');
}

function outboundWhatsAppNumberCandidates(value: unknown): string[] {
  const digits = normalizeOutboundWhatsAppNumber(value);
  if (!digits) return [];
  return Array.from(new Set([
    digits,
    `+${digits}`,
    `${digits}@s.whatsapp.net`,
  ]));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldTryAlternateSendPayload(error: unknown): boolean {
  const status = error instanceof EvolutionSendTextError ? Number(error.status || 0) : 0;
  return status === 400 || status === 422;
}

function shouldRetrySend(error: unknown): boolean {
  if (error instanceof EvolutionSendTextError) {
    const status = Number(error.status || 0);
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }
  const name = String((error as any)?.name || '').toLowerCase();
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return name === 'aborterror' || message.includes('aborted') || message.includes('timeout') || message.includes('fetch failed') || message.includes('econn');
}

function isMissingEvolutionInstanceError(error: unknown): boolean {
  if (!(error instanceof EvolutionSendTextError)) return false;
  if (Number(error.status || 0) !== 404) return false;
  const body = JSON.stringify(error.body || '').toLowerCase();
  const message = String(error.message || '').toLowerCase();
  return body.includes('instance') && body.includes('does not exist') ||
    message.includes('instance') && message.includes('does not exist');
}

function sendTextBodyVariants(): EvolutionSendTextBodyVariant[] {
  const configured = String(process.env.EVOLUTION_SEND_TEXT_BODY_VERSION || '').trim().toLowerCase();
  if (configured === 'v1') return ['v1', 'v2', 'hybrid'];
  if (configured === 'hybrid') return ['hybrid', 'v2', 'v1'];
  return ['v2', 'v1', 'hybrid'];
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
    const instance = extractEvolutionInstanceName(payload, candidate);
    const instanceId = extractEvolutionInstanceId(payload, candidate);
    const text = extractTextFromCandidate(candidate);

    return {
      instance,
      ...(instanceId ? { instanceId } : {}),
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
  const sendInstance = sendableEvolutionInstance(instance);
  if (!baseUrl) throw new Error('EVOLUTION_API_URL is required.');
  if (!apiKey) throw new Error('EVOLUTION_API_KEY or AUTHENTICATION_API_KEY is required.');
  if (!sendInstance) throw new Error('EVOLUTION_INSTANCE is required.');
  return { baseUrl, apiKey, instance: sendInstance };
}

function collectEvolutionInstanceNames(payload: any): string[] {
  const names: string[] = [];
  const add = (value: unknown) => {
    const name = String(value || '').trim();
    if (!name || isLikelyEvolutionInstanceId(name)) return;
    if (/^https?:\/\//i.test(name)) return;
    if (name.includes('@')) return;
    names.push(name);
  };
  const visit = (value: any, depth = 0) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;

    add(value.name);
    add(value.instanceName);
    add(value.instance_name);
    if (typeof value.instance === 'string') add(value.instance);
    if (value.instance && typeof value.instance === 'object') {
      add(value.instance.name);
      add(value.instance.instanceName);
      add(value.instance.instance_name);
      if (typeof value.instance.instance === 'string') add(value.instance.instance);
    }
    visit(value.data, depth + 1);
    visit(value.instances, depth + 1);
    visit(value.response, depth + 1);
  };

  visit(payload);
  return Array.from(new Set(names));
}

async function discoverEvolutionInstanceNames(baseUrl: string, apiKey: string): Promise<string[]> {
  const endpoints = [
    `${baseUrl}/instance/fetchInstances`,
    `${baseUrl}/instance/fetchInstances/`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          apikey: apiKey,
        },
      });
      if (!response.ok) continue;
      const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
      const names = collectEvolutionInstanceNames(body);
      if (names.length > 0) return names;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[evolution-send] instance discovery failed at ${endpoint}: ${message}`);
    }
  }

  return [];
}

async function resolveExistingSession(input: {
  phoneNumber: string;
  remoteJid: string;
  instance: string;
  instanceId?: string;
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
        ...(input.instanceId ? { instance_id: input.instanceId } : {}),
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
  instanceId?: string;
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
      ...(input.instanceId ? { instance_id: input.instanceId } : {}),
      message_id: input.messageId,
    },
  };
  const idempotencyKey = `evolution_query_${crypto
    .createHash('sha256')
    .update(`${input.instance}:${input.remoteJid}:${input.messageId}:${input.text}`)
    .digest('hex')}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.EVOLUTION_AGENT_TIMEOUT_MS || 45000));
  const ingestSecret = readAgentIngestSecret();
  try {
    const response = await fetch(agentQueryUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ingestSecret ? { 'x-agent-ingest-secret': ingestSecret } : {}),
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Agent API Error: ${response.status} ${errorText}`);
    }

    const body = await response.json().catch(() => ({})) as any;
    return {
      success: body?.success,
      intent: body?.intent,
      action: body?.action,
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

  static startWebhookAutoConfiguration(): void {
    if (webhookAutoConfigurationStarted) return;
    webhookAutoConfigurationStarted = true;

    if (!shouldAutoConfigureEvolutionWebhook()) {
      logger.info('[evolution-webhook] auto configuration disabled by env');
      return;
    }

    const missing = [
      evolutionBaseUrl() ? '' : 'EVOLUTION_API_URL',
      evolutionApiKey() ? '' : 'EVOLUTION_API_KEY',
      configuredInstance() ? '' : 'EVOLUTION_INSTANCE',
      publicBackendBaseUrl() ? '' : 'PUBLIC_BACKEND_URL',
    ].filter(Boolean);

    if (missing.length > 0) {
      logger.warn(`[evolution-webhook] auto configuration skipped; missing ${missing.join(', ')}`);
      return;
    }

    const reconcileIntervalMs = clampNumber(
      process.env.EVOLUTION_WEBHOOK_RECONCILE_INTERVAL_MS,
      60000,
      60000,
      3600000
    );
    const initialDelayMs = clampNumber(
      process.env.EVOLUTION_WEBHOOK_CONFIGURE_INITIAL_DELAY_MS,
      2000,
      0,
      60000
    );
    let running = false;

    const configure = async (reason: 'startup' | 'periodic') => {
      if (running) return;
      running = true;
      try {
        const result = await this.configureWebhook();
        logger.info(
          `[evolution-webhook] configured on ${reason}: instance=${configuredInstance()} url=${maskWebhookUrl(result.webhookUrl)}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[evolution-webhook] auto configuration failed on ${reason}: ${message}`);
      } finally {
        running = false;
      }
    };

    const startupTimer = setTimeout(() => {
      void configure('startup');
    }, initialDelayMs);
    startupTimer.unref?.();

    const interval = setInterval(() => {
      void configure('periodic');
    }, reconcileIntervalMs);
    interval.unref?.();
  }

  private static async sendTextOnce(input: {
    baseUrl: string;
    apiKey: string;
    instance: string;
    number: string;
    text: string;
    timeoutMs: number;
    bodyVariant: EvolutionSendTextBodyVariant;
  }): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    let response: Response;
    // Preserve WhatsApp Markdown markers. Evolution/Baileys applies native
    // formatting, so escaping '*' or '_' here would make receipts look broken.
    const outboundText = String(input.text ?? '');
    const body = input.bodyVariant === 'v1'
      ? {
          number: input.number,
          textMessage: {
            text: outboundText,
          },
          options: {
            delay: 300,
            presence: 'composing',
            linkPreview: false,
          },
        }
      : input.bodyVariant === 'hybrid'
        ? {
            number: input.number,
            text: outboundText,
            options: {
              delay: 300,
              presence: 'composing',
              linkPreview: false,
            },
          }
        : {
          number: input.number,
          text: outboundText,
          delay: 300,
          linkPreview: false,
        };

    try {
      response = await fetch(`${input.baseUrl}/message/sendText/${encodeURIComponent(input.instance)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: input.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseBody = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
    if (!response.ok) {
      throw new EvolutionSendTextError(
        `Evolution sendText failed: ${response.status} ${JSON.stringify(responseBody)}`,
        response.status,
        responseBody
      );
    }
    return responseBody;
  }

  static async sendText(instance: string, number: string, text: string, options: EvolutionSendTextOptions = {}): Promise<any> {
    const { baseUrl, apiKey } = assertEvolutionConfig(instance);
    const numberCandidates = outboundWhatsAppNumberCandidates(number);
    if (numberCandidates.length === 0) throw new Error('Evolution sendText requires a WhatsApp number.');

    const reliable = Boolean(options.reliable);
    const attempts = clampNumber(
      options.attempts || process.env.EVOLUTION_NOTIFY_SEND_ATTEMPTS,
      reliable ? 3 : 1,
      1,
      5
    );
    const timeoutMs = clampNumber(
      options.timeoutMs || process.env.EVOLUTION_NOTIFY_SEND_TIMEOUT_MS,
      reliable ? 45_000 : 15_000,
      5_000,
      180_000
    );
    let lastError: unknown = null;
    const bodyVariants = sendTextBodyVariants();

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let shouldTryRetry = true;

      for (const candidateNumber of numberCandidates) {
        for (const bodyVariant of bodyVariants) {
          try {
            const response = await this.sendTextOnce({
              baseUrl,
              apiKey,
              instance,
              number: candidateNumber,
              text,
              timeoutMs,
              bodyVariant,
            });
            if (reliable) {
              logger.info(`[evolution-send] delivered message to ***${normalizeOutboundWhatsAppNumber(candidateNumber).slice(-4)} using ${bodyVariant} payload`);
            }
            return response;
          } catch (error) {
            lastError = error;
            if (!shouldTryAlternateSendPayload(error)) {
              shouldTryRetry = shouldRetrySend(error);
              break;
            }
          }
        }

        if (!shouldTryAlternateSendPayload(lastError)) break;
      }

      if (attempt >= attempts || !shouldTryRetry) break;
      const backoffMs = Math.min(1000 * attempt, 3000);
      await sleep(backoffMs);
    }

    if (isMissingEvolutionInstanceError(lastError)) {
      const discoveredInstances = (await discoverEvolutionInstanceNames(baseUrl, apiKey))
        .filter((candidate) => candidate !== instance);
      if (discoveredInstances.length > 0) {
        logger.warn(
          `[evolution-send] configured instance "${instance}" was not found; retrying discovered instance(s): ${discoveredInstances.join(',')}`
        );
      }

      for (const discoveredInstance of discoveredInstances) {
        for (const candidateNumber of numberCandidates) {
          for (const bodyVariant of bodyVariants) {
            try {
              const response = await this.sendTextOnce({
                baseUrl,
                apiKey,
                instance: discoveredInstance,
                number: candidateNumber,
                text,
                timeoutMs,
                bodyVariant,
              });
              if (reliable) {
                logger.info(`[evolution-send] delivered message to ***${normalizeOutboundWhatsAppNumber(candidateNumber).slice(-4)} using discovered instance ${discoveredInstance} and ${bodyVariant} payload`);
              }
              return response;
            } catch (error) {
              lastError = error;
              if (!shouldTryAlternateSendPayload(error)) break;
            }
          }

          if (!shouldTryAlternateSendPayload(lastError)) break;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Evolution sendText failed'));
  }

  static verifyWebhookSecret(value: unknown): boolean {
    const expected = String(process.env.EVOLUTION_WEBHOOK_SECRET || '').trim();
    if (!expected) {
      return !isProductionLikeEnvironment();
    }
    return timingSafeEqualString(String(value || '').trim(), expected);
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
    const instanceIdLog = message.instanceId ? ` instance_id=${message.instanceId}` : '';
    logger.info(`[evolution-webhook] received message from ***${recipient.slice(-4)} on instance ${instance}${instanceIdLog} message_id=${message.messageId || 'none'}`);
    const text = String(message.text || '').trim();
    if (!text) {
      return { received: true, replied: false, skipped: 'empty_or_unsupported_message', recipient, instance };
    }

    const contentKey = `${instance}:${message.remoteJid}:${normalizeDedupeText(text)}`;
    if (hasRecentlyProcessedContent(contentKey)) {
      return { received: true, replied: false, skipped: 'duplicate_content', recipient, instance };
    }

    const persistentDuplicate = await reserveEvolutionWebhookDedupe({
      instance,
      remoteJid: message.remoteJid,
      messageId: message.messageId,
      text,
    });
    if (persistentDuplicate) {
      return { received: true, replied: false, skipped: persistentDuplicate, recipient, instance };
    }

    void this.replyWithAgent({
      instance,
      recipient,
      remoteJid: message.remoteJid,
      messageId: message.messageId,
      instanceId: message.instanceId,
      text,
    })
      .then(() => {
        logger.info(`[evolution-webhook] replied with agent to ***${recipient.slice(-4)} on instance ${instance}`);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`[evolution-webhook] failed to process agent reply for ***${recipient.slice(-4)} on instance ${instance}: ${errorMessage}`);
        if (!shouldSendFailureFallback()) return;
        void this.sendText(instance, recipient, buildEvolutionFallbackReply(), { reliable: true })
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
    instanceId?: string;
    text: string;
  }): Promise<void> {
    const sessionId = await resolveExistingSession({
      phoneNumber: input.recipient,
      remoteJid: input.remoteJid,
      instance: input.instance,
      instanceId: input.instanceId,
      messageId: input.messageId,
    });
    const response = await sendAgentQuery({
      text: input.text,
      sessionId: sessionId || undefined,
      phoneNumber: input.recipient,
      remoteJid: input.remoteJid,
      instance: input.instance,
      instanceId: input.instanceId,
      messageId: input.messageId,
    });
    const replyText = buildUsefulEvolutionReply(response);
    try {
      await this.sendText(input.instance, input.recipient, replyText, { reliable: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[evolution-webhook] generated agent reply but Evolution sendText failed for ***${input.recipient.slice(-4)}: ${message}`);
    }
  }
}
