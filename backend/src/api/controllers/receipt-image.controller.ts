import { Request, Response } from 'express';
import { ReceiptImageService } from '../services/receipt-image.service';

export class ReceiptImageController {
  static async render(req: Request, res: Response) {
    try {
      const payload = req.body || {};
      const svg = ReceiptImageService.toSvg({
        amount: String(payload.amount || ''),
        currency: String(payload.currency || 'US$'),
        subtitle: String(payload.subtitle || 'Pagamento internacional enviado com sucesso'),
        recipientName: String(payload.recipient_name || payload.recipientName || ''),
        description: String(payload.description || ''),
        convertedAmount: String(payload.converted_amount || payload.convertedAmount || ''),
        convertedCurrency: String(payload.converted_currency || payload.convertedCurrency || 'R$'),
        feeLabel: String(payload.fee || payload.feeLabel || ''),
        quoteLabel: String(payload.quote || payload.quoteLabel || ''),
        settlementSeconds: Number(payload.settlement_seconds || payload.settlementSeconds || 0),
        completedAt: String(payload.completed_at || payload.completedAt || ''),
        operationId: String(payload.operation_id || payload.operationId || ''),
        balanceLabel: String(payload.balance_remaining || payload.balanceRemaining || payload.balanceLabel || ''),
        statusBadge: String(payload.status_badge || payload.statusBadge || 'Transferência concluída'),
        instantBadge: String(payload.instant_badge || payload.instantBadge || 'Liquidado instantaneamente'),
        protectedBadge: String(payload.protected_badge || payload.protectedBadge || 'Protegido'),
      });

      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(svg);
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || String(error),
      });
    }
  }
}

