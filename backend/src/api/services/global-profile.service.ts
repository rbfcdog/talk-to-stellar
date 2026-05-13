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

export class GlobalProfileService {
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
        accepted_currencies: ['USD', 'BRL', 'EUR'],
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
    return {
      ...data,
      public_link: link,
      qr_value: link,
      qr_url: `https://quickchart.io/qr?text=${encodeURIComponent(link)}&size=280`,
    };
  }
}
