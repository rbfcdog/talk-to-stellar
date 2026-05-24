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
    savingsPercentage?: number | string | null;
    comparisonMethod?: string | null;
  } | null;
  settlementMs?: number | null;
  completedAt?: string | null;
  status?: string | null;
  contextMessage?: string | null;
  externalDeliveryText?: string | null;
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

  private static userFacingAssetCode(assetCode?: string | null): string {
    const normalized = String(assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    return normalized === 'TESOURO' ? 'BRL' : normalized;
  }

  static buildHostedReceiptUrl(txHash?: string | null): string {
    const hash = String(txHash || '').trim();
    if (!hash) return '';
    const normalizedBase = this.getFrontendBaseUrl();
    return `${normalizedBase}/api/external/receipts/${encodeURIComponent(hash)}`;
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
  }) {
    const { error } = await supabase
      .from('agent_messages')
      .upsert({
        session_id: input.sessionId,
        role: 'assistant',
        content: input.content,
        dedupe_key: input.dedupeKey,
        created_at: new Date().toISOString(),
      }, { onConflict: 'dedupe_key' });

    if (error) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('dedupe_key') || message.includes('schema cache')) {
        await this.agentRepo.saveMessage(input.sessionId, 'assistant', input.content);
        return;
      }
      throw error;
    }
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
        destinationAmount: input.destinationAmount,
        destinationAssetCode: input.destinationAssetCode,
        sourceAmount: input.sourceAmount || null,
        sourceAssetCode: input.sourceAssetCode || null,
        feeDisplay: input.feeDisplay || null,
        contextMessage: input.contextMessage || null,
        counterpartyLabel: input.counterpartyLabel || null,
        counterpartyKey: input.counterpartyKey || null,
        completedAt: input.completedAt || null,
      },
    });
  }

  static async sendReceipt(input: PaymentReceiptInput): Promise<string> {
    const text = await this.buildReceiptText(input);
    const cumulativeSavingsText = await this.cumulativeSavingsLine(input);
    let viewerUrl = '';
    const operationId = this.toPublicOperationId(input.hash);
    const receiptDedupeKey = `receipt:${input.sessionId}:${operationId || input.hash || `${input.type}:${input.destinationAmount}:${input.destinationAssetCode}`}`;

    try {
      viewerUrl = await this.createReceiptLink(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to create receipt link: ${message}`);
    }

    const textWithLink = viewerUrl ? `${text}\nComprovante: ${viewerUrl}` : text;
    const savingsFirstDeliveryText = await this.buildSavingsFirstWhatsappReceipt(input, viewerUrl);
    const externalDeliveryBase = String(input.externalDeliveryText || '').trim();
    const externalDeliveryText = savingsFirstDeliveryText || (externalDeliveryBase
      ? viewerUrl
        ? `${externalDeliveryBase}\nComprovante: ${viewerUrl}`
        : externalDeliveryBase
      : textWithLink);

    try {
      await this.saveReceiptMessage({
        sessionId: input.sessionId,
        content: textWithLink,
        dedupeKey: `${receiptDedupeKey}:text`,
      });
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
        buttonText: viewerUrl ? 'Abrir comprovante' : null,
        buttonUrl: viewerUrl || null,
      });
      this.logExternalDelivery('receipt', delivery);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to deliver receipt: ${message}`);
    }

    return viewerUrl || '';
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

  private static whatsappCurrency(value: number, currency: 'BRL' | 'USD', decimals = 2): string {
    const formatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Number.isFinite(value) ? value : 0);
    return formatted.replace(/\u00a0/g, ' ');
  }

  private static whatsappTimestamp(completedAt?: string | null): string {
    const parsed = completedAt ? Date.parse(completedAt) : Date.now();
    const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
    const dateLabel = new Intl.DateTimeFormat('pt-BR', {
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
    if (type !== 'payment_sent' && type !== 'conversion' && type !== 'claim_redeemed') return '';

    const fee = await this.resolveFeeBreakdown(input);
    const grossBrl = this.estimateReceiptBrlAmount(input, fee);
    const usdReceived = this.estimateReceiptUsdAmount(input, grossBrl, fee);
    const actualFeeBrl = Number(fee.actualFeeBrl || 0) > 0
      ? Number(fee.actualFeeBrl)
      : grossBrl * 0.003;
    const traditionalFeeBrl = Number(fee.traditionalFeeBrl || 0) > 0
      ? Number(fee.traditionalFeeBrl)
      : grossBrl * 0.035;
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
      type === 'conversion' ? '✅ *Conversão concluída*' : '✅ *Transferência concluída*',
      this.whatsappTimestamp(input.completedAt),
      '',
      `💵 Entregue: *${this.whatsappCurrency(usdReceived, 'USD')}*`,
      `📤 Enviado: ${this.whatsappCurrency(grossBrl, 'BRL')}`,
      `💳 Taxa paga: ${this.whatsappCurrency(actualFeeBrl, 'BRL')}`,
      '',
      '━━━━━━━━━━━━━━',
      `💰 *Você economizou ${this.whatsappCurrency(savings, 'BRL')}*`,
      `vs banco que cobraria ${this.whatsappCurrency(traditionalFeeBrl, 'BRL')}`,
      '━━━━━━━━━━━━━━',
      '',
      `📊 Ver histórico: ${historyUrl}`,
      `📄 Comprovante PDF: ${receiptUrl || 'indisponível'}`,
    ].join('\n');
  }

  static async buildReceiptImageSvg(input: PaymentReceiptInput): Promise<string> {
    const sourceAmount = String(input.sourceAmount || input.destinationAmount || '').trim();
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode);
    const fee = await this.resolveFeeBreakdown(input);
    const feeLabel = fee.actualDisplay || 'indisponivel';

    return ReceiptImageService.toSvg(
      ReceiptImageService.fromPaymentReceipt({
        destinationAmount: String(input.destinationAmount || ''),
        destinationAssetCode,
        counterpartyLabel: String(input.counterpartyLabel || 'destinatário'),
        counterpartyKey: String(input.counterpartyKey || ''),
        sourceAmount,
        sourceAssetCode,
        feeDisplay: feeLabel,
        settlementMs: input.settlementMs || null,
        completedAt: input.completedAt || null,
        hash: input.hash || null,
        quote: input.quote,
        savings: input.savings,
        contextMessage: this.sanitizeContextMessage(input.contextMessage) || null,
      })
    );
  }

  static async buildReceiptText(input: PaymentReceiptInput): Promise<string> {
    const sourceAmount = String(input.sourceAmount || input.destinationAmount || '').trim();
    const sourceAssetCode = this.userFacingAssetCode(input.sourceAssetCode || input.destinationAssetCode);
    const destinationAmount = String(input.destinationAmount || '').trim();
    const destinationAssetCode = this.userFacingAssetCode(input.destinationAssetCode);
    const sourceLabel = formatCustomerAssetAmount(sourceAmount, sourceAssetCode);
    const destinationLabel = formatCustomerAssetAmount(destinationAmount, destinationAssetCode);
    const counterparty = String(input.counterpartyLabel || '').trim();
    const operationLine = this.operationLine(input.type, sourceLabel, destinationLabel, counterparty);
    const counterpartyKeyLine = this.counterpartyKeyLine(input.counterpartyKey);
    const hasConversion = sourceAssetCode !== destinationAssetCode;
    const quoteLine = hasConversion
      ? buildUsedQuoteLabel({
          sourceAmount,
          sourceAssetCode,
          destinationAmount,
          destinationAssetCode,
        })
      : '';
    const fee = await this.resolveFeeBreakdown(input);
    const feeLine = this.feeLine(fee);
    const traditionalFeeLine = this.traditionalFeeLine(fee);
    const settlementLine = this.settlementLine(input.settlementMs);
    const savingsLine = this.savingsLine(input.savings, fee);
    const timeLine = this.timeLine(input.completedAt);
    const publicOperationId = this.toPublicOperationId(input.hash);
    const status = this.statusLabel(input.status);
    const nicknamePrompt = this.transactionNicknamePrompt(input.type);
    const contextLine = this.contextLine(input.contextMessage);

    return [
      operationLine,
      counterpartyKeyLine,
      `Status: ${status}`,
      contextLine,
      quoteLine,
      feeLine,
      traditionalFeeLine,
      savingsLine,
      settlementLine,
      timeLine,
      publicOperationId ? `ID da operação: ${publicOperationId}` : 'ID da operação: em processamento',
      '',
      'Recibo registrado no seu histórico.',
      nicknamePrompt,
    ].filter((line) => line !== '').join('\n');
  }

  private static counterpartyKeyLine(counterpartyKey?: string | null): string {
    const key = String(counterpartyKey || '').trim();
    if (!key || /^G[A-Z2-7]{55}$/i.test(key)) return '';
    return `Chave: ${key}`;
  }

  private static contextLine(contextMessage?: string | null): string {
    const sanitized = this.sanitizeContextMessage(contextMessage);
    if (!sanitized) return '';
    return `Resumo: ${sanitized}`;
  }

  private static sanitizeContextMessage(contextMessage?: string | null): string {
    const raw = String(contextMessage || '').trim();
    if (!raw) return '';
    const normalized = raw
      .replace(/\s+/g, ' ')
      .replace(/\bwallet\b/gi, 'conta')
      .replace(/\btestnet\b/gi, '')
      .replace(/\bsandbox\b/gi, '')
      .replace(/\bdevnet\b/gi, '')
      .replace(/\.env/gi, '')
      .trim();

    if (/retirada via pix conclu[ií]da|entrou no seu pix|saldo saiu da conta/i.test(normalized)) {
      return 'PIX enviado ao seu PIX.';
    }
    if (/pix.*recebid|depositad/i.test(normalized)) {
      return 'PIX recebido.';
    }
    return normalized.slice(0, 120);
  }

  private static savingsLine(savings: PaymentReceiptInput['savings'] | undefined, fee: FeeBreakdown): string {
    const fromPayload = Number(String(savings?.estimatedSavings || '').replace(',', '.'));
    if (Number.isFinite(fromPayload) && fromPayload > 0) {
      return `Economia estimada: R$ ${fromPayload.toFixed(2)} em relação a métodos tradicionais.`;
    }

    const traditional = Number(fee.traditionalFeeBrl || 0);
    const actual = Number(fee.actualFeeBrl || 0);
    const estimated = traditional - actual;
    if (!Number.isFinite(estimated) || estimated <= 0) return '';
    return `Economia estimada: R$ ${estimated.toFixed(2)} em relação a métodos tradicionais.`;
  }

  private static async cumulativeSavingsLine(input: PaymentReceiptInput): Promise<string> {
    const type = String(input.type || '').trim();
    const shouldShow =
      type === 'payment_sent' ||
      type === 'claim_redeemed' ||
      type === 'conversion';
    if (!shouldShow) return '';

    try {
      const identity = await EconomyEngineService.calculateIdentity({
        sessionId: input.sessionId,
        userId: input.userId,
        period: 'lifetime',
      });
      const value = Number(identity?.estimatedSavings || 0);
      if (!Number.isFinite(value) || value <= 0) {
        return 'Economia acumulada da conta: R$ 0.00 em relação a métodos tradicionais.';
      }
      return `Economia acumulada da conta: R$ ${value.toFixed(2)} em relação a métodos tradicionais.`;
    } catch (error) {
      logger.debug(`[receipt] could not load cumulative savings: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  private static operationLine(type: ReceiptType, sourceLabel: string, destinationLabel: string, counterparty?: string): string {
    const target = counterparty || 'destinatário';
    if (type === 'conversion') {
      return `Você converteu ${sourceLabel} para ${destinationLabel}.`;
    }
    if (type === 'payment_received') {
      return `Você recebeu ${destinationLabel} de ${target}.`;
    }
    if (type === 'claim_redeemed') {
      return `Seu link foi resgatado por ${target}: ${destinationLabel} enviados.`;
    }
    if (/conta banc[aá]ria externa|pix|banco/i.test(target)) {
      return `Você retirou ${destinationLabel} para ${target}.`;
    }
    const sourceCode = String(sourceLabel || '').trim();
    const destinationCode = String(destinationLabel || '').trim();
    if (sourceCode && destinationCode && sourceCode !== destinationCode) {
      return `Você converteu ${sourceLabel} para ${destinationLabel} e enviou para ${target}.`;
    }
    return `Você enviou ${destinationLabel} para ${target}.`;
  }

  private static transactionNicknamePrompt(_type: ReceiptType): string {
    return '';
  }

  private static statusLabel(status?: string | null): string {
    const normalized = String(status || 'confirmado').trim().toLowerCase();
    if (normalized === 'completed' || normalized === 'success' || normalized === 'confirmado') return 'concluído';
    if (normalized === 'processing' || normalized === 'pending') return 'processando';
    if (normalized === 'failed' || normalized === 'error') return 'não concluído';
    return normalized || 'concluído';
  }

  private static feeLine(fee: FeeBreakdown): string {
    if (!fee.actualDisplay) return 'Taxa: indisponivel';
    return `Taxa: ${fee.actualDisplay}`;
  }

  private static traditionalFeeLine(fee: FeeBreakdown): string {
    const traditionalBrl = Number(fee.traditionalFeeBrl || 0);
    const traditionalUsdc = Number(fee.traditionalFeeUsdc || 0);
    if (!Number.isFinite(traditionalBrl) || traditionalBrl <= 0 || !Number.isFinite(traditionalUsdc) || traditionalUsdc <= 0) {
      return '';
    }
    return `Taxa estimada em métodos tradicionais: ${this.formatSmallFiat(traditionalBrl, 'BRL')} / ${this.formatSmallFiat(traditionalUsdc, 'USDC')}`;
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

    if (sourceAsset === 'BRL' && destinationAsset === 'USDC' && sourceAmount > 0 && destinationAmount > 0) {
      return sourceAmount / destinationAmount;
    }
    if (sourceAsset === 'USDC' && destinationAsset === 'BRL' && sourceAmount > 0 && destinationAmount > 0) {
      return destinationAmount / sourceAmount;
    }

    const fallback = Number(String(process.env.USD_BRL_FALLBACK_RATE || process.env.DEFAULT_USD_BRL_RATE || '').replace(',', '.'));
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
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

    const actualFeeBrlFromPayload = this.toPositiveNumber(unifiedFee.fee_brl || input.feeBrl || parsedDisplay.brl);
    const actualFeeUsdcFromPayload = this.toPositiveNumber(unifiedFee.fee_usdc || input.feeUsdc || parsedDisplay.usdc);
    let actualDisplay = String(unifiedFee.display || display || '').trim();
    const traditionalFeePct = EconomyEngineService.traditionalFeePct();
    const usdBrl = this.resolveUsdBrlRate(input, actualFeeBrlFromPayload, actualFeeUsdcFromPayload);
    const actualFeeBrl = actualFeeBrlFromPayload || (actualFeeUsdcFromPayload > 0 && usdBrl > 0
      ? actualFeeUsdcFromPayload * usdBrl
      : 0);
    const actualFeeUsdc = actualFeeUsdcFromPayload || (actualFeeBrl > 0 && usdBrl > 0
      ? actualFeeBrl / usdBrl
      : 0);
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

  private static settlementLine(settlementMs?: number | null): string {
    const ms = Number(settlementMs || 0);
    if (!Number.isFinite(ms) || ms <= 0) return 'Liquidação: confirmada';
    return `Liquidação: ${(ms / 1000).toFixed(1)}s`;
  }

  private static timeLine(completedAt?: string | null): string {
    const timestamp = completedAt ? Date.parse(completedAt) : Date.now();
    const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
    return `Horário: ${date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  }
}
