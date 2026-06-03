import { supabase } from '../../config/supabase';

export type ResearchStatus = 'observed' | 'started' | 'success' | 'blocked' | 'error' | 'feedback';

export interface UserResearchEventInput {
  sessionId?: string;
  userId?: string;
  email?: string;
  channel?: string;
  eventName: string;
  eventGroup?: string;
  taskLabel?: string;
  status?: ResearchStatus | string;
  feedbackText?: string;
  evidenceUrl?: string;
  evidenceType?: string;
  pageUrl?: string;
  route?: string;
  operationId?: string;
  transactionHash?: string;
  stellarNetwork?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
}

export interface UserResearchRawEvent {
  id?: string;
  source: 'research_event' | 'payment_log' | 'agent_message' | 'agent_session';
  sessionId?: string;
  userId?: string;
  email?: string;
  channel?: string;
  eventName?: string;
  eventGroup?: string;
  taskLabel?: string;
  status?: string;
  feedbackText?: string;
  evidenceUrl?: string;
  evidenceType?: string;
  pageUrl?: string;
  route?: string;
  operationId?: string;
  transactionHash?: string;
  stellarNetwork?: string;
  content?: string;
  role?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface UserResearchLogEntry {
  userLabel: string;
  userIdentifier: string;
  firstSeenAt: string;
  lastSeenAt: string;
  dateLabel: string;
  channel: string;
  whatDid: string;
  result: string;
  feedbackLiteral: string;
  evidence: string;
  sessionIds: string[];
  prompts: string[];
  productResponses: string[];
  blockers: string[];
  operations: string[];
  networks: string[];
}

export interface UserResearchExport {
  generatedAt: string;
  mainnetOnly: boolean;
  networkFilter: string;
  realUserCount: number;
  entries: UserResearchLogEntry[];
  rawEventCount: number;
  excludedSyntheticCount: number;
  warnings: string[];
}

export interface BuildResearchLogOptions {
  since?: string;
  until?: string;
  limitUsers?: number;
  mainnetOnly?: boolean;
  network?: string;
  includeSuspectedTestUsers?: boolean;
  maxRawEvents?: number;
}

type SupabaseRow = Record<string, any>;

const MAINNET_VALUES = new Set(['PUBLIC', 'MAINNET', 'PRODUCTION', 'PROD']);
const TESTNET_VALUES = new Set(['TESTNET', 'SANDBOX', 'DEV', 'DEVELOPMENT']);
const SYNTHETIC_MARKERS = [
  'test',
  'teste',
  'qa-',
  'seed',
  'fake',
  'mock',
  'sample',
  'example.com',
  'localhost',
  'sandbox',
  'generated',
  'bot-only',
];

function trimText(value: unknown, maxLength = 1000): string {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function normalizeChannel(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Web';
  if (normalized.includes('whatsapp') || normalized === 'phone' || normalized === 'evolution') return 'WhatsApp';
  if (normalized.includes('telegram')) return 'Telegram';
  if (normalized.includes('web') || normalized.includes('browser') || normalized.includes('chat')) return 'Web';
  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1);
}

export function normalizeResearchNetwork(value: unknown): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return 'UNKNOWN';
  if (MAINNET_VALUES.has(normalized)) return 'PUBLIC';
  if (TESTNET_VALUES.has(normalized)) return 'TESTNET';
  return normalized;
}

function isMainnet(value: unknown): boolean {
  return normalizeResearchNetwork(value) === 'PUBLIC';
}

function normalizeResearchNetworkFilter(value: unknown, fallback: string): string {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return normalizeResearchNetwork(fallback);
  if (normalized === 'ALL' || normalized === '*' || normalized === 'ANY') return 'ALL';
  return normalizeResearchNetwork(normalized);
}

function matchesNetworkFilter(value: unknown, filter: string): boolean {
  if (filter === 'ALL') return true;
  return normalizeResearchNetwork(value) === filter;
}

function isSuccessStatus(value: unknown): boolean {
  const status = String(value || '').trim().toLowerCase();
  return ['success', 'succeeded', 'completed', 'complete', 'concluido', 'concluida', 'done'].includes(status);
}

