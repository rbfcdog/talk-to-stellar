import { supabase } from '../../config/supabase';
import { FinancialContextService } from './financial-context.service';
import ExternalService from './core/external.service';
import { StellarService } from './stellar.service';
import { getStellarService } from './core/stellar.service';

function normalizeKey(value: string): string {
  return String(value || '').trim();
}

function hasPublicKey(value: string): boolean {
  return /^G[A-Z2-7]{55}$/i.test(String(value || '').trim());
}

function normalizeHistoryAssetCode(value: unknown): string {
  const code = String(value || '').trim().toUpperCase();
  if (!code || code === 'NATIVE') return 'XLM';
  if (code === 'USD') return 'USDC';
  return code;
}

function operationAssetCode(operation: any, prefix = ''): string {
  const field = (name: string) => prefix ? `${prefix}_${name}` : name;
  const assetType = String(operation?.[field('asset_type')] || '').trim().toLowerCase();
  if (assetType === 'native') return 'XLM';
  return normalizeHistoryAssetCode(
    operation?.[field('asset_code')] ||
      operation?.asset_code ||
      operation?.selling_asset_code ||
      operation?.buying_asset_code ||
      operation?.asset_type
  );
}

function operationCounterpartyKey(operation: any, ownPublicKey: string): string {
  const from = normalizeKey(operation?.from || operation?.source_account || operation?.funder || operation?.source);
  const to = normalizeKey(operation?.to || operation?.account || operation?.into || operation?.trustor);
  if (to === ownPublicKey) return from;
  if (from === ownPublicKey) return to;
  return normalizeKey(operation?.account || operation?.source_account || operation?.from || operation?.to);
}

function operationDirection(operation: any, ownPublicKey: string): 'received' | 'sent' | 'related' {
  const from = normalizeKey(operation?.from || operation?.source_account || operation?.funder || operation?.source);
  const to = normalizeKey(operation?.to || operation?.account || operation?.into || operation?.trustor);
  if (to === ownPublicKey) return 'received';
  if (from === ownPublicKey || normalizeKey(operation?.source_account) === ownPublicKey) return 'sent';
  return 'related';
}

function operationAmount(operation: any): string | null {
  const raw =
    operation?.amount ||
    operation?.starting_balance ||
    operation?.source_amount ||
    operation?.amount_in ||
    operation?.amount_out ||
    '';
  return normalizeKey(raw) || null;
}

function appBaseUrl(): string {
  const base =
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.PAYMENT_CONFIRM_BASE ||
    'http://localhost:3000';
  return String(base || '').trim().replace(/\/$/, '');
}

function humanIdentifier(profile: {
  email?: string | null;
  phone_number?: string | null;
  cpf?: string | null;
  pix_key?: string | null;
}): string {
  const email = String(profile.email || '').trim().toLowerCase();
  if (email && !email.endsWith('@talktostellar')) return email;

  const phone = String(profile.phone_number || '').trim();
  if (phone) return phone;

  const cpf = String(profile.cpf || '').trim();
  if (cpf) return cpf;

  const pix = String(profile.pix_key || '').trim();
  if (pix && !pix.includes('@talktostellar')) return pix;

  return 'indisponível';
}

function missingOptionalTable(error: unknown, tableName: string): boolean {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return message.includes(tableName.toLowerCase()) ||
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('not found');
}

function receiptUrl(code: string): string {
  return `${appBaseUrl()}/receipt/${encodeURIComponent(code)}`;
}

