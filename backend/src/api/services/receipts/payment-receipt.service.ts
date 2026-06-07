import { supabase } from '../../../config/supabase';
import crypto from 'crypto';
import { AgentRepository } from '../../repository/core/agent.repository';
import { logger } from '../../../utils/logger';
import { buildUnifiedFeeDisplay, formatCustomerAssetAmount, formatNetworkFeeForCustomer } from '../../../utils/fee-display';
import { buildUsedQuoteLabel } from '../../../utils/quote-display';
import { TransferNotificationService } from '../transfer-notification.service';
import { ReceiptImageService } from './receipt-image.service';
import { EconomyEngineService } from '../economy-engine.service';
import { PlatformFeeService } from '../platform-fee.service';

type ReceiptType = 'payment_sent' | 'payment_received' | 'conversion' | 'claim_redeemed';

export type PaymentReceiptInput = {
  type: ReceiptType;
  sessionId: string;
  userId: string;
  language?: 'pt-BR' | 'en' | string | null;
  provider?: string | null;
  providerUserId?: string | null;
  counterpartyLabel?: string | null;
  counterpartyKey?: string | null;
  sourceAmount?: string | null;
  sourceAssetCode?: string | null;
  destinationAmount: string;
  destinationAssetCode: string;
  feeXlm?: string | null;
  feeDisplay?: string | null;
  feeBrl?: string | null;
  feeUsdc?: string | null;
  hash?: string | null;
  quote?: any;
  savings?: {
    estimatedSavings?: number | string | null;
    estimatedTraditionalFee?: number | string | null;
    actualFee?: number | string | null;
    grossAmountBrl?: number | string | null;
    savingsPercentage?: number | string | null;
    comparisonMethod?: string | null;
  } | null;
  settlementMs?: number | null;
  completedAt?: string | null;
  status?: string | null;
  contextMessage?: string | null;
  externalDeliveryText?: string | null;
  dedupeKey?: string | null;
  hideAmounts?: boolean | null;
};

type FeeBreakdown = {
  actualDisplay: string;
  actualFeeBrl?: number;
  actualFeeUsdc?: number;
  platformApplied: boolean;
  traditionalFeePct: number;
  traditionalFeeBrl?: number;
  traditionalFeeUsdc?: number;
};

export class PaymentReceiptService {
  private static agentRepo = new AgentRepository(supabase);
  private static externalDeliveryDedupe = new Set<string>();
  private static readonly EXTERNAL_DELIVERY_DEDUPE_LIMIT = 5000;

  private static isUniqueViolation(error: any): boolean {
    const code = String(error?.code || '').trim();
    const message = String(error?.message || '').toLowerCase();
    return code === '23505' || message.includes('duplicate key') || message.includes('violates unique constraint');
  }