function isBlockedStatus(value: unknown): boolean {
  const status = String(value || '').trim().toLowerCase();
  return ['blocked', 'error', 'failed', 'failure', 'travou', 'erro', 'abandoned'].includes(status);
}

function statusLabel(events: UserResearchRawEvent[]): string {
  if (events.some((event) => isBlockedStatus(event.status))) return 'Travou ou exigiu ajuste';
  if (events.some((event) => isSuccessStatus(event.status))) return 'Sucesso';
  if (events.some((event) => event.feedbackText)) return 'Feedback coletado';
  return 'Observado';
}

function maskEmail(value: string): string {
  const email = String(value || '').trim().toLowerCase();
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const name = email.slice(0, at);
  const domain = email.slice(at + 1);
  const prefix = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${prefix}${'*'.repeat(Math.max(3, Math.min(8, name.length - prefix.length)))}@${domain}`;
}

function maskIdentifier(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return 'usuario sem identificador';
  if (raw.includes('@')) return maskEmail(raw);
  const digits = raw.replace(/\D+/g, '');
  if (digits.length >= 8) return `+${digits.slice(0, 4)}****${digits.slice(-2)}`;
  if (raw.length <= 8) return raw;
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}

function isLikelySyntheticUser(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return SYNTHETIC_MARKERS.some((marker) => normalized.includes(marker));
}

function parseDate(value: unknown): number {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : 0;
}

function isoNow(): string {
  return new Date().toISOString();
}

function formatDateLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function firstNonEmpty(values: Array<unknown>): string {
  for (const value of values) {
    const normalized = trimText(value, 2000);
    if (normalized) return normalized;
  }
  return '';
}

function uniqueStrings(values: Array<unknown>, limit = 6): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = trimText(value, 400);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function eventActionLabel(event: UserResearchRawEvent): string {
  const explicit = firstNonEmpty([event.taskLabel, event.eventGroup, event.eventName]);
  if (explicit) return explicit;
  if (event.source === 'payment_log') {
    const source = [event.metadata?.source_amount, event.metadata?.source_asset_code].filter(Boolean).join(' ');
    const destination = [event.metadata?.destination_amount, event.metadata?.destination_asset_code].filter(Boolean).join(' ');
    const operationType = trimText(event.metadata?.operation_type || 'pagamento', 80);
    const movement = source || destination ? `${source || '?'} -> ${destination || '?'}` : '';
    return trimText([operationType, movement].filter(Boolean).join(' '), 220);
  }
  if (event.source === 'agent_message' && event.role === 'user') {
    return `Mensagem: "${trimText(event.content, 160)}"`;
  }
  return event.source;
}

function evidenceLabel(event: UserResearchRawEvent): string {
  const metadata = event.metadata || {};
  return firstNonEmpty([
    event.evidenceUrl,
    metadata.receipt_url,
    metadata.receiptUrl,
    metadata.public_url,
    metadata.url,
    event.transactionHash ? `hash:${event.transactionHash}` : '',
    event.operationId ? `op:${event.operationId}` : '',
  ]);
}

function groupKey(event: UserResearchRawEvent): string {
  return firstNonEmpty([event.userId, event.email, event.sessionId, event.id]) || `unknown:${event.createdAt || isoNow()}`;
}

function toResearchEventRow(input: UserResearchEventInput): Record<string, unknown> {
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  return {
    session_id: trimText(input.sessionId, 80) || null,
    user_id: trimText(input.userId, 255) || null,
    email: trimText(input.email, 255) || null,
    channel: normalizeChannel(input.channel).toLowerCase(),
    event_name: trimText(input.eventName, 120) || 'observed_event',
    event_group: trimText(input.eventGroup, 120) || null,
    task_label: trimText(input.taskLabel, 240) || null,
    status: trimText(input.status || 'observed', 60) || 'observed',
    feedback_text: trimText(input.feedbackText, 1000) || null,
    evidence_url: trimText(input.evidenceUrl, 1000) || null,
    evidence_type: trimText(input.evidenceType, 80) || null,
    page_url: trimText(input.pageUrl, 1000) || null,
    route: trimText(input.route, 500) || null,
    operation_id: trimText(input.operationId, 200) || null,
    transaction_hash: trimText(input.transactionHash, 200) || null,
    stellar_network: normalizeResearchNetwork(input.stellarNetwork || process.env.STELLAR_NETWORK || process.env.NEXT_PUBLIC_STELLAR_NETWORK),
    metadata_json: metadata,
    dedupe_key: trimText(input.dedupeKey, 300) || null,
  };
}

async function safeSelect(table: string, select: string, mutate: (query: any) => any): Promise<{ rows: SupabaseRow[]; errorMessage?: string }> {
  try {
    const query = mutate(supabase.from(table).select(select));
    const { data, error } = await query;
    if (error) {
      const message = String(error.message || error);
      console.warn(`[user-research] skipping ${table}: ${message}`);
      return { rows: [], errorMessage: message };
    }
    return { rows: Array.isArray(data) ? data : [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[user-research] skipping ${table}: ${message}`);
    return { rows: [], errorMessage: message };
  }
}