function parseContext(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  const text = normalizeKey(value as string);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

function normalizeOperationStatus(value: unknown): string {
  const status = normalizeKey(value as string).toUpperCase();
  if (status === 'COMPLETED' || status === 'SUCCESS' || status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED' || status === 'ERROR') return 'failed';
  if (status === 'PROCESSING' || status === 'PENDING') return 'pending';
  return status ? status.toLowerCase() : 'pending';
}

type CounterpartyProfile = {
  public_key: string;
  name?: string | null;
  pix_key?: string | null;
  email?: string | null;
  phone_number?: string | null;
  cpf?: string | null;
  user_id?: string | null;
  username?: string | null;
  profile_url: string;
  short_profile_url: string;
};

type HistoryScope = {
  sessionIds: string[];
  userIds: string[];
  publicKeys: string[];
};

type HistoryFilter = {
  column: string;
  values: string[];
};

export class TransactionHistoryService {
  private static uniqueValues(values: unknown[]): string[] {
    return Array.from(
      new Set(values.map((value) => normalizeKey(value as string)).filter(Boolean))
    );
  }

  private static dateRange(month: number, year: number): { start: string; end: string } | null {
    if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12 || year < 2000) {
      return null;
    }

    return {
      start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)).toISOString(),
      end: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString(),
    };
  }

  private static missingOptionalColumn(error: unknown, column: string): boolean {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return message.includes(column.toLowerCase()) ||
      message.includes(`'${column.toLowerCase()}' column`) ||
      message.includes(`column ${column.toLowerCase()}`) ||
      message.includes('schema cache') ||
      message.includes('does not exist') ||
      message.includes('not found');
  }

  private static async runFilteredHistoryQuery(input: {
    table: string;
    select: string;
    filter: HistoryFilter;
    month: number;
    year: number;
    limit: number;
    orderColumn?: string;
  }): Promise<any[]> {
    const values = this.uniqueValues(input.filter.values);
    if (!values.length) return [];

    let query = supabase
      .from(input.table)
      .select(input.select);

    query = values.length === 1
      ? query.eq(input.filter.column, values[0])
      : query.in(input.filter.column, values);

    query = query
      .order(input.orderColumn || 'created_at', { ascending: false })
      .limit(input.limit);

    const range = this.dateRange(input.month, input.year);
    if (range) {
      query = query.gte(input.orderColumn || 'created_at', range.start).lt(input.orderColumn || 'created_at', range.end);
    }

    const { data, error } = await query;
    if (error) {
      if (
        missingOptionalTable(error, input.table) ||
        this.missingOptionalColumn(error, input.filter.column)
      ) {
        return [];
      }
      throw new Error(`Falha ao carregar ${input.table}: ${error.message}`);
    }

    return Array.isArray(data) ? data : data ? [data] : [];
  }

  private static async resolveAccountScope(ctx: { sessionId: string; userId: string; walletPublicKey?: string }): Promise<HistoryScope> {
    const sessionIds = new Set<string>(this.uniqueValues([ctx.sessionId]));
    const userIds = new Set<string>(this.uniqueValues([ctx.userId]));
    const publicKeys = new Set<string>(this.uniqueValues([ctx.walletPublicKey]).filter((value) => hasPublicKey(value)));
    const emails = new Set<string>();

    const addSessionRows = (rows: any[]) => {
      for (const row of rows || []) {
        const sessionId = normalizeKey(row?.session_id);
        const userId = normalizeKey(row?.user_id);
        const publicKey = normalizeKey(row?.public_key);
        const email = normalizeKey(row?.email).toLowerCase();
        if (sessionId) sessionIds.add(sessionId);
        if (userId) userIds.add(userId);
        if (hasPublicKey(publicKey)) publicKeys.add(publicKey);
        if (email) emails.add(email);
      }
    };

    const addWalletRows = (rows: any[]) => {
      for (const row of rows || []) {
        const sessionId = normalizeKey(row?.session_id);
        const publicKey = normalizeKey(row?.public_key);
        if (sessionId) sessionIds.add(sessionId);
        if (hasPublicKey(publicKey)) publicKeys.add(publicKey);
      }
    };

    const safeRows = async (build: () => any, label: string): Promise<any[]> => {
      try {
        const { data, error } = await build();
        if (error) {
          if (missingOptionalTable(error, label)) return [];
          return [];
        }
        return Array.isArray(data) ? data : data ? [data] : [];
      } catch {
        return [];
      }
    };

    if (ctx.userId) {
      addSessionRows(await safeRows(
        () => supabase
          .from('agent_sessions')
          .select('session_id, user_id, public_key, email')
          .eq('user_id', ctx.userId)
          .order('updated_at', { ascending: false })
          .limit(100),
        'agent_sessions'
      ));
    }

    if (sessionIds.size) {
      addWalletRows(await safeRows(
        () => supabase
          .from('wallets')
          .select('public_key, session_id')
          .in('session_id', Array.from(sessionIds))
          .limit(100),
        'wallets'
      ));
    }

    if (publicKeys.size) {
      addSessionRows(await safeRows(
        () => supabase
          .from('agent_sessions')
          .select('session_id, user_id, public_key, email')
          .in('public_key', Array.from(publicKeys))
          .order('updated_at', { ascending: false })
          .limit(100),
        'agent_sessions'
      ));

      addWalletRows(await safeRows(
        () => supabase
          .from('wallets')
          .select('public_key, session_id')
          .in('public_key', Array.from(publicKeys))
          .limit(100),
        'wallets'
      ));
    }

    if (emails.size) {
      addSessionRows(await safeRows(
        () => supabase
          .from('agent_sessions')
          .select('session_id, user_id, public_key, email')
          .in('email', Array.from(emails))
          .order('updated_at', { ascending: false })
          .limit(100),
        'agent_sessions'
      ));
    }

    return {
      sessionIds: this.uniqueValues(Array.from(sessionIds)),
      userIds: this.uniqueValues(Array.from(userIds)),
      publicKeys: this.uniqueValues(Array.from(publicKeys)).filter((value) => hasPublicKey(value)),
    };
  }

  private static async listNetworkOperationRows(input: {
    publicKey?: string;
    month: number;
    year: number;
    limit: number;
  }): Promise<any[]> {
    const publicKey = normalizeKey(input.publicKey || '');
    if (!hasPublicKey(publicKey)) return [];

    try {
      const networkLimit = Math.min(Math.max(Number(input.limit || 60), 1), 200);
      const rows = await getStellarService().getOperationHistory(publicKey, networkLimit);
      if (!Number.isFinite(input.month) || !Number.isFinite(input.year) || input.month < 1 || input.month > 12 || input.year < 2000) {
        return rows;
      }

      const start = Date.UTC(input.year, input.month - 1, 1, 0, 0, 0, 0);
      const end = Date.UTC(input.year, input.month, 1, 0, 0, 0, 0);
      return rows.filter((row: any) => {
        const timestamp = Date.parse(row?.created_at || '');
        return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
      });
    } catch {
      return [];
    }
  }

  private static async listNetworkOperationRowsForScope(input: {
    publicKeys: string[];
    month: number;
    year: number;
    limit: number;
  }): Promise<any[]> {
    const byId = new Map<string, any>();
    for (const publicKey of this.uniqueValues(input.publicKeys).filter((value) => hasPublicKey(value))) {
      const rows = await this.listNetworkOperationRows({
        publicKey,
        month: input.month,
        year: input.year,
        limit: input.limit,
      });
      for (const row of rows || []) {
        const key = normalizeKey(row?.transaction_hash || row?.id || row?.paging_token || row?.created_at);
        if (!key || byId.has(key)) continue;
        byId.set(key, row);
      }
    }
    return Array.from(byId.values());
  }

  private static async listPaymentRows(input: {
    scope: HistoryScope;
    month: number;
    year: number;
    limit: number;
  }): Promise<any[]> {
    const filters: HistoryFilter[] = [
      { column: 'user_id', values: input.scope.userIds },
      { column: 'session_id', values: input.scope.sessionIds },
      { column: 'source_public_key', values: input.scope.publicKeys },
      { column: 'destination_public_key', values: input.scope.publicKeys },
    ].filter((item) => item.values.length);
    const byId = new Map<string, any>();

    for (const filter of filters) {
      const rows = await this.runFilteredHistoryQuery({
        table: 'payment_logs',
        select: 'id, payment_hash, status, operation_type, source_amount, source_asset_code, destination_amount, destination_asset_code, destination_public_key, error_message, memo, metadata, created_at, completed_at',
        filter,
        month: input.month,
        year: input.year,
        limit: input.limit,
      });

      for (const row of rows || []) {
        const id =
          normalizeKey(row?.payment_hash) ||
          normalizeKey(row?.id) ||
          `${filter.column}:${normalizeKey(row?.created_at)}:${normalizeKey(row?.source_amount)}:${normalizeKey(row?.destination_amount)}`;
        if (!id || byId.has(id)) continue;
        byId.set(id, row);
      }
    }

    return Array.from(byId.values());
  }

  private static async listReceiptRows(input: {
    scope: HistoryScope;
    month: number;
    year: number;
    limit: number;
  }): Promise<any[]> {
    const filters: HistoryFilter[] = [
      { column: 'session_id', values: input.scope.sessionIds },
      { column: 'user_id', values: input.scope.userIds },
    ].filter((item) => item.values.length);
    const byCode = new Map<string, any>();

    for (const filter of filters) {
      const data = await this.runFilteredHistoryQuery({
        table: 'receipt_images',
        select: 'code, operation_id, tx_hash, session_id, user_id, receipt_type, metadata, created_at',
        filter,
        month: input.month,
        year: input.year,
        limit: input.limit,
      });

      for (const row of data || []) {
        const code = normalizeKey((row as any)?.code);
        if (!code || byCode.has(code)) continue;
        byCode.set(code, row);
      }
    }

    return Array.from(byCode.values());
  }

  private static async listOperationRows(input: {
    scope: HistoryScope;
    month: number;
    year: number;
    limit: number;
  }): Promise<any[]> {
    const filters: HistoryFilter[] = [
      { column: 'user_id', values: input.scope.userIds },
      { column: 'source_session_id', values: input.scope.sessionIds },
      { column: 'destination_session_id', values: input.scope.sessionIds },
      { column: 'source_public_key', values: input.scope.publicKeys },
      { column: 'destination_key', values: input.scope.publicKeys },
    ].filter((item) => item.values.length);
    const byId = new Map<string, any>();

    for (const filter of filters) {
      const data = await this.runFilteredHistoryQuery({
        table: 'operations',
        select: '*',
        filter,
        month: input.month,
        year: input.year,
        limit: input.limit,
      });

      for (const row of data || []) {
        const id = normalizeKey((row as any)?.id) || `${filter.column}:${normalizeKey((row as any)?.created_at)}`;
        if (!id || byId.has(id)) continue;
        byId.set(id, row);
      }
    }

    return Array.from(byId.values());
  }

  private static ownPublicKeyForOperation(operation: any, publicKeys: string[]): string {
    const ownKeys = this.uniqueValues(publicKeys).filter((value) => hasPublicKey(value));
    if (!ownKeys.length) return '';
    const candidates = [
      normalizeKey(operation?.to || operation?.account || operation?.into || operation?.trustor),
      normalizeKey(operation?.from || operation?.source_account || operation?.funder || operation?.source),
      normalizeKey(operation?.source_account),
    ];
    return ownKeys.find((key) => candidates.includes(key)) || ownKeys[0];
  }

  private static async resolveCounterpartyProfiles(publicKeys: string[], sessionId: string, userId: string): Promise<Map<string, CounterpartyProfile>> {
    const keys = Array.from(new Set(publicKeys.map((value) => normalizeKey(value)).filter((value) => hasPublicKey(value))));
    const result = new Map<string, CounterpartyProfile>();
    if (!keys.length) return result;

    const { data: wallets, error: walletError } = await supabase
      .from('wallets')
      .select('public_key, session_id, name, pix_key')
      .in('public_key', keys);

    if (walletError) {
      throw new Error(`Falha ao carregar carteiras dos contatos: ${walletError.message}`);
    }

    const walletByKey = new Map<string, any>();
    const sessionIds = new Set<string>();

    for (const row of wallets || []) {
      const key = normalizeKey((row as any)?.public_key);
      if (!key) continue;
      walletByKey.set(key, row);
      const sid = normalizeKey((row as any)?.session_id);
      if (sid) sessionIds.add(sid);
    }

    const sessionIdList = Array.from(sessionIds);
    const sessionById = new Map<string, any>();
    if (sessionIdList.length) {
      const { data: sessions, error: sessionError } = await supabase
        .from('agent_sessions')
        .select('session_id, user_id, email, phone_number')
        .in('session_id', sessionIdList);
      if (sessionError) {
        throw new Error(`Falha ao carregar sessões dos contatos: ${sessionError.message}`);
      }
      for (const row of sessions || []) {
        const sid = normalizeKey((row as any)?.session_id);
        if (!sid) continue;
        sessionById.set(sid, row);
      }
    }

    const externalBySession = new Map<string, any[]>();
    if (sessionIdList.length) {
      const { data: externalRows, error: externalError } = await supabase
        .from('external_accounts')
        .select('session_id, data, created_at')
        .in('session_id', sessionIdList)
        .order('created_at', { ascending: false });

      if (externalError) {
        const message = String(externalError.message || '').toLowerCase();
        if (!message.includes('external_accounts') && !message.includes('schema cache') && !message.includes('does not exist')) {
          throw new Error(`Falha ao carregar dados externos dos contatos: ${externalError.message}`);
        }
      } else {
        for (const row of externalRows || []) {
          const sid = normalizeKey((row as any)?.session_id);
          if (!sid) continue;
          const items = externalBySession.get(sid) || [];
          items.push((row as any)?.data || {});
          externalBySession.set(sid, items);
        }
      }
    }

    const userIds = Array.from(
      new Set(
        Array.from(sessionById.values())
          .map((row: any) => normalizeKey(row?.user_id))
          .filter(Boolean)
      )
    );

    const usernameByUserId = new Map<string, string>();
    if (userIds.length) {
      const { data: profiles, error: profileError } = await supabase
        .from('global_profiles')
        .select('user_id, username')
        .in('user_id', userIds);
      if (!profileError) {
        for (const row of profiles || []) {
          const uid = normalizeKey((row as any)?.user_id);
          const username = normalizeKey((row as any)?.username);
          if (uid && username) usernameByUserId.set(uid, username);
        }
      }
    }

    const externalService = new ExternalService(supabase as any);
    const shortUrlByLongUrl = new Map<string, string>();

    for (const key of keys) {
      const wallet = walletByKey.get(key) || {};
      const sid = normalizeKey(wallet?.session_id);
      const session = sid ? (sessionById.get(sid) || {}) : {};
      const externalPayloads = sid ? (externalBySession.get(sid) || []) : [];

      const profile: CounterpartyProfile = {
        public_key: key,
        name: normalizeKey(wallet?.name) || null,
        pix_key: normalizeKey(wallet?.pix_key) || null,
        email: normalizeKey(session?.email) || null,
        phone_number: normalizeKey(session?.phone_number) || null,
        cpf: null,
        user_id: normalizeKey(session?.user_id) || null,
        username: null,
        profile_url: '',
        short_profile_url: '',
      };

      for (const data of externalPayloads) {
        if (!profile.email && data?.email) profile.email = normalizeKey(data.email);
        if (!profile.phone_number && data?.phone_number) profile.phone_number = normalizeKey(data.phone_number);
        if (!profile.cpf && data?.cpf) profile.cpf = normalizeKey(data.cpf);
      }

      if (profile.user_id) {
        profile.username = usernameByUserId.get(profile.user_id) || null;
      }

      const longUrl = profile.username
        ? `${appBaseUrl()}/u/${encodeURIComponent(profile.username)}`
        : `${appBaseUrl()}/profile/${encodeURIComponent(key)}`;
      profile.profile_url = longUrl;

      if (shortUrlByLongUrl.has(longUrl)) {
        profile.short_profile_url = shortUrlByLongUrl.get(longUrl) || longUrl;
      } else {
        const shortUrl = await externalService.shortenPublicUrl({
          url: longUrl,
          purpose: 'wallet_profile',
          sessionId,
          userId,
          expiresInHours: 24 * 7,
        });
        const normalizedShort = normalizeKey(shortUrl) || longUrl;
        shortUrlByLongUrl.set(longUrl, normalizedShort);
        profile.short_profile_url = normalizedShort;
      }

      result.set(key, profile);
    }

    return result;
  }

  static async listTransactions(input: {
    sessionId?: string;
    userId?: string;
    month?: number;
    year?: number;
    limit?: number;
  }) {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    const limit = Math.min(Math.max(Number(input.limit || 60), 1), 500);
    const month = Number(input.month || 0);
    const year = Number(input.year || 0);
    const scope = await this.resolveAccountScope(ctx);

    const rows = await this.listPaymentRows({
      scope,
      month,
      year,
      limit,
    });
    const receiptRows = await this.listReceiptRows({
      scope,
      month,
      year,
      limit,
    });
    const operationRows = await this.listOperationRows({
      scope,
      month,
      year,
      limit,
    });
    const networkRows = await this.listNetworkOperationRowsForScope({
      publicKeys: scope.publicKeys,
      month,
      year,
      limit,
    });

    const destinationKeys = [
      ...(rows || []).map((row: any) => normalizeKey(row?.destination_public_key)),
      ...receiptRows.map((row: any) => {
        const metadata = (row?.metadata || {}) as Record<string, any>;
        return normalizeKey(metadata.destinationPublicKey || metadata.destination_public_key || metadata.counterpartyPublicKey || metadata.counterparty_public_key || metadata.counterpartyKey);
      }),
      ...operationRows.map((row: any) => normalizeKey(row?.destination_key || row?.destination_public_key || row?.counterparty_public_key || row?.source_public_key)),
      ...networkRows.map((row: any) => operationCounterpartyKey(row, this.ownPublicKeyForOperation(row, scope.publicKeys))),
    ];
    const profiles = await this.resolveCounterpartyProfiles(destinationKeys, ctx.sessionId, ctx.userId);

    const paymentTransactions = (rows || []).map((row: any) => {
      const metadata = (row?.metadata || {}) as Record<string, any>;
      const key = normalizeKey(row?.destination_public_key);
      const profile = profiles.get(key);
      const contextMessage = normalizeKey(row?.memo || metadata?.memo || metadata?.transaction_context_message || '');
      const displayName =
        normalizeKey(metadata?.destination_name || metadata?.destination_contact?.contact_name || profile?.name || '') ||
        'Destinatário';
      const identifier = humanIdentifier({
        email: profile?.email,
        phone_number: profile?.phone_number,
        cpf: profile?.cpf,
        pix_key: profile?.pix_key,
      });

      return {
        id: row?.id,
        payment_hash: row?.payment_hash || null,
        status: row?.status || 'pending',
        operation_type: row?.operation_type || null,
        source_amount: row?.source_amount || null,
        source_asset_code: row?.source_asset_code || null,
        destination_amount: row?.destination_amount || null,
        destination_asset_code: row?.destination_asset_code || null,
        destination_public_key: key || null,
        error_message: row?.error_message || null,
        context_message: contextMessage || null,
        created_at: row?.created_at || null,
        completed_at: row?.completed_at || null,
        counterparty: {
          name: displayName,
          identifier,
          public_key: key || null,
          user_id: profile?.user_id || null,
          profile_url: profile?.profile_url || null,
          short_profile_url: profile?.short_profile_url || profile?.profile_url || null,
        },
      };
    });

    const loggedHashes = new Set(
      paymentTransactions
        .map((item: any) => normalizeKey(item.payment_hash || ''))
        .filter(Boolean)
    );

    const receiptTransactions = receiptRows
      .filter((row: any) => {
        const hash = normalizeKey(row?.tx_hash);
        return !hash || !loggedHashes.has(hash);
      })
      .map((row: any) => {
        const metadata = (row?.metadata || {}) as Record<string, any>;
        const key = normalizeKey(metadata.destinationPublicKey || metadata.destination_public_key || metadata.counterpartyPublicKey || metadata.counterparty_public_key || metadata.counterpartyKey);
        const profile = profiles.get(key);
        const counterpartyLabel = normalizeKey(metadata.counterpartyLabel || metadata.counterparty_name || metadata.recipient_name || profile?.name || '');
        const rawIdentifier = normalizeKey(metadata.counterpartyKey || metadata.counterparty_key || '');
        const identifier = rawIdentifier && !hasPublicKey(rawIdentifier)
          ? rawIdentifier
          : humanIdentifier({
              email: profile?.email,
              phone_number: profile?.phone_number,
              cpf: profile?.cpf,
              pix_key: profile?.pix_key,
            });
        const code = normalizeKey(row?.code);
        const url = code ? receiptUrl(code) : '';

        return {
          id: code ? `receipt:${code}` : `receipt:${row?.operation_id || row?.tx_hash || row?.created_at}`,
          payment_hash: row?.tx_hash || null,
          receipt_url: url || null,
          status: 'success',
          operation_type: row?.receipt_type || 'receipt',
          source_amount: metadata.sourceAmount || metadata.source_amount || null,
          source_asset_code: metadata.sourceAssetCode || metadata.source_asset_code || null,
          destination_amount: metadata.destinationAmount || metadata.destination_amount || null,
          destination_asset_code: metadata.destinationAssetCode || metadata.destination_asset_code || null,
          destination_public_key: hasPublicKey(key) ? key : null,
          error_message: null,
          context_message: normalizeKey(metadata.contextMessage || metadata.context_message || ''),
          created_at: row?.created_at || null,
          completed_at: metadata.completedAt || metadata.completed_at || row?.created_at || null,
          counterparty: {
            name: counterpartyLabel || (row?.receipt_type === 'payment_received' ? 'TalkToStellar' : 'Destinatário'),
            identifier: identifier || (url ? 'comprovante disponível' : 'indisponível'),
            public_key: hasPublicKey(key) ? key : null,
            user_id: profile?.user_id || null,
            profile_url: profile?.profile_url || null,
            short_profile_url: profile?.short_profile_url || profile?.profile_url || null,
          },
        };
      });

    const loggedOperationHashes = new Set(
      [...paymentTransactions, ...receiptTransactions]
        .map((item: any) => normalizeKey(item.payment_hash || ''))
        .filter(Boolean)
    );
    const operationTransactions = operationRows
      .filter((row: any) => {
        const hash = normalizeKey(row?.stellar_transaction_hash || row?.payment_hash || '');
        return !hash || !loggedOperationHashes.has(hash);
      })
      .map((row: any) => {
        const context = parseContext(row?.context);
        const type = normalizeKey(row?.type || context.operation_type || 'operation');
        const typeUpper = type.toUpperCase();
        const hash = normalizeKey(row?.stellar_transaction_hash || context.stellar_transaction_hash || context.tx_hash || '');
        const amount = normalizeKey(
          row?.amount ??
          context.amount ??
          context.final_amount ??
          context.destination_amount ??
          context.source_amount ??
          context.target_brl ??
          ''
        );
        const assetCode = normalizeHistoryAssetCode(
          row?.asset_code ||
          context.final_asset_code ||
          context.final_asset ||
          context.destination_asset_code ||
          context.source_asset_code ||
          context.asset_code
        );
        const key = normalizeKey(row?.destination_key || context.destinationPublicKey || context.destination_public_key || context.counterpartyPublicKey || context.counterparty_public_key || '');
        const sourceKey = normalizeKey(row?.source_public_key || context.source_public_key || '');
        const counterpartyKey = hasPublicKey(key) ? key : sourceKey;
        const profile = profiles.get(counterpartyKey);
        const label = normalizeKey(context.counterpartyLabel || context.counterparty_label || context.destination_name || context.bank_label || profile?.name || '');
        const identifier = key && !hasPublicKey(key)
          ? key
          : humanIdentifier({
              email: profile?.email,
              phone_number: profile?.phone_number,
              cpf: profile?.cpf,
              pix_key: profile?.pix_key,
            });
        const isInbound = /ONRAMP|RECEIVE|RECEIVED|CLAIM|WITHDRAW/.test(typeUpper) && !/OFFRAMP|PIX_OUT/.test(typeUpper);
        const isOutbound = /OFFRAMP|SEND|PAYMENT|PIX_OUT|DEPOSIT/.test(typeUpper);
        const receipt = normalizeKey(context.receipt_url || context.receiptUrl || '');

        return {
          id: `operation:${row?.id || hash || row?.created_at}`,
          payment_hash: hash || null,
          receipt_url: receipt || null,
          status: normalizeOperationStatus(row?.status),
          operation_type: type || null,
          source_amount: isOutbound ? amount || null : null,
          source_asset_code: isOutbound ? assetCode : null,
          destination_amount: isInbound || !isOutbound ? amount || null : null,
          destination_asset_code: isInbound || !isOutbound ? assetCode : null,
          destination_public_key: hasPublicKey(counterpartyKey) ? counterpartyKey : null,
          error_message: normalizeKey(context.error || context.error_message || ''),
          context_message: normalizeKey(context.context_message || context.memo || context.description || ''),
          created_at: row?.created_at || null,
          completed_at: row?.updated_at || row?.created_at || null,
          counterparty: {
            name: label || (typeUpper.includes('PIX') ? 'PIX' : 'TalkToStellar'),
            identifier: identifier || 'indisponível',
            public_key: hasPublicKey(counterpartyKey) ? counterpartyKey : null,
            user_id: profile?.user_id || null,
            profile_url: profile?.profile_url || null,
            short_profile_url: profile?.short_profile_url || profile?.profile_url || null,
          },
        };
      });

    const knownNetworkIds = new Set(
      [...paymentTransactions, ...receiptTransactions, ...operationTransactions]
        .flatMap((item: any) => [normalizeKey(item.payment_hash || ''), normalizeKey(item.id || '')])
        .filter(Boolean)
    );
    const networkTransactions = networkRows
      .filter((row: any) => {
        const hash = normalizeKey(row?.transaction_hash || row?.transaction_hash_attr || '');
        const id = normalizeKey(row?.id || row?.paging_token || '');
        return (!hash || !knownNetworkIds.has(hash)) && (!id || !knownNetworkIds.has(id));
      })
      .map((row: any) => {
        const ownPublicKey = this.ownPublicKeyForOperation(row, scope.publicKeys);
        const direction = operationDirection(row, ownPublicKey);
        const counterpartyKey = operationCounterpartyKey(row, ownPublicKey);
        const profile = profiles.get(counterpartyKey);
        const amount = operationAmount(row);
        const assetCode = operationAssetCode(row);
        const type = normalizeKey(row?.type || 'stellar_operation');
        const operationType =
          direction === 'received' ? `${type}_received` :
          direction === 'sent' ? `${type}_sent` :
          type || 'stellar_operation';
        const displayName = normalizeKey(profile?.name || '');
        const identifier = humanIdentifier({
          email: profile?.email,
          phone_number: profile?.phone_number,
          cpf: profile?.cpf,
          pix_key: profile?.pix_key,
        });

        return {
          id: `stellar:${row?.id || row?.paging_token || row?.transaction_hash || row?.created_at}`,
          payment_hash: row?.transaction_hash || null,
          receipt_url: null,
          status: 'success',
          operation_type: operationType,
          source_amount: direction === 'sent' || direction === 'related' ? amount : null,
          source_asset_code: direction === 'sent' || direction === 'related' ? assetCode : null,
          destination_amount: direction === 'received' ? amount : null,
          destination_asset_code: direction === 'received' ? assetCode : null,
          destination_public_key: hasPublicKey(counterpartyKey) ? counterpartyKey : null,
          error_message: null,
          context_message: null,
          created_at: row?.created_at || null,
          completed_at: row?.created_at || null,
          counterparty: {
            name: displayName || 'Destinatário',
            identifier,
            public_key: hasPublicKey(counterpartyKey) ? counterpartyKey : null,
            user_id: profile?.user_id || null,
            profile_url: profile?.profile_url || null,
            short_profile_url: profile?.short_profile_url || profile?.profile_url || null,
          },
        };
      });

    const transactions = [...paymentTransactions, ...receiptTransactions, ...operationTransactions, ...networkTransactions]
      .sort((a: any, b: any) => {
        const aTime = Date.parse(a.completed_at || a.created_at || '');
        const bTime = Date.parse(b.completed_at || b.created_at || '');
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })
      .slice(0, limit);

    return {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      count: transactions.length,
      transactions,
    };
  }

  static async getWalletProfile(input: { sessionId?: string; userId?: string; publicKey: string }) {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    const publicKey = normalizeKey(input.publicKey);
    if (!hasPublicKey(publicKey)) {
      throw new Error('Chave pública inválida.');
    }

    const profiles = await this.resolveCounterpartyProfiles([publicKey], ctx.sessionId, ctx.userId);
    const profile = profiles.get(publicKey) || {
      public_key: publicKey,
      name: null,
      pix_key: null,
      email: null,
      phone_number: null,
      cpf: null,
      user_id: null,
      username: null,
      profile_url: `${appBaseUrl()}/profile/${encodeURIComponent(publicKey)}`,
      short_profile_url: `${appBaseUrl()}/profile/${encodeURIComponent(publicKey)}`,
    };

    let balances: any[] = [];
    try {
      balances = await StellarService.getAccountBalance(publicKey);
    } catch {
      balances = [];
    }

    const { data: recentRows, error: recentError } = await supabase
      .from('payment_logs')
      .select('id, destination_amount, destination_asset_code, status, created_at')
      .eq('destination_public_key', publicKey)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentError) {
      throw new Error(`Falha ao carregar histórico da carteira: ${recentError.message}`);
    }

    const totalReceived = (recentRows || []).length;
    const lastReceivedAt = recentRows?.[0]?.created_at || null;

    return {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      profile: {
        ...profile,
        identifier: humanIdentifier(profile),
      },
      balances: balances || [],
      stats: {
        total_received_operations: totalReceived,
        last_received_at: lastReceivedAt,
      },
    };
  }
}
