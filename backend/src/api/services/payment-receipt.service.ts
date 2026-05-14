import { supabase } from '../../config/supabase';
import crypto from 'crypto';
import { AgentRepository } from '../../repositories/agent.repository';
import { logger } from '../../utils/logger';
import { buildUnifiedFeeDisplay, formatCustomerAssetAmount, formatNetworkFeeForCustomer } from '../../utils/fee-display';
import { buildUsedQuoteLabel } from '../../utils/quote-display';
import { TransferNotificationService } from './transfer-notification.service';
import { ReceiptImageService } from './receipt-image.service';
import { EconomyEngineService } from './economy-engine.service';
import { PlatformFeeService } from './platform-fee.service';

type ReceiptType = 'payment_sent' | 'payment_received' | 'conversion' | 'claim_redeemed';

export type PaymentReceiptInput = {
  type: ReceiptType;
  sessionId: string;
  userId: string;
  provider?: string | null;
  providerUserId?: string | null;
  counterpartyLabel?: string | null;
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

  static async sendReceipt(input: PaymentReceiptInput): Promise<string> {
    const text = await this.buildReceiptText(input);
    let imageDataUrl = '';
    let viewerUrl = '';
    const operationId = this.toPublicOperationId(input.hash);
    const receiptDedupeKey = `receipt:${input.sessionId}:${operationId || input.hash || `${input.type}:${input.destinationAmount}:${input.destinationAssetCode}`}`;

    try {
      await this.saveReceiptMessage({
        sessionId: input.sessionId,
        content: text,
        dedupeKey: `${receiptDedupeKey}:text`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to save receipt message: ${message}`);
    }

    try {
      const svg = await this.buildReceiptImageSvg(input);
      imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
      viewerUrl = await this.createReceiptViewerUrl({
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
          completedAt: input.completedAt || null,
        },
      });
      await this.saveReceiptMessage({
        sessionId: input.sessionId,
        content: `RECEIPT_IMAGE_DATA_URL:${imageDataUrl}`,
        dedupeKey: `${receiptDedupeKey}:image`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to save receipt image: ${message}`);
    }

    try {
      await TransferNotificationService.notifyExternalChannelMessage({
        sessionId: input.sessionId,
        userId: input.userId,
        provider: input.provider,
        providerUserId: input.providerUserId,
        text: viewerUrl ? `${text}\nRecibo online: ${viewerUrl}` : text,
        buttonText: viewerUrl ? 'Abrir recibo e baixar' : null,
        buttonUrl: viewerUrl || null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to deliver receipt: ${message}`);
    }

    return viewerUrl || '';
  }

  static async buildReceiptImageSvg(input: PaymentReceiptInput): Promise<string> {
    const sourceAmount = String(input.sourceAmount || input.destinationAmount || '').trim();
    const sourceAssetCode = String(input.sourceAssetCode || input.destinationAssetCode || '').trim().toUpperCase();
    const fee = await this.resolveFeeBreakdown(input);
    const feeLabel = fee.actualDisplay || 'indisponivel';

    return ReceiptImageService.toSvg(
      ReceiptImageService.fromPaymentReceipt({
        destinationAmount: String(input.destinationAmount || ''),
        destinationAssetCode: String(input.destinationAssetCode || ''),
        counterpartyLabel: String(input.counterpartyLabel || 'destinatário'),
        sourceAmount,
        sourceAssetCode,
        feeDisplay: feeLabel,
        settlementMs: input.settlementMs || null,
        completedAt: input.completedAt || null,
        hash: input.hash || null,
        quote: input.quote,
        savings: input.savings,
        contextMessage: input.contextMessage || null,
      })
    );
  }

  static async buildReceiptText(input: PaymentReceiptInput): Promise<string> {
    const sourceAmount = String(input.sourceAmount || input.destinationAmount || '').trim();
    const sourceAssetCode = String(input.sourceAssetCode || input.destinationAssetCode || '').trim().toUpperCase();
    const destinationAmount = String(input.destinationAmount || '').trim();
    const destinationAssetCode = String(input.destinationAssetCode || '').trim().toUpperCase();
    const sourceLabel = formatCustomerAssetAmount(sourceAmount, sourceAssetCode);
    const destinationLabel = formatCustomerAssetAmount(destinationAmount, destinationAssetCode);
    const counterparty = String(input.counterpartyLabel || '').trim();
    const operationLine = this.operationLine(input.type, sourceLabel, destinationLabel, counterparty);
    const hasConversion = sourceAssetCode !== destinationAssetCode;
    const quoteLine = hasConversion
      ? buildUsedQuoteLabel({
          quote: input.quote,
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
    const cumulativeSavingsLine = await this.cumulativeSavingsLine(input);
    const timeLine = this.timeLine(input.completedAt);
    const publicOperationId = this.toPublicOperationId(input.hash);
    const status = String(input.status || 'Confirmado').trim();
    const nicknamePrompt = this.transactionNicknamePrompt(input.type);
    const contextLine = this.contextLine(input.contextMessage);

    return [
      operationLine,
      `Status: ${status}`,
      contextLine,
      quoteLine,
      feeLine,
      traditionalFeeLine,
      savingsLine,
      cumulativeSavingsLine,
      settlementLine,
      timeLine,
      publicOperationId ? `ID da operação: ${publicOperationId}` : 'ID da operação: em processamento',
      '',
      'Recibo registrado no seu histórico.',
      nicknamePrompt,
    ].filter((line) => line !== '').join('\n');
  }

  private static contextLine(contextMessage?: string | null): string {
    const raw = String(contextMessage || '').trim();
    if (!raw) return '';
    const sanitized = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!sanitized) return '';
    return `Mensagem: ${sanitized}`;
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
    const sourceCode = String(sourceLabel || '').trim();
    const destinationCode = String(destinationLabel || '').trim();
    if (sourceCode && destinationCode && sourceCode !== destinationCode) {
      return `Você converteu ${sourceLabel} para ${destinationLabel} e enviou para ${target}.`;
    }
    return `Você enviou ${destinationLabel} para ${target}.`;
  }

  private static transactionNicknamePrompt(type: ReceiptType): string {
    if (type !== 'payment_sent' && type !== 'claim_redeemed') return '';
    return 'Quer dar um nome para esta transação para encontrar depois? Exemplo: "apelido da transação: pagamento logo setembro".';
  }

  private static feeLine(fee: FeeBreakdown): string {
    if (!fee.actualDisplay) return 'Taxa exata: indisponivel';
    const scope = fee.platformApplied ? 'rede + spread' : 'rede';
    return `Taxa exata (${scope}): ${fee.actualDisplay}`;
  }

  private static traditionalFeeLine(fee: FeeBreakdown): string {
    const traditionalBrl = Number(fee.traditionalFeeBrl || 0);
    const traditionalUsdc = Number(fee.traditionalFeeUsdc || 0);
    if (!Number.isFinite(traditionalBrl) || traditionalBrl <= 0 || !Number.isFinite(traditionalUsdc) || traditionalUsdc <= 0) {
      return '';
    }
    const pct = (Math.max(0, fee.traditionalFeePct) * 100).toFixed(2);
    return `Taxa tradicional estimada (.env ${pct}%): ${this.formatSmallFiat(traditionalBrl, 'BRL')} / ${this.formatSmallFiat(traditionalUsdc, 'USDC')}`;
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

  private static formatSmallFiat(value: number, asset: 'BRL' | 'USDC'): string {
    const symbol = asset === 'BRL' ? 'R$' : 'US$';
    const decimals = value > 0 && value < 0.01 ? 6 : 2;
    return `${symbol} ${value.toFixed(decimals)}`;
  }

  private static resolveUsdBrlRate(input: PaymentReceiptInput, feeBrl?: number, feeUsdc?: number): number {
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

    const fallback = Number(String(process.env.USD_BRL_FALLBACK_RATE || '').replace(',', '.'));
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
    return 5;
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
    const sourceAssetCode = String(input.sourceAssetCode || input.destinationAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const destinationAssetCode = String(input.destinationAssetCode || input.sourceAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');

    let platformFeeAmount = String(input.quote?.platformFee?.feeAmount || '').trim();
    let platformFeeAssetCode = String(input.quote?.platformFee?.feeAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    if (!platformFeeAmount || !platformFeeAssetCode) {
      const spread = PlatformFeeService.calculateSpread({
        sourceAmount,
        sourceAssetCode,
        destinationAssetCode,
        mode: 'deduct_from_source',
      });
      if (spread.enabled && this.toPositiveNumber(spread.feeAmount) > 0) {
        platformFeeAmount = spread.feeAmount;
        platformFeeAssetCode = spread.feeAssetCode;
      }
    }

    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee,
      platformFeeAmount: platformFeeAmount || null,
      platformFeeAssetCode: platformFeeAssetCode || null,
      sourceAssetCode: sourceAssetCode || null,
      destinationAssetCode: destinationAssetCode || null,
    });

    const actualFeeBrl = this.toPositiveNumber(unifiedFee.fee_brl || input.feeBrl || parsedDisplay.brl);
    const actualFeeUsdc = this.toPositiveNumber(unifiedFee.fee_usdc || input.feeUsdc || parsedDisplay.usdc);
    const actualDisplay = String(unifiedFee.display || display || '').trim();
    const traditionalFeePct = EconomyEngineService.traditionalFeePct();

    const grossAmountBrl = EconomyEngineService.estimateAmountInBrl({
      amount: sourceAmount,
      assetCode: sourceAssetCode,
      quote: input.quote,
    });

    const savingsFromPayload = this.toPositiveNumber(input.savings?.estimatedSavings);
    const traditionalFeeBrl = savingsFromPayload > 0 && actualFeeBrl > 0
      ? actualFeeBrl + savingsFromPayload
      : (grossAmountBrl > 0 ? grossAmountBrl * traditionalFeePct : 0);

    const usdBrl = this.resolveUsdBrlRate(input, actualFeeBrl, actualFeeUsdc);
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