function rowToResearchEvent(row: SupabaseRow): UserResearchRawEvent {
  return {
    id: String(row.id || ''),
    source: 'research_event',
    sessionId: String(row.session_id || ''),
    userId: String(row.user_id || ''),
    email: String(row.email || ''),
    channel: normalizeChannel(row.channel),
    eventName: String(row.event_name || ''),
    eventGroup: String(row.event_group || ''),
    taskLabel: String(row.task_label || ''),
    status: String(row.status || 'observed'),
    feedbackText: String(row.feedback_text || ''),
    evidenceUrl: String(row.evidence_url || ''),
    evidenceType: String(row.evidence_type || ''),
    pageUrl: String(row.page_url || ''),
    route: String(row.route || ''),
    operationId: String(row.operation_id || ''),
    transactionHash: String(row.transaction_hash || ''),
    stellarNetwork: normalizeResearchNetwork(row.stellar_network),
    createdAt: String(row.created_at || ''),
    metadata: row.metadata_json || {},
  };
}

function rowToPaymentEvent(row: SupabaseRow, fallbackNetwork = 'TESTNET'): UserResearchRawEvent {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: String(row.id || ''),
    source: 'payment_log',
    sessionId: String(row.session_id || ''),
    userId: String(row.user_id || ''),
    eventName: String(row.operation_type || 'payment'),
    eventGroup: 'Operação financeira',
    taskLabel: String(row.operation_type || 'pagamento'),
    status: String(row.status || ''),
    transactionHash: String(row.payment_hash || ''),
    stellarNetwork: normalizeResearchNetwork(row.stellar_network || fallbackNetwork),
    createdAt: String(row.completed_at || row.created_at || ''),
    metadata: {
      ...metadata,
      source_amount: row.source_amount,
      source_asset_code: row.source_asset_code,
      destination_amount: row.destination_amount,
      destination_asset_code: row.destination_asset_code,
      operation_type: row.operation_type,
    },
  };
}

function rowToMessageEvent(row: SupabaseRow, session?: SupabaseRow, fallbackNetwork = 'TESTNET'): UserResearchRawEvent {
  return {
    id: String(row.id || ''),
    source: 'agent_message',
    sessionId: String(row.session_id || ''),
    userId: String(session?.user_id || ''),
    email: String(session?.email || ''),
    channel: normalizeChannel(session?.session_source || session?.source || ''),
    eventName: row.role === 'user' ? 'user_prompt' : 'assistant_response',
    eventGroup: 'Conversa',
    status: 'observed',
    content: String(row.content || ''),
    role: String(row.role || ''),
    stellarNetwork: normalizeResearchNetwork(session?.stellar_network || fallbackNetwork),
    createdAt: String(row.created_at || ''),
  };
}

function rowToSessionEvent(row: SupabaseRow, fallbackNetwork = 'TESTNET'): UserResearchRawEvent {
  return {
    id: String(row.session_id || row.id || ''),
    source: 'agent_session',
    sessionId: String(row.session_id || ''),
    userId: String(row.user_id || ''),
    email: String(row.email || ''),
    channel: normalizeChannel(row.session_source || row.source || ''),
    eventName: 'session_observed',
    eventGroup: 'Sessão',
    status: 'observed',
    stellarNetwork: normalizeResearchNetwork(row.stellar_network || fallbackNetwork),
    createdAt: String(row.created_at || row.last_activity || row.updated_at || ''),
  };
}

