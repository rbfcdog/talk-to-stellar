import { logger, startTimer, truncate } from '../../../utils/logger';
import { isProductionLikeEnvironment } from '../../../config/runtime';
import { timingSafeEqualString } from '../../../utils/password';
import { supabase } from '../../../config/supabase';
import { sleep } from '../../../utils/async';
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
  queued?: boolean;
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
type EvolutionReplyDeliveryStatus = 'sent' | 'queued';

let webhookAutoConfigurationStarted = false;
let outboundWorkerStarted = false;
let outboundQueueDrainTimer: NodeJS.Timeout | null = null;
let outboundQueueDrainRunning = false;
let inboundWorkerStarted = false;
let inboundQueueDrainTimer: NodeJS.Timeout | null = null;
let inboundQueueDrainRunning = false;

// In-memory ring buffer of recent webhook receipts for diagnostics.
const recentWebhooks: Array<{ ts: string; remote: string; text: string; result: string }> = [];
const MAX_RECENT_WEBHOOKS = 20;

class EvolutionSendTextError extends Error {
  status?: number;
  body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

class EvolutionReplyDeliveryError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'EvolutionReplyDeliveryError';
  }
}

const processedMessages = new Map<string, number>();
const activeWebhookReplies = new Map<string, Promise<EvolutionReplyDeliveryStatus>>();
const PROCESSED_TTL_MS = 5 * 60 * 1000;

type PersistentDedupeReservation = {
  status: 'reserved' | 'duplicate' | 'unavailable';
  key?: string;
};

type EvolutionInboundQueueResult = EvolutionWebhookResult & {
  queued?: boolean;
  duplicate?: boolean;
  unavailable?: boolean;
  dedupeKey?: string;
};

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

function publicFrontendBaseUrl(): string {
  const raw =
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.PAYMENT_CONFIRM_BASE ||
    process.env.CREATE_ACCOUNT_BASE ||
    'http://localhost:3000';
  return normalizeBaseUrl(raw);
}

function buildFrontendUrl(path: string, params: Record<string, unknown> = {}): string {
  const url = new URL(path, publicFrontendBaseUrl());
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? '').trim();
    if (text) url.searchParams.set(key, text);
  }
  return url.toString();
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
  ).trim() || 'Não consegui gerar uma resposta agora. Tente novamente em alguns segundos.';
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
    normalized.includes('não consegui processar sua mensagem') ||
    normalized.includes('desculpe, não consegui processar sua mensagem') ||
    normalized.includes('não consegui entender com segurança') ||
    normalized.includes('posso ajudar com:') ||
    normalized.includes('diga o objetivo em uma frase') ||
    normalized.includes('diga seu objetivo em uma frase') ||
    normalized === 'não consegui gerar uma resposta agora. tente novamente em alguns segundos.'
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
    const url = buildFrontendUrl('/convert', {
      from: 'whatsapp',
      lang: 'pt-BR',
      picker: '1',
    });
    return `Abra a conversão para escolher valor e moedas:\n${url}`;
  }
  if (normalizedIntent === 'yield') {
    return 'Posso abrir a área de aplicações e posições. Diga: "quero investir".';
  }
  if (normalizedIntent === 'wallet' || normalizedIntent === 'onboard' || normalizedIntent === 'login') {
    return 'Posso ajudar com acesso, conta e início de uso. Diga: "entrar na conta" ou "criar conta".';
  }
  return buildCapabilityHelpMessage();
}

function compactMarkdownTopicReply(value: string): string {
  const raw = String(value || '').trim();
  if (!/^##\s+/m.test(raw)) return raw;

  const firstSection = raw
    .split(/\n\s*-{3,}\s*\n/)
    .map((part) => part.trim())
    .find(Boolean) || raw;

  return firstSection
    .split('\n')
    .filter((line) => !/^##\s+/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildUsefulEvolutionReply(response: AgentResponse): string {
  const message = compactMarkdownTopicReply(String(response.message || '').trim());
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
}

function isProcessed(messageKey: string): boolean {
  cleanupProcessedMessages();
  return processedMessages.has(messageKey);
}

function markProcessed(messageKey: string): void {
  processedMessages.set(messageKey, Date.now() + PROCESSED_TTL_MS);
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

function isMissingQueueStorageError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('relation') ||
    message.includes('column')
  );
}

async function reservePersistentDedupeKey(
  idempotencyKey: string,
  requestPayload: Record<string, unknown>
): Promise<PersistentDedupeReservation> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('idempotency_keys').insert({
    idempotency_key: idempotencyKey,
    request_hash: dedupeHash(JSON.stringify(requestPayload)),
    method: 'POST',
    route: '/api/evolution/webhook',
    status: 'processing',
    locked_at: now,
    created_at: now,
    updated_at: now,
  });

  if (!error) return { status: 'reserved', key: idempotencyKey };
  if (isUniqueViolation(error)) return { status: 'duplicate' };

  const message = String((error as any)?.message || error);
  logger.warn(`[evolution-webhook] persistent dedupe unavailable: ${message}`);
  return { status: 'unavailable' };
}

