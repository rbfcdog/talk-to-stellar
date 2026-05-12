import { supabase } from '../../config/supabase';
import crypto from 'crypto';
import { AgentRepository } from '../../repositories/agent.repository';
import { logger } from '../../utils/logger';
import { buildUnifiedFeeDisplay, formatCustomerAssetAmount, formatNetworkFeeForCustomer } from '../../utils/fee-display';
import { buildUsedQuoteLabel } from '../../utils/quote-display';
import { TransferNotificationService } from './transfer-notification.service';
import { ReceiptImageService } from './receipt-image.service';

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
};

export class PaymentReceiptService {
  private static agentRepo = new AgentRepository(supabase);

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
        text,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[receipt] failed to deliver receipt: ${message}`);
    }

    return text;
  }

  static async buildReceiptImageSvg(input: PaymentReceiptInput): Promise<string> {
    const sourceAmount = String(input.sourceAmount || input.destinationAmount || '').trim();
    const sourceAssetCode = String(input.sourceAssetCode || input.destinationAssetCode || '').trim().toUpperCase();
    const feeLine = await this.feeLine(input);
    const feeLabel = feeLine.replace(/^Taxa exata:\s*/i, '').trim();

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
    const feeLine = await this.feeLine(input);
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
    const settlementLine = this.settlementLine(input.settlementMs);
    const savingsLine = this.savingsLine(input.savings);
    const timeLine = this.timeLine(input.completedAt);
    const publicOperationId = this.toPublicOperationId(input.hash);
    const status = String(input.status || 'Confirmado').trim();

    return [
      operationLine,
      `Status: ${status}`,
      quoteLine,
      feeLine,
      savingsLine,
      settlementLine,
      timeLine,
      publicOperationId ? `ID da operação: ${publicOperationId}` : 'ID da operação: em processamento',
      '',
      'Recibo registrado no seu histórico.',
    ].filter((line) => line !== '').join('\n');
  }

  private static savingsLine(savings?: PaymentReceiptInput['savings']): string {
    const value = Number(String(savings?.estimatedSavings || '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return '';
    return `Economia estimada: R$ ${value.toFixed(2)} em relação a métodos tradicionais.`;
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
    return `Você enviou ${destinationLabel} para ${target}.`;
  }

  private static async feeLine(input: PaymentReceiptInput): Promise<string> {
    const exactFeeXlm = String(input.feeXlm || '').trim();
    const display = String(input.feeDisplay || '').trim();
    if (display && !/\bXLM\b/i.test(display)) return `Taxa exata: ${display}`;
    if (exactFeeXlm) {
      const networkFee = await formatNetworkFeeForCustomer(exactFeeXlm);
      const unifiedFee = buildUnifiedFeeDisplay({
        networkFee,
        platformFeeAmount: input.quote?.platformFee?.feeAmount || null,
        platformFeeAssetCode: input.quote?.platformFee?.feeAssetCode || null,
        sourceAssetCode: input.sourceAssetCode || null,
        destinationAssetCode: input.destinationAssetCode || null,
      });
      if (unifiedFee.display) return `Taxa exata: ${unifiedFee.display}`;
    }
    return 'Taxa exata: indisponivel';
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