export function buildResearchLogFromEvents(
  rawEvents: UserResearchRawEvent[],
  options: { mainnetOnly?: boolean; network?: string; limitUsers?: number; includeSuspectedTestUsers?: boolean } = {},
): UserResearchExport {
  const warnings: string[] = [];
  const networkFilter = normalizeResearchNetworkFilter(
    options.network,
    options.mainnetOnly === false ? 'ALL' : 'PUBLIC',
  );
  const mainnetOnly = networkFilter === 'PUBLIC';
  const normalizedEvents = rawEvents
    .map((event) => ({
      ...event,
      channel: normalizeChannel(event.channel),
      stellarNetwork: normalizeResearchNetwork(event.stellarNetwork),
      createdAt: event.createdAt || isoNow(),
    }))
    .filter((event) => matchesNetworkFilter(event.stellarNetwork, networkFilter));

  const excluded = normalizedEvents.filter((event) => {
    if (options.includeSuspectedTestUsers) return false;
    return isLikelySyntheticUser(event.userId) || isLikelySyntheticUser(event.email);
  });

  const usableEvents = normalizedEvents.filter((event) => {
    if (options.includeSuspectedTestUsers) return true;
    return !isLikelySyntheticUser(event.userId) && !isLikelySyntheticUser(event.email);
  });

  if (networkFilter !== 'ALL' && rawEvents.length > normalizedEvents.length) {
    warnings.push(`Eventos fora da rede ${networkFilter} foram removidos do export.`);
  }
  if (excluded.length > 0) {
    warnings.push(`${excluded.length} evento(s) com marcadores de teste/QA foram excluidos.`);
  }

  const grouped = new Map<string, UserResearchRawEvent[]>();
  for (const event of usableEvents) {
    const key = groupKey(event);
    const bucket = grouped.get(key) || [];
    bucket.push(event);
    grouped.set(key, bucket);
  }

  const entries = Array.from(grouped.entries())
    .map(([, events]) => {
      const sorted = events.sort((a, b) => parseDate(a.createdAt) - parseDate(b.createdAt));
      const first = sorted[0] || {};
      const last = sorted[sorted.length - 1] || first;
      const email = firstNonEmpty(sorted.map((event) => event.email));
      const userId = firstNonEmpty(sorted.map((event) => event.userId));
      const identifier = maskIdentifier(email || userId || first.sessionId);
      const feedback = firstNonEmpty(sorted.map((event) => event.feedbackText));
      const blockers = uniqueStrings(
        sorted
          .filter((event) => isBlockedStatus(event.status))
          .map((event) => event.feedbackText || event.content || event.taskLabel || event.eventName),
        4,
      );
      const prompts = uniqueStrings(
        sorted
          .filter((event) => event.source === 'agent_message' && event.role === 'user')
          .map((event) => event.content),
        4,
      );
      const productResponses = uniqueStrings(
        sorted
          .filter((event) => event.source === 'agent_message' && event.role === 'assistant')
          .map((event) => event.content),
        3,
      );
      const operations = uniqueStrings(
        sorted
          .filter((event) => event.source === 'payment_log' || event.operationId || event.transactionHash)
          .map((event) => evidenceLabel(event) || eventActionLabel(event)),
        5,
      );
      const explicitActions = uniqueStrings(
        sorted
          .filter((event) => event.source !== 'agent_message' || event.role === 'user')
          .map(eventActionLabel),
        4,
      );
      const evidence = firstNonEmpty(sorted.map(evidenceLabel));
      const channels = uniqueStrings(sorted.map((event) => event.channel || 'Web'), 3);
      const networks = uniqueStrings(sorted.map((event) => normalizeResearchNetwork(event.stellarNetwork)), 3);
      const sessionIds = uniqueStrings(sorted.map((event) => event.sessionId), 6);
      return {
        userLabel: '',
        userIdentifier: identifier,
        firstSeenAt: String(first.createdAt || ''),
        lastSeenAt: String(last.createdAt || ''),
        dateLabel: formatDateLabel(String(first.createdAt || '')),
        channel: channels.join(', ') || 'Web',
        whatDid: explicitActions.join('; ') || 'Sessão registrada',
        result: statusLabel(sorted),
        feedbackLiteral: feedback || 'Sem feedback literal registrado',
        evidence: evidence || operations[0] || 'Sem link/hash anexado',
        sessionIds,
        prompts,
        productResponses,
        blockers,
        operations,
        networks,
      };
    })
    .sort((a, b) => parseDate(a.firstSeenAt) - parseDate(b.firstSeenAt))
    .slice(0, options.limitUsers || 50)
    .map((entry, index) => ({
      ...entry,
      userLabel: `User ${String(index + 1).padStart(2, '0')}`,
    }));

  if (entries.length < 15) {
    warnings.push(`Apenas ${entries.length} usuario(s) reais encontrados. Nao complete com usuarios falsos.`);
  }

  return {
    generatedAt: isoNow(),
    mainnetOnly,
    networkFilter,
    realUserCount: entries.length,
    entries,
    rawEventCount: rawEvents.length,
    excludedSyntheticCount: excluded.length,
    warnings,
  };
}