  private static userFacingAssetCode(assetCode?: string | null): string {
    const normalized = String(assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    if (normalized === 'TESOURO') return 'BRL';
    if (normalized === 'EURC' || normalized === 'EUR') return 'CETES';
    return normalized;
  }

  private static userFacingCounterpartyLabel(value?: string | null): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/\betherfuse\b|anchor|provedor|provider|sandbox|testnet|devnet/i.test(raw)) {
      if (/pix/i.test(raw)) return 'PIX';
      return 'TalkToStellar';
    }
    return raw;
  }

  private static normalizeReceiptLanguage(value?: unknown): 'pt-BR' | 'en' {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english') || normalized.includes('ingles')) {
      return 'en';
    }
    return 'pt-BR';
  }

  private static objectLanguage(value?: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return this.objectLanguage(parsed);
      } catch {
        return '';
      }
    }
    if (typeof value !== 'object') return '';
    const record = value as Record<string, any>;
    return String(record.language || record.lang || record.locale || '').trim();
  }

  private static booleanPreference(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (['true', '1', 'yes', 'sim', 'on', 'hidden', 'hide', 'oculto', 'ocultar'].includes(normalized)) return true;
    if (['false', '0', 'no', 'nao', 'off', 'visible', 'show', 'mostrar', 'exibir'].includes(normalized)) return false;
    return null;
  }

  private static objectHideAmounts(value?: unknown): boolean | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return this.objectHideAmounts(JSON.parse(value));
      } catch {
        return null;
      }
    }
    if (typeof value !== 'object') return null;
    const record = value as Record<string, any>;
    return this.booleanPreference(
      record.hide_amounts ??
      record.hideAmounts ??
      record.amounts_hidden ??
      record.amountsHidden ??
      (record.value_privacy === 'hidden' ? true : record.value_privacy === 'visible' ? false : undefined)
    );
  }

  private static async resolveReceiptLanguage(input: PaymentReceiptInput): Promise<'pt-BR' | 'en'> {
    const direct = String(
      input.language ||
      input.quote?.language ||
      input.quote?.lang ||
      input.quote?.locale ||
      input.quote?.metadata?.language ||
      input.quote?.metadata?.lang ||
      input.quote?.metadata?.locale ||
      input.quote?.operation_context?.language ||
      input.quote?.operationContext?.language ||
      ''
    ).trim();
    if (direct) return this.normalizeReceiptLanguage(direct);

    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) return 'pt-BR';

    try {
      const session = await this.agentRepo.getSession(sessionId);
      const sessionLanguage = String(
        this.objectLanguage((session as any)?.action_params) ||
        (session as any)?.language ||
        (session as any)?.preferred_language ||
        ''
      ).trim();
      if (sessionLanguage) return this.normalizeReceiptLanguage(sessionLanguage);

      const state = await this.agentRepo.getState(sessionId);
      const stateLanguage = String(
        this.objectLanguage((state as any)?.action_params) ||
        (state as any)?.language ||
        (state as any)?.preferred_language ||
        ''
      ).trim();
      if (stateLanguage) return this.normalizeReceiptLanguage(stateLanguage);

      return this.normalizeReceiptLanguage(
        ''
      );
    } catch (error) {
      logger.debug(`[receipt] could not resolve receipt language for session=${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      return 'pt-BR';
    }
  }

  private static async resolveHideAmounts(input: PaymentReceiptInput): Promise<boolean> {
    const direct =
      this.booleanPreference(input.hideAmounts) ??
      this.objectHideAmounts(input.quote) ??
      this.objectHideAmounts(input.quote?.metadata) ??
      this.objectHideAmounts(input.quote?.operation_context) ??
      this.objectHideAmounts(input.quote?.operationContext);
    if (direct !== null) return direct;

    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) return false;

    try {
      const session = await this.agentRepo.getSession(sessionId);
      const sessionPreference =
        this.objectHideAmounts((session as any)?.action_params) ??
        this.objectHideAmounts(session as any);
      if (sessionPreference !== null) return sessionPreference;

      const state = await this.agentRepo.getState(sessionId);
      const statePreference =
        this.objectHideAmounts((state as any)?.action_params) ??
        this.objectHideAmounts(state as any);
      if (statePreference !== null) return statePreference;
    } catch (error) {
      logger.debug(`[receipt] could not resolve amount privacy for session=${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return false;
  }

  private static sanitizeUserFacingText(value?: string | null): string {
    return String(value || '')
      .split('\n')
      .map((line) => {
        if (/https?:\/\//i.test(line)) return line;
        return line
          .replace(/PIX\s+Etherfuse/gi, 'PIX')
          .replace(/\bEtherfuse\b/gi, 'PIX')
          .replace(/\banchor\b/gi, 'serviço')
          .replace(/\bprovider\b/gi, 'serviço')
          .replace(/\bprovedor\b/gi, 'serviço')
          .replace(/\bsandbox\b/gi, '')
          .replace(/\btestnet\b/gi, '')
          .replace(/\bdevnet\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trimEnd();
      })
      .join('\n')
      .trim();
  }

  static buildHostedReceiptUrl(txHash?: string | null): string {
    const hash = String(txHash || '').trim();
    if (!hash) return '';
    const normalizedBase = this.getFrontendBaseUrl();
    return `${normalizedBase}/api/external/receipts/${encodeURIComponent(hash)}`;
  }

  private static receiptFallbackReference(input: PaymentReceiptInput, operationId: string, dedupeKey: string): string {
    return String(
      input.hash ||
      operationId ||
      dedupeKey ||
      `${input.sessionId}:${input.type}:${input.destinationAmount}:${input.destinationAssetCode}:${input.completedAt || ''}`
    ).trim();
  }

  private static getFrontendBaseUrl() {
    const preferred =
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.PAYMENT_CONFIRM_BASE ||
      process.env.CREATE_ACCOUNT_BASE ||
      '';
    const trimmed = String(preferred || '').trim();
    if (!trimmed) return 'http://localhost:3000';
    if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/$/, '');
    return `https://${trimmed}`.replace(/\/$/, '');
  }

  private static makeShortCode(seed: string) {
    return crypto.createHash('sha256').update(seed).digest('base64url').slice(0, 10);
  }

  private static async createReceiptViewerUrl(input: {
    sessionId: string;
    userId: string;
    operationId: string;
    imageDataUrl: string;
    txHash?: string | null;
    receiptType?: ReceiptType;
    metadata?: any;
  }): Promise<string> {
    const code = this.makeShortCode(`receipt:${input.sessionId}:${input.operationId}:${Date.now()}`);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const tokenHash = crypto.createHash('sha256').update(`receipt:${code}:${input.operationId}`).digest('hex');

    const receiptInsert = await supabase
      .from('receipt_images')
      .upsert({
        code,
        operation_id: input.operationId,
        tx_hash: input.txHash || null,
        session_id: input.sessionId,
        user_id: input.userId,
        receipt_type: input.receiptType || null,
        image_data_url: input.imageDataUrl,
        image_mime: input.imageDataUrl.startsWith('data:image/png') ? 'image/png' : 'image/svg+xml',
        metadata: input.metadata || {},
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      }, { onConflict: 'code' });

    if (receiptInsert.error) throw receiptInsert.error;

    const { error } = await supabase
      .from('short_links')
      .upsert({
        code,
        url: input.imageDataUrl,
        purpose: 'receipt_image',
        token_hash: tokenHash,
        session_id: input.sessionId,
        user_id: input.userId,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      }, { onConflict: 'code' });
    if (error) {
      logger.warn(`[receipt] could not write compatibility short link: ${error.message}`);
    }
    return `${this.getFrontendBaseUrl()}/receipt/${encodeURIComponent(code)}`;
  }

  private static async saveReceiptMessage(input: {
    sessionId: string;
    content: string;
    dedupeKey: string;
  }): Promise<boolean> {
    const { error } = await supabase
      .from('agent_messages')
      .insert({
        session_id: input.sessionId,
        role: 'assistant',
        content: input.content,
        dedupe_key: input.dedupeKey,
        created_at: new Date().toISOString(),
      });

    if (error) {
      if (this.isUniqueViolation(error)) return false;
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('dedupe_key') || message.includes('schema cache')) {
        await this.agentRepo.saveMessage(input.sessionId, 'assistant', input.content);
        return true;
      }
      throw error;
    }

    return true;
  }

  private static hasExternalDeliveryDedupe(dedupeKey: string): boolean {
    return this.externalDeliveryDedupe.has(dedupeKey);
  }

  private static markExternalDeliveryDedupe(dedupeKey: string): void {
    if (!dedupeKey) return;
    this.externalDeliveryDedupe.add(dedupeKey);
    if (this.externalDeliveryDedupe.size <= this.EXTERNAL_DELIVERY_DEDUPE_LIMIT) return;
    const first = this.externalDeliveryDedupe.values().next().value;
    if (first) this.externalDeliveryDedupe.delete(first);
  }

  private static clearExternalDeliveryDedupeForTests(): void {
    this.externalDeliveryDedupe.clear();
  }

  static toPublicOperationId(settlementReference?: string | null): string {
    const reference = String(settlementReference || '').trim();
    if (!reference) return '';

    const digest = crypto
      .createHash('sha256')
      .update(`receipt:${reference}`)
      .digest('base64url')
      .slice(0, 8)
      .toUpperCase();

    return `OP-${digest}`;
  }

  static async createReceiptLink(input: PaymentReceiptInput): Promise<string> {
    let receiptSvg = '';
    const operationId = this.toPublicOperationId(input.hash);

    receiptSvg = await this.buildReceiptImageSvg(input);
    const imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(receiptSvg, 'utf-8').toString('base64')}`;
    return await this.createReceiptViewerUrl({
      sessionId: input.sessionId,
      userId: input.userId,
      operationId: operationId || input.hash || crypto.randomUUID(),
      imageDataUrl,
      txHash: input.hash || null,
      receiptType: input.type,
      metadata: {
        destinationAmount: input.hideAmounts ? null : input.destinationAmount,
        destinationAssetCode: input.destinationAssetCode,
        sourceAmount: input.hideAmounts ? null : input.sourceAmount || null,
        sourceAssetCode: input.sourceAssetCode || null,
        feeDisplay: input.hideAmounts ? null : input.feeDisplay || null,
        contextMessage: input.hideAmounts ? null : input.contextMessage || null,
        counterpartyLabel: this.userFacingCounterpartyLabel(input.counterpartyLabel) || null,
        counterpartyKey: input.counterpartyKey || null,
        completedAt: input.completedAt || null,
        language: input.language || null,
        hideAmounts: Boolean(input.hideAmounts),
      },
    });
  }

  static async sendReceipt(input: PaymentReceiptInput): Promise<string> {
    const language = await this.resolveReceiptLanguage(input);
    const hideAmounts = await this.resolveHideAmounts(input);
    const localizedInput = { ...input, language, hideAmounts };
    const text = await this.buildReceiptText(localizedInput);
    let viewerUrl = '';
    const operationId = this.toPublicOperationId(input.hash);
    const explicitDedupeKey = String(input.dedupeKey || '').trim();
    const receiptDedupeKey = explicitDedupeKey
      ? `receipt:${explicitDedupeKey}`
      : `receipt:${input.sessionId}:${operationId || input.hash || `${input.type}:${input.destinationAmount}:${input.destinationAssetCode}`}`;

    await this.persistReceiptSavingsEvent(localizedInput, receiptDedupeKey, operationId);
    const cumulativeSavingsText = await this.cumulativeSavingsLine(localizedInput);

    try {
      viewerUrl = await this.createReceiptLink(localizedInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to create receipt link: ${message}`);
    }

    const fallbackReference = this.receiptFallbackReference(input, operationId, explicitDedupeKey);
    const receiptUrl = viewerUrl || this.buildHostedReceiptUrl(input.hash || fallbackReference);
    const appendReceiptLink = (value: string): string => {
      const base = String(value || '')
        .replace(/(?:^|\n)\s*(?:Comprovante|Receipt):\s*(?:\n|$)/gi, '\n')
        .trim();
      if (!base || !receiptUrl || base.includes(receiptUrl)) return base;
      return `${base}\n${language === 'en' ? 'Receipt' : 'Comprovante'}: ${receiptUrl}`;
    };
    const textWithLink = appendReceiptLink(text);
    const savingsFirstDeliveryText = hideAmounts
      ? ''
      : appendReceiptLink(await this.buildSavingsFirstWhatsappReceipt(localizedInput, receiptUrl));
    const externalDeliveryBase = this.sanitizeUserFacingText(localizedInput.externalDeliveryText);
    const externalDeliveryText = hideAmounts
      ? textWithLink
      : savingsFirstDeliveryText || appendReceiptLink(externalDeliveryBase || text);
    let savedPrimaryReceipt = true;

    try {
      savedPrimaryReceipt = await this.saveReceiptMessage({
        sessionId: input.sessionId,
        content: textWithLink,
        dedupeKey: `${receiptDedupeKey}:text`,
      });
      if (!savedPrimaryReceipt) {
        logger.info(`[receipt] primary receipt already saved dedupe_key=${receiptDedupeKey}; skipping duplicate external callback`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to save receipt message: ${message}`);
    }

    if (cumulativeSavingsText) {
      try {
        await this.saveReceiptMessage({
          sessionId: input.sessionId,
          content: cumulativeSavingsText,
          dedupeKey: `${receiptDedupeKey}:savings`,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[receipt] failed to save cumulative savings message: ${message}`);
      }
    }

    const externalDeliveryDedupeKey = `${receiptDedupeKey}:external`;
    if (!savedPrimaryReceipt) {
      this.markExternalDeliveryDedupe(externalDeliveryDedupeKey);
      return receiptUrl || '';
    }

    if (this.hasExternalDeliveryDedupe(externalDeliveryDedupeKey)) {
      logger.info(`[receipt] skipped duplicate external receipt delivery dedupe_key=${receiptDedupeKey}`);
      return receiptUrl || '';
    }

    try {
      logger.info(
        `[receipt] attempting external delivery provider=${input.provider || 'none'} provider_user_tail=${String(input.providerUserId || '').replace(/\D+/g, '').slice(-4) || 'none'} session=${input.sessionId || 'none'} user=${input.userId || 'none'} text_len=${externalDeliveryText.length}`
      );
      const delivery = await TransferNotificationService.notifyExternalChannelMessage({
        sessionId: input.sessionId,
        userId: input.userId,
        provider: input.provider,
        providerUserId: input.providerUserId,
        text: externalDeliveryText,
        buttonText: null,
        buttonUrl: null,
      });
      this.logExternalDelivery('receipt', delivery);
      if ((delivery?.whatsapp?.delivered || 0) > 0 || (delivery?.whatsapp?.attempted && (delivery?.whatsapp?.recipients || 0) > 0)) {
        this.markExternalDeliveryDedupe(externalDeliveryDedupeKey);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to deliver receipt: ${message}`);
    }

    return receiptUrl || '';
  }

  private static logExternalDelivery(context: string, delivery: Awaited<ReturnType<typeof TransferNotificationService.notifyExternalChannelMessage>>): void {
    const whatsapp = delivery?.whatsapp;
    if (!whatsapp) return;

    if (whatsapp.delivered > 0) {
      logger.info(
        `[receipt] ${context} delivered to WhatsApp recipients=${whatsapp.recipients} delivered=${whatsapp.delivered} instances=${whatsapp.instances.join(',') || 'none'}`
      );
      return;
    }

    if (whatsapp.attempted || whatsapp.recipients > 0 || whatsapp.skipped_reason) {
      logger.warn(
        `[receipt] ${context} was not delivered to WhatsApp: ${JSON.stringify({
          attempted: whatsapp.attempted,
          delivered: whatsapp.delivered,
          recipients: whatsapp.recipients,
          instances: whatsapp.instances,
          skipped_reason: whatsapp.skipped_reason,
          attempts: whatsapp.attempts,
        })}`
      );
    }
  }

  private static async persistReceiptSavingsEvent(input: PaymentReceiptInput, receiptDedupeKey: string, operationId: string): Promise<void> {
    if (!input.userId || !this.shouldShowReceiptEconomics(input)) return;

    try {
      const fee = await this.resolveFeeBreakdown(input);
      const savingsRecord = (input.savings || {}) as Record<string, unknown>;
      const grossBrl = this.toPositiveNumber(
        savingsRecord.grossAmountBrl ||
        savingsRecord.gross_amount_brl ||
        this.estimateReceiptBrlAmount(input, fee)
      );
      const actualFee = this.toPositiveNumber(
        savingsRecord.actualFee ||
        savingsRecord.actual_fee ||
        fee.actualFeeBrl
      );
      const payloadSavings = this.toPositiveNumber(
        savingsRecord.estimatedSavings ||
        savingsRecord.estimated_savings
      );
      const estimatedTraditionalFee = this.toPositiveNumber(
        savingsRecord.estimatedTraditionalFee ||
        savingsRecord.estimated_traditional_fee ||
        (payloadSavings > 0 && actualFee > 0 ? actualFee + payloadSavings : 0)
      ) || (grossBrl > 0 ? grossBrl * EconomyEngineService.traditionalFeePct() : 0);
      const estimatedSavings = payloadSavings > 0
        ? payloadSavings
        : Math.max(0, estimatedTraditionalFee - actualFee);
      if (!Number.isFinite(estimatedSavings) || estimatedSavings <= 0) return;

      const savingsPercentage = this.toPositiveNumber(
        savingsRecord.savingsPercentage ||
        savingsRecord.savings_percentage
      ) || (estimatedTraditionalFee > 0 ? (estimatedSavings / estimatedTraditionalFee) * 100 : 0);
      const operationReference = this.receiptFallbackReference(input, operationId, receiptDedupeKey);
      const createdAt = String(input.completedAt || '').trim() || new Date().toISOString();
      const eventPayload = {
        user_id: input.userId,
        event_type: 'savings_estimated',
        title: 'Economia estimada em taxa',
        description: `Estimativa de economia de R$ ${estimatedSavings.toFixed(2)} nesta operação.`,
        amount: Number(estimatedSavings.toFixed(2)),
        currency: 'BRL',
        status: 'info',
        icon: 'piggy-bank',
        semantic_color: 'teal',
        metadata_json: {
          source: 'payment_receipt',
          session_id: input.sessionId,
          payment_hash: String(input.hash || '').trim() || null,
          operation_id: operationId || null,
          operation_reference: operationReference || null,
          receipt_dedupe_key: receiptDedupeKey,
          gross_amount_brl: grossBrl || null,
          estimated_traditional_fee: estimatedTraditionalFee,
          actual_fee: actualFee,
          estimated_savings: estimatedSavings,
          savings_percentage: savingsPercentage,
          comparison_method: String(savingsRecord.comparisonMethod || savingsRecord.comparison_method || EconomyEngineService.comparisonMethod()),
          receipt_type: input.type,
        },
        created_at: createdAt,
        dedupe_key: `${input.userId}:receipt_savings:${crypto.createHash('sha256').update(receiptDedupeKey).digest('hex').slice(0, 24)}`,
      };

      const { error } = await supabase
        .from('financial_events')
        .upsert(eventPayload, { onConflict: 'dedupe_key' });

      if (error) {
        const message = String(error?.message || '').toLowerCase();
        if (this.isUniqueViolation(error)) return;
        if (message.includes('dedupe_key') || message.includes('schema cache')) {
          await supabase.from('financial_events').insert(eventPayload);
          return;
        }
        throw error;
      }
    } catch (error) {
      logger.warn(`[receipt] failed to persist savings event: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static whatsappCurrency(value: number, currency: 'BRL' | 'USD', decimals = 2, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const formatted = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number.isFinite(value) ? value : 0);
    return formatted.replace(/\u00a0/g, ' ');
  }

  private static whatsappTimestamp(completedAt?: string | null, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const parsed = completedAt ? Date.parse(completedAt) : Date.now();
    const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
    const dateLabel = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(date).replace(/\u00a0/g, ' ').replace(/\./g, '');
    const timeLabel = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Sao_Paulo',
    }).format(date);
    return `${dateLabel} · ${timeLabel}`;
  }

  private static async createInternalShortUrl(input: {
    url: string;
    purpose: string;
    sessionId: string;
    userId: string;
  }): Promise<string> {
    const url = String(input.url || '').trim();
    if (!url) return '';
    const code = this.makeShortCode(`${input.purpose}:${input.sessionId}:${input.userId}:${url}`);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const tokenHash = crypto.createHash('sha256').update(`${input.purpose}:${code}:${url}`).digest('hex');

    try {
      const { error } = await supabase
        .from('short_links')
        .upsert({
          code,
          url,
          purpose: input.purpose,
          token_hash: tokenHash,
          session_id: input.sessionId || null,
          user_id: input.userId || null,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        }, { onConflict: 'code' });
      if (error) throw error;
      return `${this.getFrontendBaseUrl()}/r/${encodeURIComponent(code)}`;
    } catch (error) {
      logger.warn(`[receipt] could not create ${input.purpose} short link: ${error instanceof Error ? error.message : String(error)}`);
      return url;
    }
  }

  private static estimateReceiptBrlAmount(input: PaymentReceiptInput, fee: FeeBreakdown): number {
    const sourceAmount = this.toPositiveNumber(input.sourceAmount || input.destinationAmount);
    const destinationAmount = this.toPositiveNumber(input.destinationAmount);
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode);
    if (sourceAssetCode === 'BRL') return sourceAmount;
    if (destinationAssetCode === 'BRL') return destinationAmount;
    const rate = this.resolveUsdBrlRate(input, fee.actualFeeBrl, fee.actualFeeUsdc);
    if (rate <= 0) return 0;
    if (sourceAssetCode === 'USDC' || sourceAssetCode === 'USD') return sourceAmount * rate;
    if (destinationAssetCode === 'USDC' || destinationAssetCode === 'USD') return destinationAmount * rate;
    return 0;
  }

  private static estimateReceiptUsdAmount(input: PaymentReceiptInput, grossBrl: number, fee: FeeBreakdown): number {
    const sourceAmount = this.toPositiveNumber(input.sourceAmount || input.destinationAmount);
    const destinationAmount = this.toPositiveNumber(input.destinationAmount);
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode);
    if (destinationAssetCode === 'USDC' || destinationAssetCode === 'USD') return destinationAmount;
    if (sourceAssetCode === 'USDC' || sourceAssetCode === 'USD') return sourceAmount;
    const rate = this.resolveUsdBrlRate(input, fee.actualFeeBrl, fee.actualFeeUsdc);
    return rate > 0 ? grossBrl / rate : 0;
  }

  private static async buildSavingsFirstWhatsappReceipt(input: PaymentReceiptInput, viewerUrl?: string): Promise<string> {
    const type = String(input.type || '').trim();
    if (input.hideAmounts) return '';
    if (!this.shouldUseSavingsFirstExternalReceipt(input)) return '';
    const language = this.normalizeReceiptLanguage(input.language);
    const isEn = language === 'en';

    const fee = await this.resolveFeeBreakdown(input);
    const grossBrl = this.estimateReceiptBrlAmount(input, fee);
    const usdReceived = this.estimateReceiptUsdAmount(input, grossBrl, fee);
    if (grossBrl <= 0 || usdReceived <= 0) {
      return '';
    }
    const actualFeeBrl = Number(fee.actualFeeBrl || 0) > 0
      ? Number(fee.actualFeeBrl)
      : grossBrl * 0.003;
    const traditionalFeeBrl = Number(fee.traditionalFeeBrl || 0) > 0
      ? Number(fee.traditionalFeeBrl)
      : grossBrl * 0.0125;
    const payloadSavings = this.toPositiveNumber(input.savings?.estimatedSavings);
    const savings = payloadSavings > 0
      ? payloadSavings
      : Math.max(0, traditionalFeeBrl - actualFeeBrl);
    const historyUrl = await this.createInternalShortUrl({
      url: `${this.getFrontendBaseUrl()}/transactions?session_id=${encodeURIComponent(input.sessionId)}`,
      purpose: 'receipt_history',
      sessionId: input.sessionId,
      userId: input.userId,
    });
    const receiptUrl = viewerUrl || this.buildHostedReceiptUrl(input.hash);
    return [
      type === 'conversion'
        ? (isEn ? '✅ *Conversion completed*' : '✅ *Conversão concluída*')
        : (isEn ? '✅ *Transfer completed*' : '✅ *Transferência concluída*'),
      this.whatsappTimestamp(input.completedAt, language),
      '',
      `💵 ${isEn ? 'Delivered' : 'Entregue'}: *${this.whatsappCurrency(usdReceived, 'USD', 2, language)}*`,
      `📤 ${isEn ? 'Sent' : 'Enviado'}: ${this.whatsappCurrency(grossBrl, 'BRL', 2, language)}`,
      `💳 ${isEn ? 'Fee paid' : 'Taxa paga'}: ${this.whatsappCurrency(actualFeeBrl, 'BRL', 2, language)}`,
      '',
      '━━━━━━━━━━━━━━',
      isEn
        ? `💰 *You saved ${this.whatsappCurrency(savings, 'BRL', 2, language)}*`
        : `💰 *Você economizou ${this.whatsappCurrency(savings, 'BRL', 2, language)}*`,
      isEn
        ? `vs bank estimate of ${this.whatsappCurrency(traditionalFeeBrl, 'BRL', 2, language)}`
        : `vs banco que cobraria ${this.whatsappCurrency(traditionalFeeBrl, 'BRL', 2, language)}`,
      '━━━━━━━━━━━━━━',
      '',
      `📊 ${isEn ? 'View history' : 'Ver histórico'}: ${historyUrl}`,
      `📄 ${isEn ? 'Receipt' : 'Comprovante'}: ${receiptUrl}`,
    ].join('\n');
  }

  static async buildReceiptImageSvg(input: PaymentReceiptInput): Promise<string> {
    const language = this.normalizeReceiptLanguage(input.language);
    const hideAmounts = Boolean(input.hideAmounts);
    const sourceAmount = String(input.sourceAmount || input.destinationAmount || '').trim();
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode);
    const fee = await this.resolveFeeBreakdown(input);
    const hiddenLabel = language === 'en' ? 'hidden' : 'oculto';
    const feeLabel = hideAmounts ? hiddenLabel : fee.actualDisplay || 'indisponível';

    return ReceiptImageService.toSvg(
      ReceiptImageService.fromPaymentReceipt({
        destinationAmount: hideAmounts ? hiddenLabel : String(input.destinationAmount || ''),
        destinationAssetCode,
        counterpartyLabel: String(input.counterpartyLabel || 'destinatário'),
        counterpartyKey: String(input.counterpartyKey || ''),
        sourceAmount: hideAmounts ? hiddenLabel : sourceAmount,
        sourceAssetCode,
        feeDisplay: feeLabel,
        settlementMs: input.settlementMs || null,
        completedAt: input.completedAt || null,
        hash: input.hash || null,
        quote: hideAmounts ? null : input.quote,
        savings: hideAmounts ? null : input.savings,
        contextMessage: hideAmounts ? null : this.sanitizeContextMessage(input.contextMessage) || null,
      })
    );
  }

  static async buildReceiptText(input: PaymentReceiptInput): Promise<string> {
    const language = this.normalizeReceiptLanguage(input.language);
    const isEn = language === 'en';
    const hideAmounts = Boolean(input.hideAmounts);
    const sourceAmount = String(input.sourceAmount || input.destinationAmount || '').trim();
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAmount = String(input.destinationAmount || '').trim();
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode);
    const hiddenLabel = isEn ? 'hidden amount' : 'valor oculto';
    const sourceLabel = hideAmounts ? hiddenLabel : formatCustomerAssetAmount(sourceAmount, sourceAssetCode);
    const destinationLabel = hideAmounts ? hiddenLabel : formatCustomerAssetAmount(destinationAmount, destinationAssetCode);
    const counterparty = this.userFacingCounterpartyLabel(input.counterpartyLabel);
    const operationLine = this.operationLine(input.type, sourceLabel, destinationLabel, counterparty, language, hideAmounts);
    const counterpartyKeyLine = this.counterpartyKeyLine(input.counterpartyKey, language);
    const hasConversion = sourceAssetCode !== destinationAssetCode;
    const showEconomics = !hideAmounts && this.shouldShowReceiptEconomics(input);
    const quoteLine = !hideAmounts && hasConversion
      ? buildUsedQuoteLabel({
          sourceAmount,
          sourceAssetCode,
          destinationAmount,
          destinationAssetCode,
          language,
        })
      : '';
    const fee = await this.resolveFeeBreakdown(input);
    const feeLine = showEconomics ? this.feeLine(fee, language) : '';
    const traditionalFeeLine = showEconomics ? this.traditionalFeeLine(fee, language) : '';
    const settlementLine = showEconomics ? this.settlementLine(input.settlementMs, language) : '';
    const savingsLine = showEconomics ? this.savingsLine(input.savings, fee, language) : '';
    const timeLine = this.timeLine(input.completedAt, language);
    const publicOperationId = this.toPublicOperationId(input.hash);
    const status = this.statusLabel(input.status, language);
    const nicknamePrompt = this.transactionNicknamePrompt(input.type);
    const contextLine = hideAmounts ? '' : this.contextLine(input.contextMessage, language);

    return [
      operationLine,
      counterpartyKeyLine,
      `${isEn ? 'Status' : 'Status'}: ${status}`,
      contextLine,
      quoteLine,
      feeLine,
      traditionalFeeLine,
      savingsLine,
      settlementLine,
      timeLine,
      publicOperationId
        ? `${isEn ? 'Operation ID' : 'ID da operação'}: ${publicOperationId}`
        : `${isEn ? 'Operation ID' : 'ID da operação'}: ${isEn ? 'processing' : 'em processamento'}`,
      '',
      isEn ? 'Receipt saved in your history.' : 'Recibo registrado no seu histórico.',
      nicknamePrompt,
    ].filter((line) => line !== '').join('\n');
  }

  private static counterpartyKeyLine(counterpartyKey?: string | null, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const key = String(counterpartyKey || '').trim();
    if (!key || /^G[A-Z2-7]{55}$/i.test(key)) return '';
    return `${language === 'en' ? 'Key' : 'Chave'}: ${key}`;
  }

  private static contextLine(contextMessage?: string | null, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const sanitized = this.sanitizeContextMessage(contextMessage, language);
    if (!sanitized) return '';
    return sanitized;
  }

  private static sanitizeContextMessage(contextMessage?: string | null, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const raw = String(contextMessage || '').trim();
    if (!raw) return '';
    const isEn = language === 'en';
    const normalized = raw
      .replace(/\s+/g, ' ')
      .replace(/^(summary|resumo)\s*:\s*/i, '')
      .replace(/\bwallet\b/gi, isEn ? 'account' : 'conta')
      .replace(/\btestnet\b/gi, '')
      .replace(/\bsandbox\b/gi, '')
      .replace(/\bdevnet\b/gi, '')
      .replace(/\betherfuse\b/gi, 'PIX')
      .replace(/\banchor\b/gi, '')
      .replace(/\bprovider\b/gi, '')
      .replace(/\bprovedor\b/gi, '')
      .replace(/\.env/gi, '')
      .trim();

    if (/retirada via pix conclu[ií]da|pix enviado ao seu pix|entrou no seu pix|saldo saiu da conta/i.test(normalized)) {
      return isEn ? 'PIX sent to the key.' : 'PIX enviado à chave.';
    }
    if (/pix.*recebid|depositad/i.test(normalized)) {
      return isEn ? 'PIX received.' : 'PIX recebido.';
    }
    return normalized.slice(0, 120);
  }

  private static savingsLine(
    savings: PaymentReceiptInput['savings'] | undefined,
    fee: FeeBreakdown,
    language: 'pt-BR' | 'en' = 'pt-BR'
  ): string {
    const fromPayload = Number(String(savings?.estimatedSavings || '').replace(',', '.'));
    if (Number.isFinite(fromPayload) && fromPayload > 0) {
      return language === 'en'
        ? `Estimated savings: R$ ${fromPayload.toFixed(2)} vs traditional methods.`
        : `Economia estimada: R$ ${fromPayload.toFixed(2)} em relação a métodos tradicionais.`;
    }

    const traditional = Number(fee.traditionalFeeBrl || 0);
    const actual = Number(fee.actualFeeBrl || 0);
    const estimated = traditional - actual;
    if (!Number.isFinite(estimated) || estimated <= 0) return '';
    return language === 'en'
      ? `Estimated savings: R$ ${estimated.toFixed(2)} vs traditional methods.`
      : `Economia estimada: R$ ${estimated.toFixed(2)} em relação a métodos tradicionais.`;
  }

  private static async cumulativeSavingsLine(input: PaymentReceiptInput): Promise<string> {
    if (input.hideAmounts) return '';
    const type = String(input.type || '').trim();
    const shouldShow =
      this.shouldShowReceiptEconomics(input) && (
      type === 'payment_sent' ||
      type === 'payment_received' ||
      type === 'claim_redeemed' ||
      type === 'conversion'
      );
    if (!shouldShow) return '';

    try {
      const identity = await EconomyEngineService.calculateIdentity({
        sessionId: input.sessionId,
        userId: input.userId,
        period: 'lifetime',
      });
      const value = Number(identity?.estimatedSavings || 0);
      const language = this.normalizeReceiptLanguage(input.language);
      if (!Number.isFinite(value) || value <= 0) {
        return '';
      }
      const formatted = this.whatsappCurrency(value, 'BRL', 2, language);
      return language === 'en'
        ? `Account lifetime savings: ${formatted} vs traditional methods.`
        : `Economia acumulada da conta: ${formatted} em relação a métodos tradicionais.`;
    } catch (error) {
      logger.debug(`[receipt] could not load cumulative savings: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  private static operationLine(
    type: ReceiptType,
    sourceLabel: string,
    destinationLabel: string,
    counterparty?: string,
    language: 'pt-BR' | 'en' = 'pt-BR',
    hideAmounts = false
  ): string {
    const isEn = language === 'en';
    const target = counterparty || (isEn ? 'recipient' : 'destinatário');
    if (hideAmounts) {
      if (type === 'conversion') {
        return isEn ? 'You completed a conversion.' : 'Você concluiu uma conversão.';
      }
      if (type === 'payment_received') {
        return isEn ? `You received a transfer from ${target}.` : `Você recebeu uma transferência de ${target}.`;
      }
      if (type === 'claim_redeemed') {
        return isEn ? `Your link was claimed by ${target}.` : `Seu link foi resgatado por ${target}.`;
      }
      if (/conta banc[aá]ria externa|pix|banco/i.test(target)) {
        return isEn ? `You completed a PIX withdrawal to ${target}.` : `Você concluiu uma retirada PIX para ${target}.`;
      }
      return isEn ? `You sent a transfer to ${target}.` : `Você enviou uma transferência para ${target}.`;
    }
    if (type === 'conversion') {
      return isEn ? `You converted ${sourceLabel} to ${destinationLabel}.` : `Você converteu ${sourceLabel} para ${destinationLabel}.`;
    }
    if (type === 'payment_received') {
      return isEn ? `You received ${destinationLabel} from ${target}.` : `Você recebeu ${destinationLabel} de ${target}.`;
    }
    if (type === 'claim_redeemed') {
      return isEn ? `Your link was claimed by ${target}: ${destinationLabel} sent.` : `Seu link foi resgatado por ${target}: ${destinationLabel} enviados.`;
    }
    if (/conta banc[aá]ria externa|pix|banco/i.test(target)) {
      return isEn ? `You withdrew ${destinationLabel} to ${target}.` : `Você retirou ${destinationLabel} para ${target}.`;
    }
    const sourceCode = String(sourceLabel || '').trim();
    const destinationCode = String(destinationLabel || '').trim();
    if (sourceCode && destinationCode && sourceCode !== destinationCode) {
      return isEn
        ? `You converted ${sourceLabel} to ${destinationLabel} and sent it to ${target}.`
        : `Você converteu ${sourceLabel} para ${destinationLabel} e enviou para ${target}.`;
    }
    return isEn ? `You sent ${destinationLabel} to ${target}.` : `Você enviou ${destinationLabel} para ${target}.`;
  }

  private static transactionNicknamePrompt(_type: ReceiptType): string {
    return '';
  }

  private static statusLabel(status?: string | null, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const isEn = language === 'en';
    const normalized = String(status || 'confirmado').trim().toLowerCase();
    if (normalized === 'completed' || normalized === 'success' || normalized === 'confirmado') return isEn ? 'completed' : 'concluído';
    if (normalized === 'processing' || normalized === 'pending') return isEn ? 'processing' : 'processando';
    if (normalized === 'failed' || normalized === 'error') return isEn ? 'not completed' : 'não concluído';
    return normalized || (isEn ? 'completed' : 'concluído');
  }

  private static feeLine(fee: FeeBreakdown, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    if (!fee.actualDisplay) return language === 'en' ? 'Fee: unavailable' : 'Taxa: indisponível';
    return `${language === 'en' ? 'Fee' : 'Taxa'}: ${fee.actualDisplay}`;
  }

  private static traditionalFeeLine(fee: FeeBreakdown, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const traditionalBrl = Number(fee.traditionalFeeBrl || 0);
    const traditionalUsdc = Number(fee.traditionalFeeUsdc || 0);
    if (!Number.isFinite(traditionalBrl) || traditionalBrl <= 0 || !Number.isFinite(traditionalUsdc) || traditionalUsdc <= 0) {
      return '';
    }
    return `${language === 'en' ? 'Estimated traditional-method fee' : 'Taxa estimada em métodos tradicionais'}: ${this.formatSmallFiat(traditionalBrl, 'BRL')} / ${this.formatSmallFiat(traditionalUsdc, 'USDC')}`;
  }

  private static parseFeeDisplay(display?: string | null): { brl?: number; usdc?: number } {
    const raw = String(display || '').trim();
    if (!raw) return {};
    const normalized = raw.replace(/\s+/g, ' ');
    const brlMatch = normalized.match(/R\$\s*([0-9]+(?:[.,][0-9]+)?)/i);
    const usdcMatch = normalized.match(/US\$\s*([0-9]+(?:[.,][0-9]+)?)/i);
    const brl = brlMatch ? Number(String(brlMatch[1]).replace(',', '.')) : NaN;
    const usdc = usdcMatch ? Number(String(usdcMatch[1]).replace(',', '.')) : NaN;
    return {
      brl: Number.isFinite(brl) ? brl : undefined,
      usdc: Number.isFinite(usdc) ? usdc : undefined,
    };
  }

  private static toPositiveNumber(value: unknown): number {
    const parsed = Number(String(value || '').replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private static envBps(...keys: string[]): number {
    for (const key of keys) {
      const parsed = Number(String(process.env[key] || '').replace(',', '.'));
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    return 0;
  }

  private static isPixOnRampReceipt(input: PaymentReceiptInput): boolean {
    const text = [
      input.counterpartyLabel,
      input.contextMessage,
      input.quote?.provider,
      input.quote?.rail,
      input.quote?.direction,
    ].map((value) => String(value || '').toLowerCase()).join(' ');

    return input.type === 'payment_received' && (
      text.includes('pix etherfuse') ||
      text.includes('etherfuse') ||
      (text.includes('pix') && text.includes('onramp')) ||
      (text.includes('pix') && text.includes('confirmado')) ||
      input.quote?.direction === 'onramp'
    );
  }

  private static isPixLikeReceipt(input: PaymentReceiptInput): boolean {
    const text = [
      input.counterpartyLabel,
      input.contextMessage,
      input.quote?.provider,
      input.quote?.rail,
      input.quote?.direction,
    ].map((value) => String(value || '').toLowerCase()).join(' ');

    return (
      text.includes('pix') ||
      text.includes('banco') ||
      text.includes('offramp') ||
      text.includes('onramp') ||
      input.quote?.direction === 'offramp' ||
      input.quote?.direction === 'onramp'
    );
  }

  private static shouldShowReceiptEconomics(input: PaymentReceiptInput): boolean {
    const type = String(input.type || '').trim();
    if (type === 'payment_sent') return this.isPixLikeReceipt(input);
    if (type === 'payment_received') return this.isPixOnRampReceipt(input);
    return type === 'conversion' || type === 'claim_redeemed';
  }

  private static shouldUseSavingsFirstExternalReceipt(input: PaymentReceiptInput): boolean {
    if (String(input.externalDeliveryText || '').trim()) return false;
    const type = String(input.type || '').trim();
    if (this.isPixOnRampReceipt(input)) return true;
    return type === 'conversion' || type === 'claim_redeemed';
  }

  private static inferPixOnRampFeeBrl(input: PaymentReceiptInput): number {
    if (!this.isPixOnRampReceipt(input)) return 0;
    const quote = input.quote || {};
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode || input.sourceAssetCode);

    const explicitFee = this.toPositiveNumber(
      quote.total_fee_amount ||
      quote.totalFeeAmount ||
      quote.total_fee_brl ||
      quote.actual_fee_brl ||
      quote.fee_brl
    );
    if (explicitFee > 0) return explicitFee;

    const providerFee = this.toPositiveNumber(
      quote.provider_onramp_fee_amount ||
      quote.provider_fee_amount ||
      quote.anchor_provider_fee_amount ||
      quote.anchorProviderFeeAmount
    );
    const appFee = this.toPositiveNumber(
      quote.talktostellar_transaction_fee_amount ||
      quote.talkToStellarFeeAmount ||
      quote.app_fee_amount ||
      quote.platform_fee_amount
    );
    if (providerFee + appFee > 0) return providerFee + appFee;

    const sourceGross = this.toPositiveNumber(
      quote.source_amount_brl ||
      quote.sourceAmountBrl ||
      quote.sourceAmount ||
      (sourceAssetCode === 'BRL' ? input.sourceAmount : '')
    );
    const destinationNet = this.toPositiveNumber(
      quote.final_amount ||
      quote.finalAmountAfterFee ||
      quote.userFacingToAmount ||
      quote.destination_amount ||
      quote.destinationAmount ||
      input.destinationAmount
    );
    if (sourceGross > 0 && destinationNet > 0 && sourceGross > destinationNet) {
      return sourceGross - destinationNet;
    }

    const settledNet = this.toPositiveNumber(input.destinationAmount || input.sourceAmount);
    if (settledNet > 0 && sourceAssetCode === 'BRL' && destinationAssetCode === 'BRL') {
      const providerBps = this.envBps('ETHERFUSE_ONRAMP_FEE_BPS', 'ETHERFUSE_TESTNET_FEE_BPS') || 20;
      const appBps = this.envBps('TALKTOSTELLAR_SPREAD_BPS', 'TTS_SPREAD_BPS') || 30;
      const totalBps = Math.min(1000, Math.max(0, providerBps + appBps));
      if (totalBps > 0 && totalBps < 10000) {
        return settledNet * (totalBps / (10000 - totalBps));
      }
    }

    return 0;
  }

  private static inferPixOffRampFeeBrl(input: PaymentReceiptInput): number {
    if (String(input.type || '').trim() !== 'payment_sent' || !this.isPixLikeReceipt(input)) return 0;
    const quote = input.quote || {};
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode || input.sourceAssetCode);
    const sourceIsReal = sourceAssetCode === 'BRL' || sourceAssetCode === 'TESOURO';
    const destinationIsReal = destinationAssetCode === 'BRL' || destinationAssetCode === 'TESOURO';

    const explicitFee = this.toPositiveNumber(
      quote.total_fee_amount ||
      quote.totalFeeAmount ||
      quote.total_fee_brl ||
      quote.actual_fee_brl ||
      quote.fee_brl
    );
    if (explicitFee > 0) return explicitFee;

    const providerFee = this.toPositiveNumber(
      quote.provider_offramp_fee_amount ||
      quote.providerOffRampFeeAmount ||
      quote.provider_withdrawal_fee_amount ||
      quote.withdrawal_fee_amount ||
      quote.anchor_provider_fee_amount ||
      quote.anchorProviderFeeAmount ||
      quote.provider_fee_amount ||
      quote.providerFeeAmount ||
      quote.feeAmount
    );
    const appFee = this.toPositiveNumber(
      quote.talktostellar_transaction_fee_amount ||
      quote.talkToStellarFeeAmount ||
      quote.app_fee_amount ||
      quote.platform_fee_amount
    );
    if (providerFee + appFee > 0) return providerFee + appFee;

    const sourceGross = this.toPositiveNumber(
      quote.source_amount ||
      quote.sourceAmount ||
      quote.fromAmount ||
      (sourceIsReal ? input.sourceAmount : '')
    );
    const destinationNet = this.toPositiveNumber(
      quote.target_brl ||
      quote.targetBrl ||
      quote.destination_amount ||
      quote.destinationAmount ||
      quote.toAmount ||
      (destinationIsReal ? input.destinationAmount : '')
    );
    if (sourceIsReal && destinationIsReal && sourceGross > 0 && destinationNet > 0 && sourceGross > destinationNet) {
      return sourceGross - destinationNet;
    }

    const brlBase = destinationNet || (destinationIsReal ? this.toPositiveNumber(input.destinationAmount) : 0);
    if (brlBase > 0) {
      const providerBps = this.envBps('ETHERFUSE_OFFRAMP_FEE_BPS', 'ETHERFUSE_WITHDRAWAL_FEE_BPS', 'ETHERFUSE_ONRAMP_FEE_BPS', 'ETHERFUSE_TESTNET_FEE_BPS') || 20;
      const appBps = this.envBps('TALKTOSTELLAR_SPREAD_BPS', 'TTS_SPREAD_BPS') || 30;
      const totalBps = Math.min(1000, Math.max(0, providerBps + appBps));
      if (totalBps > 0 && totalBps < 10000) {
        return brlBase * (totalBps / 10000);
      }
    }

    return 0;
  }

  private static receiptUsdBrlRate(input: PaymentReceiptInput): number {
    const sourceAmount = this.toPositiveNumber(input.sourceAmount || input.destinationAmount);
    const destinationAmount = this.toPositiveNumber(input.destinationAmount);
    const sourceAsset = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAsset = this.userFacingAssetCode(input.destinationAssetCode || input.sourceAssetCode);

    if (sourceAsset === 'BRL' && destinationAsset === 'USDC' && sourceAmount > 0 && destinationAmount > 0) {
      return sourceAmount / destinationAmount;
    }
    if (sourceAsset === 'USDC' && destinationAsset === 'BRL' && sourceAmount > 0 && destinationAmount > 0) {
      return destinationAmount / sourceAmount;
    }
    return 0;
  }

  private static formatSmallFiat(value: number, asset: 'BRL' | 'USDC'): string {
    const symbol = asset === 'BRL' ? 'R$' : 'US$';
    const decimals = value > 0 && value < 0.01 ? 6 : 2;
    return `${symbol} ${value.toFixed(decimals)}`;
  }

  private static resolveUsdBrlRate(input: PaymentReceiptInput, feeBrl?: number, feeUsdc?: number): number {
    const receiptRate = this.receiptUsdBrlRate(input);
    if (receiptRate > 0) return receiptRate;

    if (Number.isFinite(feeBrl) && Number.isFinite(feeUsdc) && Number(feeBrl) > 0 && Number(feeUsdc) > 0) {
      return Number(feeBrl) / Number(feeUsdc);
    }

    const quote = input.quote || {};
    const sourceAmount = this.toPositiveNumber(quote.sourceAmount);
    const destinationAmount = this.toPositiveNumber(quote.destinationAmount);
    const sourceAsset = String(quote.sourceAsset?.code || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const destinationAsset = String(quote.destinationAsset?.code || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const sourceIsReal = sourceAsset === 'BRL' || sourceAsset === 'TESOURO';
    const destinationIsReal = destinationAsset === 'BRL' || destinationAsset === 'TESOURO';

    if (sourceIsReal && destinationAsset === 'USDC' && sourceAmount > 0 && destinationAmount > 0) {
      return sourceAmount / destinationAmount;
    }
    if (sourceAsset === 'USDC' && destinationIsReal && sourceAmount > 0 && destinationAmount > 0) {
      return destinationAmount / sourceAmount;
    }

    return 0;
  }

  private static async resolveFeeBreakdown(input: PaymentReceiptInput): Promise<FeeBreakdown> {
    const display = String(input.feeDisplay || '').trim();
    const parsedDisplay = this.parseFeeDisplay(display);

    let networkFee: { display: string; fee_brl?: string; fee_usdc?: string; source: string } = {
      display: display || '',
      fee_brl: String(input.feeBrl || parsedDisplay.brl || ''),
      fee_usdc: String(input.feeUsdc || parsedDisplay.usdc || ''),
      source: 'provided',
    };

    if (!networkFee.fee_brl && !networkFee.fee_usdc && String(input.feeXlm || '').trim()) {
      networkFee = await formatNetworkFeeForCustomer(String(input.feeXlm || '').trim());
    }

    const sourceAmount = String(input.sourceAmount || input.destinationAmount || '').trim();
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode || input.sourceAssetCode);

    let platformFeeAmount = String(input.quote?.platformFee?.feeAmount || '').trim();
    let platformFeeAssetCode = this.userFacingAssetCode(input.quote?.platformFee?.feeAssetCode);
    if (!platformFeeAmount || !platformFeeAssetCode) {
      const spread = PlatformFeeService.calculateSpread({
        sourceAmount,
        sourceAssetCode,
        destinationAssetCode,
        mode: 'deduct_from_source',
      });
      if (spread.enabled && this.toPositiveNumber(spread.feeAmount) > 0) {
        platformFeeAmount = spread.feeAmount;
        platformFeeAssetCode = this.userFacingAssetCode(spread.feeAssetCode);
      }
    }

    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee,
      platformFeeAmount: platformFeeAmount || null,
      platformFeeAssetCode: platformFeeAssetCode || null,
      sourceAssetCode: sourceAssetCode || null,
      destinationAssetCode: destinationAssetCode || null,
    });

    const inferredPixFeeBrl = this.inferPixOnRampFeeBrl(input) || this.inferPixOffRampFeeBrl(input);
    const actualFeeBrlFromPayload = this.toPositiveNumber(unifiedFee.fee_brl || input.feeBrl || parsedDisplay.brl || inferredPixFeeBrl);
    const actualFeeUsdcFromPayload = this.toPositiveNumber(unifiedFee.fee_usdc || input.feeUsdc || parsedDisplay.usdc);
    let actualDisplay = String(unifiedFee.display || display || '').trim();
    const traditionalFeePct = EconomyEngineService.traditionalFeePct();
    const usdBrl = this.resolveUsdBrlRate(input, actualFeeBrlFromPayload, actualFeeUsdcFromPayload);
    const actualFeeBrl = actualFeeBrlFromPayload || (actualFeeUsdcFromPayload > 0 && usdBrl > 0
      ? actualFeeUsdcFromPayload * usdBrl
      : 0);
    const shouldDeriveUsdcFromTransactionFee =
      Boolean(unifiedFee.platform_applied) &&
      actualFeeBrl > 0 &&
      usdBrl > 0 &&
      (
        (sourceAssetCode === 'BRL' && destinationAssetCode === 'USDC') ||
        (sourceAssetCode === 'USDC' && destinationAssetCode === 'BRL')
      );
    const actualFeeUsdc = shouldDeriveUsdcFromTransactionFee
      ? actualFeeBrl / usdBrl
      : (actualFeeUsdcFromPayload || (actualFeeBrl > 0 && usdBrl > 0
        ? actualFeeBrl / usdBrl
        : 0));
    if (actualFeeUsdc > 0 && actualFeeBrl > 0) {
      actualDisplay = `${this.formatSmallFiat(actualFeeBrl, 'BRL')} / ${this.formatSmallFiat(actualFeeUsdc, 'USDC')}`;
    } else if (actualFeeUsdc > 0 && actualFeeBrl <= 0) {
      actualDisplay = this.formatSmallFiat(actualFeeUsdc, 'USDC');
    } else if (actualFeeBrl > 0 && actualFeeUsdc <= 0) {
      actualDisplay = this.formatSmallFiat(actualFeeBrl, 'BRL');
    }

    const grossAmountBrl = this.estimateReceiptBrlAmount(input, {
      actualDisplay,
      actualFeeBrl,
      actualFeeUsdc,
      platformApplied: Boolean(unifiedFee.platform_applied),
      traditionalFeePct,
    });

    const savingsFromPayload = this.toPositiveNumber(input.savings?.estimatedSavings);
    const traditionalFeeBrl = savingsFromPayload > 0 && actualFeeBrl > 0
      ? actualFeeBrl + savingsFromPayload
      : (grossAmountBrl > 0 ? grossAmountBrl * traditionalFeePct : 0);

    const traditionalFeeUsdc = traditionalFeeBrl > 0 && usdBrl > 0 ? traditionalFeeBrl / usdBrl : 0;

    return {
      actualDisplay,
      actualFeeBrl: actualFeeBrl || undefined,
      actualFeeUsdc: actualFeeUsdc || undefined,
      platformApplied: Boolean(unifiedFee.platform_applied),
      traditionalFeePct,
      traditionalFeeBrl: traditionalFeeBrl || undefined,
      traditionalFeeUsdc: traditionalFeeUsdc || undefined,
    };
  }

  private static settlementLine(_settlementMs?: number | null, _language: 'pt-BR' | 'en' = 'pt-BR'): string {
    return '';
  }

  private static timeLine(completedAt?: string | null, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const timestamp = completedAt ? Date.parse(completedAt) : Date.now();
    const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
    if (language === 'en') {
      return `Time: ${date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })}`;
    }
    return `Horário: ${date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  }
}
