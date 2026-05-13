import { supabase } from '../../config/supabase';
import { FinancialContextService, trackFinancialEvent } from './financial-context.service';

function slugify(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function profileBaseUrl(): string {
  const base = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  return base.replace(/\/$/, '');
}

async function resolveDestinationByUserId(userId: string): Promise<{
  destination_public_key: string | null;
  destination_identifier: string | null;
}> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return { destination_public_key: null, destination_identifier: null };
  }

  const { data: latestSession } = await supabase
    .from('agent_sessions')
    .select('session_id, email, phone_number, pix_key')
    .eq('user_id', normalizedUserId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sessionId = String((latestSession as any)?.session_id || '').trim();
  if (!sessionId) {
    return { destination_public_key: null, destination_identifier: null };
  }

  const { data: wallet } = await supabase
    .from('wallets')
    .select('public_key')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  const email = String((latestSession as any)?.email || '').trim().toLowerCase();
  const phone = String((latestSession as any)?.phone_number || '').replace(/\D+/g, '');
  const pix = String((latestSession as any)?.pix_key || '').trim().toLowerCase();
  const destinationIdentifier =
    (email && !email.endsWith('@talktostellar') ? email : '') ||
    phone ||
    (pix && !pix.endsWith('@talktostellar') ? pix : '') ||
    null;

  return {
    destination_public_key: String((wallet as any)?.public_key || '').trim() || null,
    destination_identifier: destinationIdentifier,
  };
}

export class GlobalProfileService {
  static async ensureForUser(input: {
    userId: string;
    displayName?: string;
    usernameHint?: string;
    bio?: string;
  }): Promise<Record<string, unknown>> {
    return await this.getOrCreate({
      userId: input.userId,
      displayName: input.displayName,
      usernameHint: input.usernameHint,
      bio: input.bio,
    });
  }

  static async getOrCreate(input: {
    sessionId?: string;
    userId?: string;
    usernameHint?: string;
    displayName?: string;
    bio?: string;
  }): Promise<Record<string, unknown>> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });

    const { data: existing } = await supabase
      .from('global_profiles')
      .select('*')
      .eq('user_id', ctx.userId)
      .maybeSingle();

    if (existing?.username) {
      const link = `${profileBaseUrl()}/u/${existing.username}`;
      return {
        ...existing,
        public_link: link,
        qr_value: link,
        qr_url: `https://quickchart.io/qr?text=${encodeURIComponent(link)}&size=280`,
      };
    }

    const baseUsername = slugify(input.usernameHint || input.displayName || ctx.userId || 'global-user') || 'global-user';
    let username = baseUsername;
    let suffix = 1;

    while (true) {
      const { data: conflict } = await supabase
        .from('global_profiles')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      if (!conflict) break;
      suffix += 1;
      username = `${baseUsername}-${suffix}`;
    }

    const { data: created, error } = await supabase
      .from('global_profiles')
      .insert({
        user_id: ctx.userId,
        username,
        display_name: input.displayName || ctx.userId,
        avatar_url: null,
        bio: input.bio || 'Conta global para receber pagamentos internacionais.',
        default_currency: 'USD',
        accepted_currencies: ['USD', 'BRL'],
        is_public: true,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Falha ao criar perfil global: ${error.message}`);
    }

    await trackFinancialEvent('global_profile_created', {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      profile_id: created.id,
      username,
    });

    const link = `${profileBaseUrl()}/u/${username}`;
    return {
      ...created,
      public_link: link,
      qr_value: link,
      qr_url: `https://quickchart.io/qr?text=${encodeURIComponent(link)}&size=280`,
    };
  }

  static async getPublicProfile(username: string): Promise<Record<string, unknown> | null> {
    const normalized = slugify(username);
    if (!normalized) return null;

    const { data, error } = await supabase
      .from('global_profiles')
      .select('*')
      .eq('username', normalized)
      .eq('is_public', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Falha ao carregar perfil público: ${error.message}`);
    }

    if (!data) return null;

    await trackFinancialEvent('global_profile_viewed', {
      profile_id: data.id,
      user_id: data.user_id,
      username: data.username,
    });

    const link = `${profileBaseUrl()}/u/${normalized}`;
    const destination = await resolveDestinationByUserId(String((data as any)?.user_id || ''));
    return {
      ...data,
      public_link: link,
      qr_value: link,
      qr_url: `https://quickchart.io/qr?text=${encodeURIComponent(link)}&size=280`,
      destination_public_key: destination.destination_public_key,
      destination_identifier: destination.destination_identifier,
    };
  }
}