export function researchLogToCsv(exportData: UserResearchExport): string {
  const headers = [
    'Usuario',
    'Data',
    'Canal',
    'O que fez',
    'Resultado',
    'Feedback literal',
    'Evidencia',
    'Identificador mascarado',
    'Sessoes',
    'Operacoes',
  ];
  const escape = (value: unknown) => {
    const text = String(value || '').replace(/\r?\n/g, ' ');
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = exportData.entries.map((entry) => [
    entry.userLabel,
    entry.dateLabel,
    entry.channel,
    entry.whatDid,
    entry.result,
    entry.feedbackLiteral,
    entry.evidence,
    entry.userIdentifier,
    entry.sessionIds.join(' | '),
    entry.operations.join(' | '),
  ]);
  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
}

export function researchLogToMarkdown(exportData: UserResearchExport): string {
  const lines: string[] = [];
  lines.push(`# TalkToStellar - log de usuarios reais (${exportData.networkFilter})`);
  lines.push('');
  lines.push(`Gerado em: ${exportData.generatedAt}`);
  lines.push(`Usuarios reais encontrados: ${exportData.realUserCount}`);
  lines.push(`Rede filtrada: ${exportData.networkFilter}`);
  lines.push('');
  if (exportData.warnings.length) {
    lines.push('## Avisos');
    for (const warning of exportData.warnings) lines.push(`- ${warning}`);
    lines.push('');
  }
  lines.push('## Tabela');
  lines.push('');
  lines.push('| Usuario | Data | Canal | O que fez | Resultado | Feedback literal | Evidencia |');
  lines.push('|---|---:|---|---|---|---|---|');
  for (const entry of exportData.entries) {
    lines.push(`| ${entry.userLabel} | ${entry.dateLabel} | ${entry.channel} | ${entry.whatDid} | ${entry.result} | ${entry.feedbackLiteral} | ${entry.evidence} |`);
  }
  lines.push('');
  lines.push('## Detalhes por usuario');
  for (const entry of exportData.entries) {
    lines.push('');
    lines.push(`### ${entry.userLabel} - ${entry.userIdentifier}`);
    lines.push(`- Data/canal: ${entry.dateLabel} / ${entry.channel}`);
    lines.push(`- O que fez: ${entry.whatDid}`);
    lines.push(`- Resultado: ${entry.result}`);
    lines.push(`- Feedback literal: ${entry.feedbackLiteral}`);
    lines.push(`- Evidencia: ${entry.evidence}`);
    if (entry.prompts.length) lines.push(`- Frases digitadas: ${entry.prompts.map((prompt) => `"${prompt}"`).join(' | ')}`);
    if (entry.productResponses.length) lines.push(`- O que o produto respondeu: ${entry.productResponses.join(' | ')}`);
    if (entry.blockers.length) lines.push(`- Onde travou/confundiu: ${entry.blockers.join(' | ')}`);
    if (entry.operations.length) lines.push(`- Operacoes/hash/recibos: ${entry.operations.join(' | ')}`);
  }
  lines.push('');
  return lines.join('\n');
}

function notionText(content: string) {
  return [{ type: 'text', text: { content: trimText(content, 1900) } }];
}

function notionParagraph(content: string) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: notionText(content) } };
}