async function completePersistentDedupeKey(idempotencyKey?: string): Promise<void> {
  if (!idempotencyKey) return;
  const now = new Date().toISOString();
  try {
    const { error } = await supabase
      .from('idempotency_keys')
      .update({
        status: 'completed',
        response_status: 200,
        response_body: {
          success: true,
          dedupe: 'evolution_webhook',
        },
        completed_at: now,
        updated_at: now,
      })
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'processing');
    if (error) {
      logger.warn(`[evolution-webhook] could not complete persistent dedupe claim: ${String((error as any)?.message || error)}`);
    }
  } catch (error) {
    logger.warn(`[evolution-webhook] could not complete persistent dedupe claim: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function releasePersistentDedupeKey(idempotencyKey?: string): Promise<void> {
  if (!idempotencyKey) return;
  try {
    const { error } = await supabase
      .from('idempotency_keys')
      .delete()
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'processing');
    if (error) {
      logger.warn(`[evolution-webhook] could not release persistent dedupe claim: ${String((error as any)?.message || error)}`);
    }
  } catch (error) {
    logger.warn(`[evolution-webhook] could not release persistent dedupe claim: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function reserveEvolutionWebhookDedupe(input: {
  instance: string;
  remoteJid: string;
  messageId: string;
  text: string;
}): Promise<PersistentDedupeReservation> {
  const normalizedText = normalizeDedupeText(input.text);
  const textHash = dedupeHash(normalizedText);
  const commonPayload = {
    instance: input.instance,
    remote_jid: input.remoteJid,
    message_id: input.messageId,
    text_hash: textHash,
  };

  return reservePersistentDedupeKey(
    evolutionDedupeKey('incoming_message', `${input.instance}:${input.remoteJid}:${input.messageId}:${textHash}`),
    {
      ...commonPayload,
      dedupe_kind: 'message_id_and_text',
    }
  );
}

function shouldSendFailureFallback(): boolean {
  const value = String(process.env.EVOLUTION_SEND_FAILURE_FALLBACK || '').trim().toLowerCase();
  return value !== 'false' && value !== '0';
}

function shouldRequireDurableWebhookDedupe(): boolean {
  const value = String(process.env.EVOLUTION_REQUIRE_DURABLE_WEBHOOK_DEDUPE || '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'on' || value === 'yes';
}

function outboundQueueMaxAttempts(): number {
  return clampNumber(process.env.EVOLUTION_OUTBOUND_MAX_ATTEMPTS, 8, 1, 25);
}

function inboundQueueMaxAttempts(): number {
  return clampNumber(process.env.EVOLUTION_INBOUND_MAX_ATTEMPTS, 5, 1, 25);
}

function outboundQueueInitialDelayMs(): number {
  return clampNumber(process.env.EVOLUTION_OUTBOUND_RETRY_INITIAL_DELAY_MS, 15_000, 0, 300_000);
}

function inboundQueueInitialDelayMs(): number {
  return clampNumber(process.env.EVOLUTION_INBOUND_RETRY_INITIAL_DELAY_MS, 0, 0, 300_000);
}

function inboundDirectFallbackDelayMs(): number {
  return clampNumber(process.env.EVOLUTION_INBOUND_DIRECT_FALLBACK_DELAY_MS, 1500, 0, 60_000);
}

function shouldUseInboundDirectFallback(): boolean {
  return !isEnvDisabled(process.env.EVOLUTION_INBOUND_DIRECT_FALLBACK_ENABLED);
}

function outboundQueueBackoffMs(attempts: number): number {
  const base = clampNumber(process.env.EVOLUTION_OUTBOUND_RETRY_BACKOFF_MS, 30_000, 1_000, 600_000);
  const max = clampNumber(process.env.EVOLUTION_OUTBOUND_RETRY_MAX_DELAY_MS, 30 * 60_000, base, 24 * 60 * 60_000);
  const exponent = Math.max(0, Math.min(attempts, 8));
  return Math.min(max, base * Math.pow(2, exponent));
}

function inboundQueueBackoffMs(attempts: number): number {
  const base = clampNumber(process.env.EVOLUTION_INBOUND_RETRY_BACKOFF_MS, 10_000, 1_000, 600_000);
  const max = clampNumber(process.env.EVOLUTION_INBOUND_RETRY_MAX_DELAY_MS, 10 * 60_000, base, 24 * 60 * 60_000);
  const exponent = Math.max(0, Math.min(attempts, 8));
  return Math.min(max, base * Math.pow(2, exponent));
}

function outboundQueueLockTimeoutMs(): number {
  return clampNumber(process.env.EVOLUTION_OUTBOUND_LOCK_TIMEOUT_MS, 2 * 60_000, 30_000, 60 * 60_000);
}

function inboundQueueLockTimeoutMs(): number {
  return clampNumber(process.env.EVOLUTION_INBOUND_LOCK_TIMEOUT_MS, 2 * 60_000, 30_000, 60 * 60_000);
}

function queuedTextDedupeKey(input: {
  instance: string;
  recipient: string;
  messageId?: string;
  text: string;
}): string {
  return evolutionDedupeKey(
    'outbound_message',
    `${input.instance}:${input.recipient}:${input.messageId || ''}:${dedupeHash(input.text)}`
  );
}

function queuedWebhookDedupeKey(input: {
  instance: string;
  remoteJid: string;
  messageId?: string;
  text: string;
}): string {
  return evolutionDedupeKey(
    'inbound_webhook',
    `${input.instance}:${input.remoteJid}:${input.messageId || ''}:${dedupeHash(normalizeDedupeText(input.text))}`
  );
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

function isInboundTextMessageEvent(value: unknown): boolean {
  const event = normalizeEvent(value);
  if (!event) return true;
  return [
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'MESSAGES_SET',
    'MESSAGES_NOTIFY',
    'SEND_MESSAGE',
  ].includes(event);
}

function messageCandidates(payload: any): any[] {
  const roots = [payload, payload?.body].filter(Boolean);
  const candidates: any[] = [];
  for (const root of roots) {
    const data = root?.data;
    if (Array.isArray(data)) candidates.push(...data);
    else if (Array.isArray(data?.messages)) candidates.push(...data.messages);
    else if (data) candidates.push(data);

    if (Array.isArray(root?.messages)) candidates.push(...root.messages);
    candidates.push(root);
  }
  return candidates.filter(Boolean);
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
  const event = payload?.event || payload?.type || payload?.data?.event || payload?.data?.type;

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
    if (!text && !isMessagesUpsertEvent(event)) continue;
    if (!isInboundTextMessageEvent(event) && !text) continue;

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

function collectStatusStrings(value: any, depth = 0): string[] {
  if (!value || depth > 4) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectStatusStrings(item, depth + 1));
  if (typeof value !== 'object') return [];

  const statuses: string[] = [];
  for (const key of ['status', 'state', 'messageStatus', 'deliveryStatus']) {
    const raw = value?.[key];
    if (typeof raw === 'string' && raw.trim()) statuses.push(raw.trim().toLowerCase());
  }

  return statuses.concat(
    collectStatusStrings(value.data, depth + 1),
    collectStatusStrings(value.response, depth + 1),
    collectStatusStrings(value.message, depth + 1),
    collectStatusStrings(value.result, depth + 1)
  );
}

function hasEvolutionMessageKey(value: any, depth = 0): boolean {
  if (!value || depth > 4) return false;
  if (Array.isArray(value)) return value.some((item) => hasEvolutionMessageKey(item, depth + 1));
  if (typeof value !== 'object') return false;

  const key = value.key || value.messageKey;
  if (key && typeof key === 'object' && String(key.id || '').trim()) return true;
  if (String(value.messageId || value.message_id || value.id || '').trim()) return true;
  return (
    hasEvolutionMessageKey(value.data, depth + 1) ||
    hasEvolutionMessageKey(value.response, depth + 1) ||
    hasEvolutionMessageKey(value.message, depth + 1) ||
    hasEvolutionMessageKey(value.result, depth + 1)
  );
}

function evolutionResponseIndicatesFailure(body: any): boolean {
  if (!body || typeof body !== 'object') return false;
  if (body.success === false || body.sent === false || body.delivered === false) return true;
  if (body.error || body.errors) return true;

  const statuses = collectStatusStrings(body);
  return statuses.some((status) => [
    'error',
    'erro',
    'failed',
    'failure',
    'rejected',
    'not_sent',
    'undelivered',
    'timeout',
  ].includes(status));
}

function evolutionResponseLooksAccepted(body: any): boolean {
  if (!body || typeof body !== 'object') return true;
  if (evolutionResponseIndicatesFailure(body)) return false;
  if (body.success === true || body.sent === true || body.delivered === true) return true;
  if (hasEvolutionMessageKey(body)) return true;

  const statuses = collectStatusStrings(body);
  if (statuses.some((status) => [
    'ok',
    'success',
    'sent',
    'delivered',
    'pending',
    'server_ack',
    'device_ack',
    'read',
    'played',
  ].includes(status))) {
    return true;
  }

  // Evolution versions differ in response shape. Unknown 2xx bodies are still
  // accepted as success, but explicit failure markers above are not.
  return true;
}

async function resolveExistingSession(input: {
  phoneNumber: string;
  remoteJid: string;
  instance: string;
  instanceId?: string;
  messageId: string;
}): Promise<string> {
  const t = startTimer();
  try {
    const url = `${internalBackendBaseUrl()}/api/external/check-account`;
    logger.trace(`[evolution-webhook] session_lookup starting phone=***${input.phoneNumber.slice(-4)} url=${url}`);
    const response = await fetch(url, {
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
    if (!response.ok) {
      logger.trace(`[evolution-webhook] session_lookup not_found status=${response.status} phone=***${input.phoneNumber.slice(-4)} elapsed=${t.elapsed()}ms`);
      return '';
    }
    const payload = await response.json().catch(() => ({})) as any;
    const found = Boolean(payload?.exists && payload?.sessionId);
    const sessionIdTail = found ? truncate(String(payload.sessionId), 16) : '?';
    logger.trace(`[evolution-webhook] session_lookup result=${found ? 'found' : 'not_found'} session_id=${sessionIdTail} phone=***${input.phoneNumber.slice(-4)} elapsed=${t.elapsed()}ms`);
    return found ? String(payload.sessionId) : '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[evolution-webhook] session_lookup failed phone=***${input.phoneNumber.slice(-4)} error=${truncate(message,120)} elapsed=${t.elapsed()}ms`);
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
  const t = startTimer();
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

  const timeoutMs = Number(process.env.EVOLUTION_AGENT_TIMEOUT_MS || 45000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const ingestSecret = readAgentIngestSecret();
  const agentUrl = agentQueryUrl();

  logger.trace(`[evolution-agent] request_start url=${agentUrl} query=${truncate(input.text,80)} session=${input.sessionId ? truncate(input.sessionId,16) : 'none'} phone=***${input.phoneNumber.slice(-4)} timeout=${timeoutMs}ms`);
  try {
    const response = await fetch(agentUrl, {
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
      const errorPreview = truncate(errorText, 200);
      logger.warn(`[evolution-agent] response_failed status=${response.status} error=${errorPreview} phone=***${input.phoneNumber.slice(-4)} elapsed=${t.elapsed()}ms`);
      throw new Error(`Agent API Error: ${response.status} ${errorText}`);
    }

    const body = await response.json().catch(() => ({})) as any;
    const messagePreview = truncate(normalizeAgentResponse(body), 120);
    logger.info(`[evolution-agent] response_ok intent=${truncate(String(body?.intent || '?'),30)} action=${truncate(String(body?.action || '?'),30)} success=${body?.success ?? '?'} message=${messagePreview} phone=***${input.phoneNumber.slice(-4)} elapsed=${t.elapsed()}ms`);
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
  static getRecentWebhooks(): Array<{ ts: string; remote: string; text: string; result: string }> {
    return [...recentWebhooks];
  }

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
    const instanceId = process.env.EVOLUTION_INSTANCE_ID || '';
    const { baseUrl, apiKey } = assertEvolutionConfig(instance);
    const webhookUrl = this.buildWebhookUrl();
    const t = startTimer();

    // First, read the current webhook config to diagnose the state.
    try {
      const findUrl = `${baseUrl}/webhook/find/${encodeURIComponent(instance)}`;
      const findRes = await fetch(findUrl, { headers: { apikey: apiKey } });
      if (findRes.ok) {
        const findBody: any = await findRes.json().catch(() => ({}));
        const currentUrl = findBody?.url || findBody?.webhook?.url || '';
        const currentEnabled = findBody?.enabled ?? findBody?.webhook?.enabled;
        logger.info(`[evolution-webhook] current webhook state: enabled=${currentEnabled} url=${currentUrl ? maskWebhookUrl(String(currentUrl)) : 'none'} raw=${truncate(JSON.stringify(findBody), 400)}`);
        if (currentEnabled && currentUrl === webhookUrl) {
          logger.info(`[evolution-webhook] webhook already correctly configured, skipping`);
          return { success: true, webhookUrl, alreadyConfigured: true, response: findBody };
        }
      } else {
        logger.trace(`[evolution-webhook] could not read current webhook: status=${findRes.status}`);
      }
    } catch (e) {
      logger.trace(`[evolution-webhook] webhook/find error: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Try both instance name and instance ID in the URL path.
    const instanceKeys = [...new Set([instance, instanceId].filter(Boolean))];
    if (instanceKeys.length === 0) instanceKeys.push(instance || 'main');

    // Evolution v2 /webhook/set requires body wrapped in "webhook" key:
    // { "webhook": { "enabled": true, "url": "...", "events": [...], "webhook_by_events": false } }
    const bodies = [
      { webhook: { enabled: true, url: webhookUrl, events: ['MESSAGES_UPSERT'], webhook_by_events: false } },
      { webhook: { enabled: true, url: webhookUrl, events: ['MESSAGES_UPSERT'] } },
      { webhook: { url: webhookUrl, events: ['MESSAGES_UPSERT'] } },
    ];

    let lastStatus = 0;
    let lastBody: any = null;

    for (const instanceKey of instanceKeys) {
      const encodedKey = encodeURIComponent(instanceKey);
      for (const body of bodies) {
        try {
          const response = await fetch(`${baseUrl}/webhook/set/${encodedKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: apiKey,
            },
            body: JSON.stringify(body),
          });

          const responseBody = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
          const status = response.status;
          lastStatus = status;
          lastBody = responseBody;
          logger.info(`[evolution-webhook] configureWebhook instance=${instanceKey} status=${status} body_keys=${JSON.stringify(Object.keys(body))} url=${maskWebhookUrl(webhookUrl)} elapsed=${t.elapsed()}ms`);

          if (status === 200 || status === 201) {
            logger.info(`[evolution-webhook] webhook successfully configured instance=${instanceKey} url=${maskWebhookUrl(webhookUrl)} elapsed=${t.elapsed()}ms`);
            return { success: true, webhookUrl, instance: instanceKey, response: responseBody };
          }

          logger.warn(`[evolution-webhook] configureWebhook rejected status=${status} instance=${instanceKey} body=${truncate(JSON.stringify(responseBody), 400)}`);
        } catch (error) {
          logger.trace(`[evolution-webhook] configureWebhook network error instance=${instanceKey}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // All formats failed. This is normal when Evolution uses global webhook
    // (WEBHOOK_GLOBAL_URL env var) — the per-instance API is blocked.
    logger.warn(
      `[evolution-webhook] configureWebhook could not set per-instance webhook (${bodies.length * instanceKeys.length} attempts, last status=${lastStatus}). ` +
      `This is OK if Evolution's WEBHOOK_GLOBAL_URL is set to: ${maskWebhookUrl(webhookUrl)}. ` +
      `Verify this value in Evolution's Railway environment variables. ` +
      `Per-instance response: ${truncate(JSON.stringify(lastBody), 200)}`
    );
    return { success: false, webhookUrl, notice: 'per-instance webhook blocked, relying on Evolution global webhook (WEBHOOK_GLOBAL_URL)', lastStatus, lastBody };
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

    const expectedUrl = EvolutionService.buildWebhookUrl();
    logger.info(`[evolution-webhook] auto configuration starting instance=${configuredInstance()} backend_base=${publicBackendBaseUrl()} target_webhook_url=${maskWebhookUrl(expectedUrl)} evolution_api=${evolutionBaseUrl()}`);

    const reconcileIntervalMs = clampNumber(
      process.env.EVOLUTION_WEBHOOK_RECONCILE_INTERVAL_MS,
      60000,
      60000,
      3600000
    );
    const initialDelayMs = clampNumber(
      process.env.EVOLUTION_WEBHOOK_CONFIGURE_INITIAL_DELAY_MS,
      5000,
      1000,
      60000
    );
    let running = false;

    const configure = async (reason: 'startup' | 'periodic') => {
      if (running) return;
      running = true;
      try {
        const result = await EvolutionService.configureWebhook();
        logger.info(
          `[evolution-webhook] configured on ${reason}: instance=${configuredInstance()} url=${maskWebhookUrl(result.webhookUrl)}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[evolution-webhook] auto configuration failed on ${reason}: ${truncate(message, 400)}`);
        logger.warn(`[evolution-webhook] Hint: if Evolution has WEBHOOK_GLOBAL_ENABLED=true with WEBHOOK_GLOBAL_URL set, instance-level /webhook/set may return 400. Either fix WEBHOOK_GLOBAL_URL to ${maskWebhookUrl(expectedUrl)} or disable the global webhook on Evolution to allow per-instance configuration.`);
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

  static startOutboundDeliveryWorker(): void {
    if (outboundWorkerStarted) return;
    outboundWorkerStarted = true;

    if (isEnvDisabled(process.env.EVOLUTION_OUTBOUND_WORKER_ENABLED)) {
      logger.info('[evolution-outbox] worker disabled by env');
      return;
    }

    const intervalMs = clampNumber(
      process.env.EVOLUTION_OUTBOUND_WORKER_INTERVAL_MS,
      30_000,
      5_000,
      600_000
    );
    const startupDelayMs = clampNumber(
      process.env.EVOLUTION_OUTBOUND_WORKER_STARTUP_DELAY_MS,
      5_000,
      0,
      120_000
    );

    const startupTimer = setTimeout(() => {
      void this.processQueuedOutboundDeliveries().catch((error) => {
        logger.warn(`[evolution-outbox] startup drain failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, startupDelayMs);
    startupTimer.unref?.();

    const interval = setInterval(() => {
      void this.processQueuedOutboundDeliveries().catch((error) => {
        logger.warn(`[evolution-outbox] periodic drain failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, intervalMs);
    interval.unref?.();
  }

  static startInboundWebhookWorker(): void {
    if (inboundWorkerStarted) return;
    inboundWorkerStarted = true;

    if (isEnvDisabled(process.env.EVOLUTION_INBOUND_WORKER_ENABLED)) {
      logger.info('[evolution-inbox] worker disabled by env');
      return;
    }

    const intervalMs = clampNumber(
      process.env.EVOLUTION_INBOUND_WORKER_INTERVAL_MS,
      10_000,
      1_000,
      600_000
    );
    const startupDelayMs = clampNumber(
      process.env.EVOLUTION_INBOUND_WORKER_STARTUP_DELAY_MS,
      1_000,
      0,
      120_000
    );

    const startupTimer = setTimeout(() => {
      void this.processQueuedInboundWebhooks().catch((error) => {
        logger.warn(`[evolution-inbox] startup drain failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, startupDelayMs);
    startupTimer.unref?.();

    const interval = setInterval(() => {
      void this.processQueuedInboundWebhooks().catch((error) => {
        logger.warn(`[evolution-inbox] periodic drain failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, intervalMs);
    interval.unref?.();
  }

  private static scheduleInboundQueueDrain(delayMs = 0): void {
    if (inboundQueueDrainTimer) return;
    const clampedDelay = clampNumber(delayMs, 0, 0, 600_000);
    inboundQueueDrainTimer = setTimeout(() => {
      inboundQueueDrainTimer = null;
      void this.processQueuedInboundWebhooks().catch((error) => {
        logger.warn(`[evolution-inbox] scheduled drain failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, clampedDelay);
    inboundQueueDrainTimer.unref?.();
  }

  private static async markInboundQueueCompleted(
    dedupeKey: string | undefined,
    result: EvolutionWebhookResult
  ): Promise<void> {
    if (!dedupeKey) return;
    try {
      const processedAt = new Date().toISOString();
      const update = supabase
        .from('evolution_inbound_queue')
        .update({
          status: 'completed',
          processed_at: processedAt,
          locked_at: null,
          last_error: null,
          result,
          updated_at: processedAt,
        })
        .eq('dedupe_key', dedupeKey);
      if (typeof (update as any).in === 'function') {
        await (update as any).in('status', ['pending', 'failed', 'processing']);
      } else if (typeof (update as any).then === 'function') {
        await update;
      }
    } catch (error) {
      logger.warn(`[evolution-inbox] could not mark direct fallback as completed for ${dedupeKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static scheduleInboundDirectFallback(payload: any, queued: EvolutionInboundQueueResult): void {
    if (!shouldUseInboundDirectFallback()) return;
    if (!queued.queued) return;

    const delayMs = inboundDirectFallbackDelayMs();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await this.handleWebhook(payload);
          await this.markInboundQueueCompleted(queued.dedupeKey, result);
          if (result.replied) {
            logger.info(`[evolution-inbox] direct fallback replied for queued inbound webhook dedupe_key=${queued.dedupeKey || 'none'}`);
          }
        } catch (error) {
          logger.warn(`[evolution-inbox] direct fallback failed for queued inbound webhook dedupe_key=${queued.dedupeKey || 'none'}: ${error instanceof Error ? error.message : String(error)}`);
        }
      })();
    }, delayMs);
    timer.unref?.();
  }

  private static scheduleOutboundQueueDrain(delayMs = 0): void {
    if (outboundQueueDrainTimer) return;
    const clampedDelay = clampNumber(delayMs, 0, 0, 600_000);
    outboundQueueDrainTimer = setTimeout(() => {
      outboundQueueDrainTimer = null;
      void this.processQueuedOutboundDeliveries().catch((error) => {
        logger.warn(`[evolution-outbox] scheduled drain failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, clampedDelay);
    outboundQueueDrainTimer.unref?.();
  }

  static async queueWebhook(payload: any): Promise<EvolutionInboundQueueResult> {
    const message = extractMessage(payload);
    if (!message) return { received: true, replied: false, skipped: 'not_messages_upsert' };
    if (message.fromMe) return { received: true, replied: false, skipped: 'from_me' };

    const recipient = numberFromRemoteJid(message.remoteJid);
    if (!recipient) {
      return { received: true, replied: false, skipped: 'recipient_not_number', instance: message.instance };
    }

    const instance = message.instance || configuredInstance();
    const text = String(message.text || '').trim();
    if (!text) {
      return { received: true, replied: false, skipped: 'empty_or_unsupported_message', recipient, instance };
    }

    const dedupeKey = queuedWebhookDedupeKey({
      instance,
      remoteJid: message.remoteJid,
      messageId: message.messageId,
      text,
    });
    const now = new Date();
    const nextAttemptAt = new Date(now.getTime() + inboundQueueInitialDelayMs()).toISOString();
    const row = {
      dedupe_key: dedupeKey,
      provider: 'whatsapp',
      instance,
      recipient,
      remote_jid: message.remoteJid,
      message_id: String(message.messageId || '').trim() || null,
      text_hash: dedupeHash(normalizeDedupeText(text)),
      payload,
      status: 'pending',
      attempts: 0,
      max_attempts: inboundQueueMaxAttempts(),
      next_attempt_at: nextAttemptAt,
      metadata: {
        event: String(payload?.event || payload?.type || '').trim() || null,
        source: 'evolution_webhook',
      },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    try {
      const { error } = await supabase
        .from('evolution_inbound_queue')
        .insert(row);
      if (error) {
        if (isUniqueViolation(error)) {
          logger.info(`[evolution-inbox] inbound webhook already queued dedupe_key=${dedupeKey}`);
          return { received: true, replied: false, queued: true, duplicate: true, dedupeKey, recipient, instance };
        }
        if (isMissingQueueStorageError(error)) {
          logger.warn(`[evolution-inbox] queue table unavailable: ${String(error.message || error)}`);
          return { received: true, replied: false, queued: false, unavailable: true, dedupeKey, recipient, instance };
        }
        throw error;
      }

      logger.info(`[evolution-inbox] queued inbound WhatsApp message from ***${recipient.slice(-4)} instance=${instance} dedupe_key=${dedupeKey}`);
      this.scheduleInboundQueueDrain(inboundQueueInitialDelayMs() + 50);
      return { received: true, replied: false, queued: true, dedupeKey, recipient, instance };
    } catch (error) {
      if (isMissingQueueStorageError(error)) {
        logger.warn(`[evolution-inbox] queue unavailable: ${error instanceof Error ? error.message : String(error)}`);
        return { received: true, replied: false, queued: false, unavailable: true, dedupeKey, recipient, instance };
      }
      throw error;
    }
  }

  static async processQueuedInboundWebhooks(limitInput?: number): Promise<{
    processed: number;
    completed: number;
    failed: number;
    remaining: number;
  }> {
    if (inboundQueueDrainRunning) {
      return { processed: 0, completed: 0, failed: 0, remaining: 0 };
    }
    inboundQueueDrainRunning = true;

    try {
      const limit = clampNumber(limitInput || process.env.EVOLUTION_INBOUND_DRAIN_LIMIT, 10, 1, 100);
      const now = new Date().toISOString();
      const staleLockedBefore = new Date(Date.now() - inboundQueueLockTimeoutMs()).toISOString();
      const staleRelease = await supabase
        .from('evolution_inbound_queue')
        .update({
          status: 'failed',
          locked_at: null,
          last_error: 'stale processing lock released for retry',
          updated_at: now,
        })
        .eq('status', 'processing')
        .lt('locked_at', staleLockedBefore);
      if ((staleRelease as any)?.error && !isMissingQueueStorageError((staleRelease as any).error)) {
        logger.warn(`[evolution-inbox] stale lock release failed: ${String((staleRelease as any).error.message || (staleRelease as any).error)}`);
      }

      const query = supabase
        .from('evolution_inbound_queue')
        .select('*')
        .in('status', ['pending', 'failed'])
        .lte('next_attempt_at', now)
        .order('next_attempt_at', { ascending: true })
        .limit(limit);
      const { data, error } = await query;
      if (error) {
        if (isMissingQueueStorageError(error)) {
          logger.warn(`[evolution-inbox] drain skipped; queue table unavailable: ${String(error.message || error)}`);
          return { processed: 0, completed: 0, failed: 0, remaining: 0 };
        }
        throw error;
      }

      const rows = Array.isArray(data) ? data : [];
      let completed = 0;
      let failed = 0;

      if (rows.length > 0) {
        logger.trace(`[evolution-inbox] worker cycle found ${rows.length} pending rows`);
      }

      for (const row of rows) {
        const dedupeKey = String(row?.dedupe_key || '').trim();
        if (!dedupeKey) continue;
        const currentAttempts = Number(row?.attempts || 0);
        const maxAttempts = clampNumber(row?.max_attempts, inboundQueueMaxAttempts(), 1, 25);
        if (currentAttempts >= maxAttempts) {
          const updatedAt = new Date().toISOString();
          await supabase
            .from('evolution_inbound_queue')
            .update({
              status: 'dead_letter',
              locked_at: null,
              last_error: String(row?.last_error || `max attempts exhausted (${maxAttempts})`).slice(0, 1000),
              updated_at: updatedAt,
            })
            .eq('dedupe_key', dedupeKey);
          failed += 1;
          logger.warn(`[evolution-inbox] inbound webhook moved to dead_letter after ${currentAttempts}/${maxAttempts} attempts dedupe_key=${dedupeKey}`);
          continue;
        }

        const attemptNumber = currentAttempts + 1;
        const lockedAt = new Date().toISOString();
        const claim = await supabase
          .from('evolution_inbound_queue')
          .update({
            status: 'processing',
            locked_at: lockedAt,
            updated_at: lockedAt,
          })
          .eq('dedupe_key', dedupeKey)
          .in('status', ['pending', 'failed']);
        if ((claim as any)?.error) {
          logger.warn(`[evolution-inbox] could not claim inbound webhook ${dedupeKey}: ${String((claim as any).error.message || (claim as any).error)}`);
          continue;
        }

        try {
          const result = await this.handleWebhook(row.payload);
          const processedAt = new Date().toISOString();
          await supabase
            .from('evolution_inbound_queue')
            .update({
              status: 'completed',
              attempts: attemptNumber,
              processed_at: processedAt,
              locked_at: null,
              last_error: null,
              result,
              updated_at: processedAt,
            })
            .eq('dedupe_key', dedupeKey);
          completed += 1;
          logger.info(`[evolution-inbox] processed inbound webhook dedupe_key=${dedupeKey}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const nextAttemptAt = new Date(Date.now() + inboundQueueBackoffMs(attemptNumber)).toISOString();
          await supabase
            .from('evolution_inbound_queue')
            .update({
              status: attemptNumber >= maxAttempts ? 'dead_letter' : 'failed',
              attempts: attemptNumber,
              next_attempt_at: nextAttemptAt,
              locked_at: null,
              last_error: message.slice(0, 1000),
              updated_at: new Date().toISOString(),
            })
            .eq('dedupe_key', dedupeKey);
          failed += 1;
          logger.warn(`[evolution-inbox] inbound webhook failed attempt=${attemptNumber}/${maxAttempts} dedupe_key=${dedupeKey}: ${message}`);
        }
      }

      return {
        processed: rows.length,
        completed,
        failed,
        remaining: Math.max(0, rows.length - completed - failed),
      };
    } finally {
      inboundQueueDrainRunning = false;
    }
  }

  static async queueText(input: {
    instance: string;
    recipient: string;
    text: string;
    remoteJid?: string;
    messageId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ queued: boolean; dedupeKey?: string; duplicate?: boolean; unavailable?: boolean }> {
    const instance = sendableEvolutionInstance(input.instance);
    const recipient = normalizeOutboundWhatsAppNumber(input.recipient);
    const text = String(input.text || '').trim();
    if (!instance || !recipient || !text) return { queued: false };

    const dedupeKey = queuedTextDedupeKey({
      instance,
      recipient,
      messageId: input.messageId,
      text,
    });
    const now = new Date();
    const nextAttemptAt = new Date(now.getTime() + outboundQueueInitialDelayMs()).toISOString();
    const row = {
      dedupe_key: dedupeKey,
      provider: 'whatsapp',
      instance,
      recipient,
      remote_jid: String(input.remoteJid || '').trim() || null,
      message_id: String(input.messageId || '').trim() || null,
      text,
      status: 'pending',
      attempts: 0,
      max_attempts: outboundQueueMaxAttempts(),
      next_attempt_at: nextAttemptAt,
      last_error: String(input.reason || '').slice(0, 1000) || null,
      metadata: input.metadata || {},
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    try {
      const { error } = await supabase
        .from('evolution_outbound_queue')
        .insert(row);
      if (error) {
        if (isUniqueViolation(error)) {
          logger.info(`[evolution-outbox] outbound reply already queued dedupe_key=${dedupeKey}`);
          return { queued: true, dedupeKey, duplicate: true };
        }
        if (isMissingQueueStorageError(error)) {
          logger.warn(`[evolution-outbox] queue table unavailable: ${String(error.message || error)}`);
          return { queued: false, dedupeKey, unavailable: true };
        }
        throw error;
      }

      logger.warn(`[evolution-outbox] queued WhatsApp reply for ***${recipient.slice(-4)} instance=${instance} dedupe_key=${dedupeKey}`);
      this.scheduleOutboundQueueDrain(outboundQueueInitialDelayMs() + 250);
      return { queued: true, dedupeKey };
    } catch (error) {
      if (isMissingQueueStorageError(error)) {
        logger.warn(`[evolution-outbox] queue unavailable: ${error instanceof Error ? error.message : String(error)}`);
        return { queued: false, dedupeKey, unavailable: true };
      }
      throw error;
    }
  }

  static async processQueuedOutboundDeliveries(limitInput?: number): Promise<{
    processed: number;
    sent: number;
    failed: number;
    remaining: number;
  }> {
    if (outboundQueueDrainRunning) {
      return { processed: 0, sent: 0, failed: 0, remaining: 0 };
    }
    outboundQueueDrainRunning = true;

    try {
      const limit = clampNumber(limitInput || process.env.EVOLUTION_OUTBOUND_DRAIN_LIMIT, 20, 1, 100);
      const now = new Date().toISOString();
      const staleLockedBefore = new Date(Date.now() - outboundQueueLockTimeoutMs()).toISOString();
      const staleRelease = await supabase
        .from('evolution_outbound_queue')
        .update({
          status: 'failed',
          locked_at: null,
          last_error: 'stale sending lock released for retry',
          updated_at: now,
        })
        .eq('status', 'sending')
        .lt('locked_at', staleLockedBefore);
      if ((staleRelease as any)?.error && !isMissingQueueStorageError((staleRelease as any).error)) {
        logger.warn(`[evolution-outbox] stale lock release failed: ${String((staleRelease as any).error.message || (staleRelease as any).error)}`);
      }

      const query = supabase
        .from('evolution_outbound_queue')
        .select('*')
        .in('status', ['pending', 'failed'])
        .lte('next_attempt_at', now)
        .order('next_attempt_at', { ascending: true })
        .limit(limit);
      const { data, error } = await query;
      if (error) {
        if (isMissingQueueStorageError(error)) {
          logger.warn(`[evolution-outbox] drain skipped; queue table unavailable: ${String(error.message || error)}`);
          return { processed: 0, sent: 0, failed: 0, remaining: 0 };
        }
        throw error;
      }

      const rows = Array.isArray(data) ? data : [];
      let sent = 0;
      let failed = 0;

      for (const row of rows) {
        const dedupeKey = String(row?.dedupe_key || '').trim();
        if (!dedupeKey) continue;
        const currentAttempts = Number(row?.attempts || 0);
        const maxAttempts = clampNumber(row?.max_attempts, outboundQueueMaxAttempts(), 1, 25);
        if (currentAttempts >= maxAttempts) {
          const updatedAt = new Date().toISOString();
          await supabase
            .from('evolution_outbound_queue')
            .update({
              status: 'dead_letter',
              locked_at: null,
              last_error: String(row?.last_error || `max attempts exhausted (${maxAttempts})`).slice(0, 1000),
              updated_at: updatedAt,
            })
            .eq('dedupe_key', dedupeKey);
          failed += 1;
          logger.warn(`[evolution-outbox] queued WhatsApp reply moved to dead_letter after ${currentAttempts}/${maxAttempts} attempts dedupe_key=${dedupeKey}`);
          continue;
        }
        const attemptNumber = currentAttempts + 1;
        const lockedAt = new Date().toISOString();

        const claim = await supabase
          .from('evolution_outbound_queue')
          .update({
            status: 'sending',
            locked_at: lockedAt,
            updated_at: lockedAt,
          })
          .eq('dedupe_key', dedupeKey)
          .in('status', ['pending', 'failed']);
        if ((claim as any)?.error) {
          logger.warn(`[evolution-outbox] could not claim queued reply ${dedupeKey}: ${String((claim as any).error.message || (claim as any).error)}`);
          continue;
        }

        try {
          await this.sendText(
            String(row.instance || configuredInstance()),
            String(row.recipient || ''),
            String(row.text || ''),
            {
              reliable: true,
              attempts: clampNumber(process.env.EVOLUTION_OUTBOUND_SEND_ATTEMPTS, 1, 1, 3),
              timeoutMs: clampNumber(process.env.EVOLUTION_OUTBOUND_SEND_TIMEOUT_MS, 45_000, 5_000, 180_000),
            }
          );
          const sentAt = new Date().toISOString();
          await supabase
            .from('evolution_outbound_queue')
            .update({
              status: 'sent',
              attempts: attemptNumber,
              sent_at: sentAt,
              locked_at: null,
              last_error: null,
              updated_at: sentAt,
            })
            .eq('dedupe_key', dedupeKey);
          sent += 1;
          logger.info(`[evolution-outbox] delivered queued WhatsApp reply dedupe_key=${dedupeKey}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const nextAttemptAt = new Date(Date.now() + outboundQueueBackoffMs(attemptNumber)).toISOString();
          await supabase
            .from('evolution_outbound_queue')
            .update({
              status: attemptNumber >= maxAttempts ? 'dead_letter' : 'failed',
              attempts: attemptNumber,
              next_attempt_at: nextAttemptAt,
              locked_at: null,
              last_error: message.slice(0, 1000),
              updated_at: new Date().toISOString(),
            })
            .eq('dedupe_key', dedupeKey);
          failed += 1;
          logger.warn(`[evolution-outbox] queued WhatsApp reply failed attempt=${attemptNumber}/${maxAttempts} dedupe_key=${dedupeKey}: ${message}`);
        }
      }

      return {
        processed: rows.length,
        sent,
        failed,
        remaining: Math.max(0, rows.length - sent - failed),
      };
    } finally {
      outboundQueueDrainRunning = false;
    }
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
    const t = startTimer();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    let response: Response;
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

    logger.trace(`[evolution-send] sending variant=${input.bodyVariant} to=${input.number.replace(/\D+/g, '').slice(-4)} instance=${input.instance} text=${truncate(outboundText,80)} timeout=${input.timeoutMs}ms`);

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
      logger.warn(`[evolution-send] sendText failed status=${response.status} to=${input.number.replace(/\D+/g, '').slice(-4)} variant=${input.bodyVariant} body=${truncate(JSON.stringify(responseBody),200)} elapsed=${t.elapsed()}ms`);
      throw new EvolutionSendTextError(
        `Evolution sendText failed: ${response.status} ${JSON.stringify(responseBody)}`,
        response.status,
        responseBody
      );
    }
    if (!evolutionResponseLooksAccepted(responseBody)) {
      logger.warn(`[evolution-send] sendText response rejected status=${response.status} to=${input.number.replace(/\D+/g, '').slice(-4)} variant=${input.bodyVariant} body=${truncate(JSON.stringify(responseBody),200)} elapsed=${t.elapsed()}ms`);
      throw new EvolutionSendTextError(
        `Evolution sendText returned an unsuccessful body after HTTP ${response.status}: ${JSON.stringify(responseBody)}`,
        502,
        responseBody
      );
    }
    logger.trace(`[evolution-send] sendText ok status=${response.status} to=${input.number.replace(/\D+/g, '').slice(-4)} variant=${input.bodyVariant} elapsed=${t.elapsed()}ms`);
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

      logger.trace(`[evolution-send] attempt ${attempt}/${attempts} to ***${normalizeOutboundWhatsAppNumber(numberCandidates[0] || number).slice(-4)} candidates=${numberCandidates.length}`);

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
    const t = startTimer();
    const message = extractMessage(payload);
    if (!message) {
      logger.trace(`[evolution-webhook] step=1 extract_message result=skipped reason=not_messages_upsert elapsed=${t.elapsed()}ms`);
      return { received: true, replied: false, skipped: 'not_messages_upsert' };
    }
    if (message.fromMe) {
      logger.trace(`[evolution-webhook] step=1 extract_message result=skipped reason=from_me remote=${truncate(message.remoteJid,20)} elapsed=${t.elapsed()}ms`);
      return { received: true, replied: false, skipped: 'from_me' };
    }

    const messageKey = `${message.instance || configuredInstance()}:${message.remoteJid}:${message.messageId}`;
    const recipient = numberFromRemoteJid(message.remoteJid);
    if (!recipient) {
      logger.trace(`[evolution-webhook] step=1 extract_message result=skipped reason=recipient_not_number remote=${truncate(message.remoteJid,20)} elapsed=${t.elapsed()}ms`);
      return { received: true, replied: false, skipped: 'recipient_not_number', instance: message.instance };
    }

    const instance = message.instance || configuredInstance();
    const text = String(message.text || '').trim();
    const textPreview = truncate(text, 80);
    logger.info(`[evolution-webhook] step=1 received remote=***${recipient.slice(-4)} instance=${instance} msg_id=${truncate(message.messageId || '?',16)} text=${textPreview} elapsed=${t.elapsed()}ms`);

    recentWebhooks.unshift({ ts: new Date().toISOString(), remote: `***${recipient.slice(-4)}`, text: textPreview, result: 'processing' });
    if (recentWebhooks.length > MAX_RECENT_WEBHOOKS) recentWebhooks.length = MAX_RECENT_WEBHOOKS;

    if (!text) {
      logger.trace(`[evolution-webhook] step=2 empty_text skipped=empty_or_unsupported_message elapsed=${t.elapsed()}ms`);
      return { received: true, replied: false, skipped: 'empty_or_unsupported_message', recipient, instance };
    }

    const exactMessageKey = `${messageKey}:${dedupeHash(normalizeDedupeText(text))}`;

    // step 3: in-memory dedupe
    if (isProcessed(exactMessageKey)) {
      logger.trace(`[evolution-webhook] step=3 dedupe_in_memory duplicate_key=${truncate(exactMessageKey,30)} elapsed=${t.elapsed()}ms`);
      return { received: true, replied: false, skipped: 'duplicate', recipient, instance };
    }

    // step 4: in-flight dedupe
    const activeReply = activeWebhookReplies.get(exactMessageKey);
    if (activeReply) {
      logger.trace(`[evolution-webhook] step=4 dedupe_in_flight duplicate_key=${truncate(exactMessageKey,30)} elapsed=${t.elapsed()}ms`);
      await activeReply.catch(() => undefined);
      return { received: true, replied: false, skipped: 'duplicate_in_flight', recipient, instance };
    }

    // step 5: persistent dedupe (Supabase)
    const persistentClaim = await reserveEvolutionWebhookDedupe({
      instance,
      remoteJid: message.remoteJid,
      messageId: message.messageId,
      text,
    });
    logger.trace(`[evolution-webhook] step=5 dedupe_persistent status=${persistentClaim.status} key=${truncate(persistentClaim.key || 'none',30)} elapsed=${t.elapsed()}ms`);

    if (persistentClaim.status === 'duplicate') {
      logger.trace(`[evolution-webhook] step=5 persistent duplicate skipped=duplicate_persistent elapsed=${t.elapsed()}ms`);
      return { received: true, replied: false, skipped: 'duplicate_persistent', recipient, instance };
    }
    if (persistentClaim.status === 'unavailable' && shouldRequireDurableWebhookDedupe()) {
      throw new Error('Durable WhatsApp webhook dedupe is unavailable.');
    }
    if (persistentClaim.status === 'unavailable') {
      logger.warn(`[evolution-webhook] step=5 durable dedupe unavailable; continuing with in-memory dedupe for ***${recipient.slice(-4)} instance=${instance} elapsed=${t.elapsed()}ms`);
    }

    // step 6: dispatch agent reply
    const step6Start = Date.now();
    logger.trace(`[evolution-webhook] step=6 dispatching agent reply remote=***${recipient.slice(-4)} text=${textPreview}`);
    const replyPromise = this.replyWithAgent({
      instance,
      recipient,
      remoteJid: message.remoteJid,
      messageId: message.messageId,
      instanceId: message.instanceId,
      text,
    });
    activeWebhookReplies.set(exactMessageKey, replyPromise);

    try {
      const replyStatus = await replyPromise;
      logger.info(`[evolution-webhook] step=7 reply_result status=${replyStatus} remote=***${recipient.slice(-4)} step6_elapsed=${Date.now() - step6Start}ms total_elapsed=${t.elapsed()}ms`);

      markProcessed(exactMessageKey);
      await completePersistentDedupeKey(persistentClaim.key);
      if (replyStatus === 'queued') {
        logger.warn(`[evolution-webhook] step=8 agent reply queued for retry remote=***${recipient.slice(-4)} instance=${instance} elapsed=${t.elapsed()}ms`);
        return {
          received: true,
          replied: true,
          queued: true,
          recipient,
          instance,
        };
      }
      logger.info(`[evolution-webhook] step=8 done replied_with=agent remote=***${recipient.slice(-4)} instance=${instance} elapsed=${t.elapsed()}ms`);
      if (recentWebhooks.length > 0) recentWebhooks[0].result = 'replied_agent';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`[evolution-webhook] step=7 agent_reply_failed remote=***${recipient.slice(-4)} instance=${instance} error=${truncate(errorMessage,200)} step6_elapsed=${Date.now() - step6Start}ms total_elapsed=${t.elapsed()}ms`);
      if (error instanceof EvolutionReplyDeliveryError) {
        await releasePersistentDedupeKey(persistentClaim.key);
        throw error;
      }
      try {
        if (!shouldSendFailureFallback()) {
          logger.trace(`[evolution-webhook] step=9 fallback_disabled rethrowing elapsed=${t.elapsed()}ms`);
          throw error;
        }
        const fallbackText = buildEvolutionFallbackReply();
        logger.trace(`[evolution-webhook] step=9 sending_fallback text=${truncate(fallbackText,80)} elapsed=${t.elapsed()}ms`);
        try {
          await this.sendText(instance, recipient, fallbackText, { reliable: true, attempts: 1 });
        } catch (fallbackDeliveryError) {
          logger.warn(`[evolution-webhook] step=9 fallback_send_failed queueing_for_retry error=${truncate(fallbackDeliveryError instanceof Error ? fallbackDeliveryError.message : String(fallbackDeliveryError),120)} elapsed=${t.elapsed()}ms`);
          const queued = await this.queueText({
            instance,
            recipient,
            remoteJid: message.remoteJid,
            messageId: message.messageId,
            text: fallbackText,
            reason: fallbackDeliveryError instanceof Error ? fallbackDeliveryError.message : String(fallbackDeliveryError),
            metadata: { source: 'evolution_webhook_fallback' },
          });
          if (queued.queued) {
            markProcessed(exactMessageKey);
            await completePersistentDedupeKey(persistentClaim.key);
            logger.warn(`[evolution-webhook] step=9 fallback_queued remote=***${recipient.slice(-4)} instance=${instance} dedupe_key=${truncate(queued.dedupeKey || '?',30)} elapsed=${t.elapsed()}ms`);
            return {
              received: true,
              replied: true,
              queued: true,
              recipient,
              instance,
            };
          }
          logger.warn(`[evolution-webhook] step=9 fallback_queue_failed unavailable=${queued.unavailable || false} elapsed=${t.elapsed()}ms`);
          await releasePersistentDedupeKey(persistentClaim.key);
          throw fallbackDeliveryError;
        }
        markProcessed(exactMessageKey);
        await completePersistentDedupeKey(persistentClaim.key);
        logger.info(`[evolution-webhook] step=9 done replied_with=fallback remote=***${recipient.slice(-4)} instance=${instance} elapsed=${t.elapsed()}ms`);
        if (recentWebhooks.length > 0) recentWebhooks[0].result = 'replied_fallback';
      } catch (fallbackError) {
        await releasePersistentDedupeKey(persistentClaim.key);
        throw fallbackError;
      }
    } finally {
      activeWebhookReplies.delete(exactMessageKey);
    }

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
  }): Promise<EvolutionReplyDeliveryStatus> {
    const rt = startTimer();
    const textPreview = truncate(input.text, 80);
    logger.trace(`[evolution-webhook] replyWithAgent start remote=***${input.recipient.slice(-4)} text=${textPreview}`);

    const sessionId = await resolveExistingSession({
      phoneNumber: input.recipient,
      remoteJid: input.remoteJid,
      instance: input.instance,
      instanceId: input.instanceId,
      messageId: input.messageId,
    });
    logger.trace(`[evolution-webhook] replyWithAgent session_resolved session=${sessionId ? truncate(sessionId,16) : 'none'} remote=***${input.recipient.slice(-4)} elapsed=${rt.elapsed()}ms`);

    const response = await sendAgentQuery({
      text: input.text,
      sessionId: sessionId || undefined,
      phoneNumber: input.recipient,
      remoteJid: input.remoteJid,
      instance: input.instance,
      instanceId: input.instanceId,
      messageId: input.messageId,
    });
    const agentElapsed = rt.elapsed();

    const replyText = buildUsefulEvolutionReply(response);
    const replyPreview = truncate(replyText, 120);
    logger.trace(`[evolution-webhook] replyWithAgent reply_built intent=${truncate(String(response.intent || '?'),20)} reply=${replyPreview} is_generic=${isGenericAgentReply(String(response.message || ''))} remote=***${input.recipient.slice(-4)} agent_elapsed=${agentElapsed}ms`);

    try {
      await this.sendText(input.instance, input.recipient, replyText, { reliable: true, attempts: 1 });
      logger.info(`[evolution-webhook] replyWithAgent sent remote=***${input.recipient.slice(-4)} instance=${input.instance} elapsed=${rt.elapsed()}ms`);
      return 'sent';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`[evolution-webhook] replyWithAgent send_failed remote=***${input.recipient.slice(-4)} error=${truncate(errorMessage,120)} queueing_for_retry elapsed=${rt.elapsed()}ms`);
      const queued = await this.queueText({
        instance: input.instance,
        recipient: input.recipient,
        remoteJid: input.remoteJid,
        messageId: input.messageId,
        text: replyText,
        reason: errorMessage,
        metadata: { source: 'evolution_webhook_agent_reply' },
      });
      if (queued.queued) {
        logger.warn(`[evolution-webhook] replyWithAgent queued remote=***${input.recipient.slice(-4)} dedupe_key=${truncate(queued.dedupeKey || '?',30)} elapsed=${rt.elapsed()}ms`);
        return 'queued';
      }
      logger.warn(`[evolution-webhook] replyWithAgent queue_failed unavailable=${queued.unavailable || false} remote=***${input.recipient.slice(-4)} elapsed=${rt.elapsed()}ms`);
      throw new EvolutionReplyDeliveryError(error);
    }
  }
}
