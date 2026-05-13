import { supabase } from '../../config/supabase';
import { FinancialContextService } from './financial-context.service';
import ExternalService from '../../services/external.service';
import { StellarService } from './stellar.service';

function normalizeKey(value: string): string {
  return String(value || '').trim();
}

function hasPublicKey(value: string): boolean {
  return /^G[A-Z2-7]{55}$/i.test(String(value || '').trim());
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

export class TransactionHistoryService {
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
    const limit = Math.min(Math.max(Number(input.limit || 60), 1), 200);
    const month = Number(input.month || 0);
    const year = Number(input.year || 0);

    let query = supabase
      .from('payment_logs')
      .select('id, payment_hash, status, operation_type, source_amount, source_asset_code, destination_amount, destination_asset_code, destination_public_key, error_message, memo, metadata, created_at, completed_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (Number.isFinite(month) && Number.isFinite(year) && month >= 1 && month <= 12 && year >= 2000) {
      const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)).toISOString();
      const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString();
      query = query.gte('created_at', start).lt('created_at', end);
    }

    const { data: rows, error } = await query;
    if (error) {
      throw new Error(`Falha ao carregar histórico de pagamentos: ${error.message}`);
    }

    const destinationKeys = (rows || []).map((row: any) => normalizeKey(row?.destination_public_key));
    const profiles = await this.resolveCounterpartyProfiles(destinationKeys, ctx.sessionId, ctx.userId);

    const transactions = (rows || []).map((row: any) => {
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