function notionHeading(level: 1 | 2 | 3, content: string) {
  const type = `heading_${level}`;
  return { object: 'block', type, [type]: { rich_text: notionText(content) } };
}

function notionBullet(content: string) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: notionText(content) } };
}

function notionCode(content: string) {
  return {
    object: 'block',
    type: 'code',
    code: {
      language: 'markdown',
      rich_text: notionText(content),
    },
  };
}

export function researchLogToNotionBlocks(exportData: UserResearchExport): any[] {
  const table = researchLogToMarkdown({
    ...exportData,
    entries: exportData.entries.slice(0, 20),
  })
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .join('\n');
  const blocks: any[] = [
    notionHeading(1, `TalkToStellar - log ${exportData.networkFilter} (${formatDateLabel(exportData.generatedAt)})`),
    notionParagraph(`Usuarios reais encontrados: ${exportData.realUserCount}. Rede filtrada: ${exportData.networkFilter}.`),
  ];
  for (const warning of exportData.warnings) blocks.push(notionBullet(warning));
  blocks.push(notionHeading(2, 'Tabela resumida'));
  blocks.push(notionCode(table || 'Sem usuarios reais encontrados ainda.'));
  blocks.push(notionHeading(2, 'Detalhes por usuario'));
  for (const entry of exportData.entries.slice(0, 25)) {
    blocks.push(notionHeading(3, `${entry.userLabel} - ${entry.userIdentifier}`));
    blocks.push(notionBullet(`Data/canal: ${entry.dateLabel} / ${entry.channel}`));
    blocks.push(notionBullet(`O que fez: ${entry.whatDid}`));
    blocks.push(notionBullet(`Resultado: ${entry.result}`));
    blocks.push(notionBullet(`Feedback literal: ${entry.feedbackLiteral}`));
    blocks.push(notionBullet(`Evidencia: ${entry.evidence}`));
    if (entry.prompts.length) blocks.push(notionBullet(`Frases digitadas: ${entry.prompts.join(' | ')}`));
    if (entry.blockers.length) blocks.push(notionBullet(`Onde travou/confundiu: ${entry.blockers.join(' | ')}`));
    if (entry.operations.length) blocks.push(notionBullet(`Operacoes/hash/recibos: ${entry.operations.join(' | ')}`));
  }
  return blocks;
}

export class UserResearchEvidenceService {
  static async track(input: UserResearchEventInput): Promise<{ success: true; eventId?: string; duplicate?: boolean }> {
    const row = toResearchEventRow(input);
    const { data, error } = await supabase
      .from('user_research_events')
      .insert(row)
      .select('id')
      .maybeSingle();

    if (error) {
      if (String((error as any).code || '') === '23505') {
        return { success: true, duplicate: true };
      }
      throw new Error(error.message || 'Could not store user research event.');
    }

    return { success: true, eventId: String((data as any)?.id || '') || undefined };
  }

