import { supabase } from '../../config/supabase';
import { AgentRepository } from '../repository/core/agent.repository';
import { logger } from '../../utils/logger';
import { TransferNotificationService } from './transfer-notification.service';
import { EconomyEngineService } from './economy-engine.service';
import { formatMoney, toNumber } from './financial-context.service';

type UserSummaryContext = {
  userId: string;
  sessionId: string;
  walletPublicKey?: string;
};

export class DailySummaryService {
  private static agentRepo = new AgentRepository(supabase);
  private static schedulerTimer: NodeJS.Timeout | null = null;
  private static lastRunKey = '';

  static startScheduler(): void {
    if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test') {
      return;
    }

    const enabled = String(process.env.ENABLE_DAILY_SUMMARY || 'true').trim().toLowerCase();
    if (enabled === 'false' || enabled === '0' || enabled === 'no') {
      logger.info('[daily-summary] scheduler disabled by env');
      return;
    }
    if (this.schedulerTimer) return;

    const intervalMs = Math.max(60_000, Number(process.env.DAILY_SUMMARY_INTERVAL_MS || 15 * 60 * 1000));
    const startupDelayMs = Math.max(5_000, Number(process.env.DAILY_SUMMARY_STARTUP_DELAY_MS || 20_000));

    const tick = async () => {
      try {
        await this.runScheduledTick();
      } catch (error) {
        logger.warn(`[daily-summary] tick failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    setTimeout(tick, startupDelayMs);
    this.schedulerTimer = setInterval(tick, intervalMs);
    logger.info(`[daily-summary] scheduler started (interval=${intervalMs}ms)`);
  }

  private static localDateKey(date: Date, timezone: string): string {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    return String(formatted || '').trim();
  }

  private static localHour(date: Date, timezone: string): number {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(date);
    const parsed = Number(formatted);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private static async runScheduledTick(now = new Date()): Promise<void> {
    const timezone = String(process.env.DAILY_SUMMARY_TIMEZONE || 'America/Sao_Paulo').trim();
    const targetHour = Math.min(23, Math.max(0, Number(process.env.DAILY_SUMMARY_HOUR_LOCAL || 9)));
    const currentHour = this.localHour(now, timezone);
    if (currentHour < targetHour) return;

    const dayKey = this.localDateKey(now, timezone);
    const runKey = `${dayKey}:${targetHour}`;
    if (this.lastRunKey === runKey) return;
    this.lastRunKey = runKey;

    const result = await this.sendDailySummaries();
    logger.info(`[daily-summary] run complete: users=${result.processed} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`);
  }

  private static async listUsersForSummary(): Promise<UserSummaryContext[]> {
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, public_key, opt_out_weekly_summary, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20000);

    if (error) {
      throw new Error(`Falha ao carregar usuários para resumo diário: ${error.message}`);
    }

    const byUser = new Map<string, UserSummaryContext>();
    for (const row of data || []) {
      const userId = String((row as any)?.user_id || '').trim();
      const sessionId = String((row as any)?.session_id || '').trim();
      if (!userId || !sessionId || byUser.has(userId)) continue;
      const optedOut = Boolean((row as any)?.opt_out_weekly_summary);
      if (optedOut) continue;
      byUser.set(userId, {
        userId,
        sessionId,
        walletPublicKey: String((row as any)?.public_key || '').trim() || undefined,
      });
    }

    return Array.from(byUser.values());
  }

  private static dailyDedupeKey(userId: string, now: Date): string {
    const timezone = String(process.env.DAILY_SUMMARY_TIMEZONE || 'America/Sao_Paulo').trim();
    const dayKey = this.localDateKey(now, timezone);
    return `daily_summary:${userId}:${dayKey}`;
  }

  private static async reserveDailySummaryEvent(input: {
    userId: string;
    sessionId: string;
    dedupeKey: string;
    windowStartIso: string;
    windowEndIso: string;
  }): Promise<boolean> {
    const { error } = await supabase
      .from('financial_events')
      .insert({
        user_id: input.userId,
        event_type: 'daily_summary_sent',
        title: 'Resumo diário enviado',
        description: `Resumo diário das últimas 24h enviado para o usuário.`,
        status: 'info',
        metadata_json: {
          window_start: input.windowStartIso,
          window_end: input.windowEndIso,
          session_id: input.sessionId,
        },
        dedupe_key: input.dedupeKey,
        created_at: new Date().toISOString(),
      });

    if (!error) return true;
    const duplicate = String((error as any)?.code || '') === '23505';
    if (duplicate) return false;
    throw new Error(error.message || 'Falha ao reservar evento de resumo diário');
  }

  private static async buildSummaryMessage(input: {
    userId: string;
    walletPublicKey?: string;
    windowStartIso: string;
    windowEndIso: string;
  }): Promise<string | null> {
    const { data: logs, error } = await supabase
      .from('payment_logs')
      .select('source_amount, source_asset_code, destination_public_key, source_public_key, metadata, completed_at, status')
      .eq('user_id', input.userId)
      .eq('status', 'success')
      .gte('completed_at', input.windowStartIso)
      .lt('completed_at', input.windowEndIso)
      .order('completed_at', { ascending: false })
      .limit(600);

    if (error) {
      throw new Error(`Falha ao calcular resumo diário: ${error.message}`);
    }

    if (!logs || logs.length === 0) return null;

    let movedBrl = 0;
    let savingsBrl = 0;
    const uniquePayers = new Set<string>();

    for (const row of logs as any[]) {
      const metadata = (row?.metadata || {}) as Record<string, any>;
      const savingsMeta = (metadata?.savings || {}) as Record<string, any>;

      const grossFromMeta = toNumber(savingsMeta.gross_amount_brl || metadata.gross_amount_brl);
      const estimatedFromMeta = toNumber(savingsMeta.estimated_savings || metadata.estimated_savings);

      const estimatedGross = grossFromMeta > 0
        ? grossFromMeta
        : EconomyEngineService.estimateAmountInBrl({
            amount: row?.source_amount,
            assetCode: row?.source_asset_code,
            quote: metadata?.quote,
          });

      movedBrl += Math.max(0, estimatedGross);

      if (estimatedFromMeta > 0) {
        savingsBrl += estimatedFromMeta;
      } else if (estimatedGross > 0) {
        const fallback = EconomyEngineService.calculateForOperation({
          grossAmount: estimatedGross,
          actualFee: toNumber(metadata?.actual_fee_brl || metadata?.fee_brl),
        });
        savingsBrl += Math.max(0, fallback.estimatedSavings);
      }

      const destinationKey = String(row?.destination_public_key || '').trim();
      const sourceKey = String(row?.source_public_key || '').trim();
      if (input.walletPublicKey && destinationKey && destinationKey === input.walletPublicKey && sourceKey) {
        uniquePayers.add(sourceKey);
      }
    }

    const message =
      `Resumo diário (últimas 24h): você movimentou ${formatMoney(movedBrl, 'BRL')}, ` +
      `economizou ${formatMoney(savingsBrl, 'BRL')} em taxas e recebeu de ${uniquePayers.size} cliente(s).`;

    return message;
  }

  private static async sendForUser(ctx: UserSummaryContext, now = new Date()): Promise<'sent' | 'skipped'> {
    const windowEnd = now;
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const windowStartIso = windowStart.toISOString();
    const windowEndIso = windowEnd.toISOString();

    const message = await this.buildSummaryMessage({
      userId: ctx.userId,
      walletPublicKey: ctx.walletPublicKey,
      windowStartIso,
      windowEndIso,
    });

    if (!message) return 'skipped';

    const dedupeKey = this.dailyDedupeKey(ctx.userId, now);
    const reserved = await this.reserveDailySummaryEvent({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      dedupeKey,
      windowStartIso,
      windowEndIso,
    });

    if (!reserved) return 'skipped';

    try {
      await this.agentRepo.saveMessage(ctx.sessionId, 'assistant', message);
    } catch (error) {
      logger.warn(`[daily-summary] failed to save web chat message for ${ctx.userId}: ${error instanceof Error ? error.message : String(error)}`);
    }

    await TransferNotificationService.notifyExternalChannelMessage({
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      text: message,
    });

    return 'sent';
  }

  static async sendDailySummaries(now = new Date()): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
    const users = await this.listUsersForSummary();
    let processed = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      processed += 1;
      try {
        const status = await this.sendForUser(user, now);
        if (status === 'sent') sent += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        logger.warn(`[daily-summary] failed for user=${user.userId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { processed, sent, skipped, failed };
  }
}
