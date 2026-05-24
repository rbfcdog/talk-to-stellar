import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { TransferNotificationService } from './transfer-notification.service';

type FxRateAlertUser = {
  userId: string;
  sessionId: string;
};

function toNumber(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatRate(value: number): string {
  return value.toFixed(4).replace('.', ',');
}

export class FxRateAlertService {
  private static schedulerTimer: NodeJS.Timeout | null = null;

  static startScheduler(): void {
    if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test') return;
    const enabled = String(process.env.ENABLE_FX_RATE_ALERTS || 'false').trim().toLowerCase();
    if (!['true', '1', 'yes'].includes(enabled)) {
      logger.info('[fx-rate-alert] scheduler disabled by env');
      return;
    }
    if (this.schedulerTimer) return;

    const intervalMs = Math.max(15 * 60_000, Number(process.env.FX_RATE_ALERT_INTERVAL_MS || 60 * 60_000));
    const startupDelayMs = Math.max(10_000, Number(process.env.FX_RATE_ALERT_STARTUP_DELAY_MS || 60_000));
    const tick = async () => {
      try {
        const result = await this.sendIfFavorable();
        logger.info(`[fx-rate-alert] tick complete: eligible=${result.eligible} sent=${result.sent} skipped=${result.skipped}`);
      } catch (error) {
        logger.warn(`[fx-rate-alert] tick failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    setTimeout(tick, startupDelayMs);
    this.schedulerTimer = setInterval(tick, intervalMs);
    logger.info(`[fx-rate-alert] scheduler started (interval=${intervalMs}ms)`);
  }

  private static async latestAndSevenDayAverage(): Promise<{
    latestRate: number;
    averageRate: number;
    observedAt: string;
    changePct: number;
  } | null> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const latestResp = await supabase
      .from('currency_rate_history')
      .select('rate, observed_at')
      .eq('base_currency', 'USD')
      .eq('quote_currency', 'BRL')
      .order('observed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestResp.error) throw new Error(latestResp.error.message);

    const latestRate = toNumber((latestResp.data as any)?.rate);
    const observedAt = String((latestResp.data as any)?.observed_at || new Date().toISOString());
    if (latestRate <= 0) return null;

    const windowResp = await supabase
      .from('currency_rate_history')
      .select('rate')
      .eq('base_currency', 'USD')
      .eq('quote_currency', 'BRL')
      .gte('observed_at', sevenDaysAgo)
      .limit(500);
    if (windowResp.error) throw new Error(windowResp.error.message);

    const rates = (windowResp.data || []).map((row: any) => toNumber(row.rate)).filter((rate) => rate > 0);
    if (rates.length === 0) return null;
    const averageRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    const changePct = averageRate > 0 ? ((latestRate - averageRate) / averageRate) * 100 : 0;
    return { latestRate, averageRate, observedAt, changePct };
  }

  private static async listRecentTransferUsers(): Promise<FxRateAlertUser[]> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('payment_logs')
      .select('user_id, session_id, completed_at')
      .eq('status', 'success')
      .gte('completed_at', since)
      .order('completed_at', { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const byUser = new Map<string, FxRateAlertUser>();
    for (const row of data || []) {
      const userId = String((row as any)?.user_id || '').trim();
      const sessionId = String((row as any)?.session_id || '').trim();
      if (!userId || !sessionId || byUser.has(userId)) continue;
      byUser.set(userId, { userId, sessionId });
    }
    return Array.from(byUser.values());
  }

  private static async reserveAlert(user: FxRateAlertUser, rate: number, now = new Date()): Promise<boolean> {
    const dedupeKey = `fx_rate_alert:${user.userId}:${localDateKey(now)}:${rate.toFixed(4)}`;
    const { error } = await supabase
      .from('financial_events')
      .insert({
        user_id: user.userId,
        event_type: 'fx_rate_alert_sent',
        title: 'Alerta de câmbio favorável enviado',
        description: 'Mensagem proativa enviada quando USD/BRL ficou acima da média de 7 dias.',
        status: 'info',
        metadata_json: {
          session_id: user.sessionId,
          usd_brl_rate: rate,
        },
        dedupe_key: dedupeKey,
        created_at: new Date().toISOString(),
      });
    if (!error) return true;
    if (String((error as any)?.code || '') === '23505') return false;
    throw new Error(error.message || 'Falha ao reservar alerta de câmbio');
  }

  static async sendIfFavorable(now = new Date()): Promise<{ eligible: number; sent: number; skipped: number }> {
    const thresholdPct = Math.max(0.1, Number(process.env.FX_RATE_ALERT_THRESHOLD_PCT || 2));
    const rate = await this.latestAndSevenDayAverage();
    if (!rate || rate.changePct < thresholdPct) return { eligible: 0, sent: 0, skipped: 0 };

    const users = await this.listRecentTransferUsers();
    let sent = 0;
    let skipped = 0;
    const message = [
      '📈 *Câmbio favorável agora*',
      `1 USD = R$ ${formatRate(rate.latestRate)} (+${rate.changePct.toFixed(1).replace('.', ',')}% vs média de 7 dias)`,
      '',
      'Bom momento para simular um envio.',
      'Digite: quanto custa enviar 5000 reais?',
    ].join('\n');

    for (const user of users) {
      const reserved = await this.reserveAlert(user, rate.latestRate, now);
      if (!reserved) {
        skipped += 1;
        continue;
      }
      await TransferNotificationService.notifyExternalChannelMessage({
        sessionId: user.sessionId,
        userId: user.userId,
        text: message,
      });
      sent += 1;
    }

    return { eligible: users.length, sent, skipped };
  }
}