  static async buildMainnetLog(options: BuildResearchLogOptions = {}): Promise<UserResearchExport> {
    const since = trimText(options.since, 80);
    const until = trimText(options.until, 80);
    const networkFilter = normalizeResearchNetworkFilter(
      options.network,
      options.mainnetOnly === false ? 'ALL' : 'PUBLIC',
    );
    const fallbackNetwork = networkFilter === 'ALL'
      ? normalizeResearchNetwork(process.env.STELLAR_NETWORK || 'TESTNET')
      : networkFilter;
    const maxRawEvents = Math.max(50, Math.min(5000, options.maxRawEvents || 1500));

    const applyTime = (query: any) => {
      let next = query;
      if (since) next = next.gte('created_at', since);
      if (until) next = next.lte('created_at', until);
      return next.order('created_at', { ascending: true }).limit(maxRawEvents);
    };

    const researchResult = await safeSelect(
      'user_research_events',
      '*',
      (query) => {
        let next = applyTime(query);
        if (networkFilter !== 'ALL') next = next.in('stellar_network', networkFilter === 'PUBLIC' ? ['PUBLIC', 'MAINNET', 'public', 'mainnet'] : [networkFilter, networkFilter.toLowerCase()]);
        return next;
      },
    );
    const researchRows = researchResult.rows;

    const paymentResult = await safeSelect(
      'payment_logs',
      'id,session_id,user_id,status,operation_type,source_amount,source_asset_code,destination_amount,destination_asset_code,payment_hash,created_at,completed_at,metadata,stellar_network',
      (query) => {
        let next = query;
        if (since) next = next.gte('created_at', since);
        if (until) next = next.lte('created_at', until);
        if (networkFilter !== 'ALL') next = next.in('stellar_network', [networkFilter]);
        return next.order('created_at', { ascending: true }).limit(maxRawEvents);
      },
    );
    let paymentRows = paymentResult.rows;
    if (!paymentRows.length && /stellar_network/i.test(String(paymentResult.errorMessage || ''))) {
      const fallbackPaymentResult = await safeSelect(
        'payment_logs',
        'id,session_id,user_id,status,operation_type,source_amount,source_asset_code,destination_amount,destination_asset_code,payment_hash,created_at,completed_at,metadata',
        (query) => {
          let next = query;
          if (since) next = next.gte('created_at', since);
          if (until) next = next.lte('created_at', until);
          return next.order('created_at', { ascending: true }).limit(maxRawEvents);
        },
      );
      paymentRows = fallbackPaymentResult.rows.map((row) => ({ ...row, stellar_network: fallbackNetwork }));
    }

    const sessionIds = uniqueStrings(
      [...researchRows, ...paymentRows].map((row) => row.session_id),
      500,
    );

    const sessionResult = await safeSelect(
      'agent_sessions',
      'session_id,user_id,email,phone_number,stellar_network,created_at,last_activity,updated_at',
      (query) => {
        let next = query;
        if (sessionIds.length) next = next.in('session_id', sessionIds);
        else if (since) next = next.gte('created_at', since);
        if (networkFilter !== 'ALL') next = next.in('stellar_network', [networkFilter]);
        return next.order('created_at', { ascending: true }).limit(maxRawEvents);
      },
    );
    let sessionRows = sessionResult.rows;
    if (!sessionRows.length && /stellar_network/i.test(String(sessionResult.errorMessage || ''))) {
      const fallbackSessionResult = await safeSelect(
        'agent_sessions',
        'session_id,user_id,email,phone_number,created_at,last_activity,updated_at',
        (query) => {
          let next = query;
          if (sessionIds.length) next = next.in('session_id', sessionIds);
          else if (since) next = next.gte('created_at', since);
          return next.order('created_at', { ascending: true }).limit(maxRawEvents);
        },
      );
      sessionRows = fallbackSessionResult.rows.map((row) => ({ ...row, stellar_network: fallbackNetwork }));
    }

    const sessionById = new Map(sessionRows.map((row) => [String(row.session_id || ''), row]));

    const messageResult = sessionIds.length
      ? await safeSelect(
          'agent_messages',
          'id,session_id,role,content,created_at',
          (query) => query.in('session_id', sessionIds).order('created_at', { ascending: true }).limit(maxRawEvents),
        )
      : null;
    const messageRows = messageResult ? messageResult.rows : [];

    const rawEvents: UserResearchRawEvent[] = [
      ...researchRows.map(rowToResearchEvent),
      ...paymentRows.map((row) => rowToPaymentEvent(row, fallbackNetwork)),
      ...messageRows.map((row) => rowToMessageEvent(row, sessionById.get(String(row.session_id || '')), fallbackNetwork)),
      ...sessionRows.map((row) => rowToSessionEvent(row, fallbackNetwork)),
    ];

    return buildResearchLogFromEvents(rawEvents, {
      network: networkFilter,
      limitUsers: options.limitUsers,
      includeSuspectedTestUsers: options.includeSuspectedTestUsers,
    });
  }
}
