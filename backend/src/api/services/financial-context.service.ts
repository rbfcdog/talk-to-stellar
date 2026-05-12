import { supabase } from '../../config/supabase';

export type FinancialContext = {
  sessionId: string;
  userId: string;
  walletPublicKey?: string;
};

export class FinancialContextService {
  static async resolve(input: { sessionId?: string; userId?: string }): Promise<FinancialContext> {
    const sessionId = String(input.sessionId || '').trim();
    const explicitUserId = String(input.userId || '').trim();

    if (!sessionId && !explicitUserId) {
      throw new Error('session_id ou user_id é obrigatório.');
    }

    if (sessionId) {
      const { data: session, error: sessionError } = await supabase
        .from('agent_sessions')
        .select('session_id, user_id, public_key')
        .eq('session_id', sessionId)
        .maybeSingle();

      if (sessionError) {
        throw new Error(`Falha ao carregar sessão: ${sessionError.message}`);
      }

      if (session?.user_id) {
        return {
          sessionId: String(session.session_id),
          userId: String(session.user_id),
          walletPublicKey: session.public_key ? String(session.public_key) : undefined,
        };
      }
    }

    if (!explicitUserId) {
      throw new Error('Usuário não encontrado para a sessão informada.');
    }

    const { data: latestSession, error: latestError } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, public_key')
      .eq('user_id', explicitUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      throw new Error(`Falha ao localizar sessão do usuário: ${latestError.message}`);
    }

    if (!latestSession?.session_id) {
      throw new Error('Sessão ativa não encontrada para o usuário.');
    }

    return {
      sessionId: String(latestSession.session_id),
      userId: String(latestSession.user_id),
      walletPublicKey: latestSession.public_key ? String(latestSession.public_key) : undefined,
    };
  }
}

export async function trackFinancialEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await supabase.from('audit_events').insert({
      session_id: String(payload.session_id || payload.sessionId || ''),
      event_type: eventType,
      metadata: payload,
    });
  } catch {
    // Analytics failures should never block user-facing flows.
  }
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatMoney(value: number, currency: string): string {
  const normalizedCurrency = String(currency || 'BRL').toUpperCase();
  const locale = normalizedCurrency === 'BRL' ? 'pt-BR' : 'en-US';
  const currencyCode = normalizedCurrency === 'USD' || normalizedCurrency === 'USDC' ? 'USD' : 'BRL';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function daysAgo(days: number): Date {
  const now = new Date();
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
