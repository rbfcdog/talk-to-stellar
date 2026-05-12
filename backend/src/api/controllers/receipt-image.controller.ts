import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ReceiptImageService, HostedReceiptPaymentData } from '../services/receipt-image.service';
import { PaymentReceiptService } from '../services/payment-receipt.service';

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shortHash(value: string, left = 8, right = 8): string {
  const hash = String(value || '').trim();
  if (hash.length <= left + right + 3) return hash;
  if (right <= 0) return hash.slice(0, left);
  return `${hash.slice(0, left)}...${hash.slice(-right)}`;
}

function formatDatePtBr(value?: string | null): string {
  const timestamp = value ? Date.parse(value) : Date.now();
  const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatFee(row: any): string {
  const metadataFee =
    row?.metadata?.transferDetails?.feeDisplay ||
    row?.metadata?.transferDetails?.totalFeeDisplay ||
    '';
  if (metadataFee) return String(metadataFee);
  const feeXlm = String(row?.fee_xlm || '').trim();
  return feeXlm ? `${feeXlm} XLM` : 'Indisponível';
}

async function findPaymentByHash(txHash: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('payment_logs')
    .select('*')
    .eq('payment_hash', txHash)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function paymentDataFromLog(row: any, txHash: string): HostedReceiptPaymentData {
  return {
    tx_hash: txHash,
    amount: String(row?.destination_amount || row?.amount || ''),
    asset: String(row?.destination_asset_code || row?.asset || 'XLM'),
    destination: String(row?.destination_public_key || row?.destination || ''),
    sender: String(row?.source_public_key || row?.sender || 'TalkToStellar'),
    completed_at: String(row?.completed_at || row?.created_at || new Date().toISOString()),
    fee: formatFee(row),
    estimated_savings: String(row?.estimated_savings || row?.metadata?.savings?.estimated_savings || ''),
  };
}

function notFoundPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Comprovante TalkToStellar</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0a0a0a; color: #f5f5f5; font-family: Arial, sans-serif; }
    main { width: min(480px, calc(100vw - 32px)); border-radius: 20px; background: #f8fafc; color: #111827; padding: 28px; text-align: center; box-sizing: border-box; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0; color: #4b5563; }
  </style>
</head>
<body><main><h1>Comprovante não encontrado</h1><p>Confira o link ou solicite um novo comprovante.</p></main></body>
</html>`;
}

function receiptPage(input: { paymentData: HostedReceiptPaymentData; imageBase64: string; txHash: string }): string {
  const downloadHref = `/api/external/receipts/${encodeURIComponent(input.txHash)}/download`;
  const operationId = PaymentReceiptService.toPublicOperationId(input.txHash) || shortHash(input.txHash);
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Comprovante TalkToStellar</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #0a0a0a; color: #111827; font-family: Arial, sans-serif; display: grid; place-items: center; padding: 24px 16px; }
    .wrap { width: min(480px, 100%); }
    .card { width: 100%; overflow: hidden; border-radius: 22px; background: #f8fafc; box-shadow: 0 22px 80px rgba(0,0,0,.45); }
    .content { padding: 26px; }
    .brand { color: #111827; font-size: 20px; font-weight: 800; letter-spacing: .01em; }
    .check { width: 54px; height: 54px; display: grid; place-items: center; margin: 18px auto 10px; border-radius: 999px; background: #dcfce7; color: #15803d; font-size: 16px; font-weight: 800; }
    h1 { margin: 0 0 22px; text-align: center; font-size: 24px; color: #111827; }
    .receipt { width: 100%; border-radius: 16px; background: #111827; display: block; }
    dl { margin: 22px 0; display: grid; gap: 12px; }
    .row { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
    dt { color: #6b7280; font-size: 13px; }
    dd { margin: 0; min-width: 0; color: #111827; font-size: 14px; font-weight: 700; text-align: right; overflow-wrap: anywhere; }
    .button { display: block; width: 100%; border-radius: 14px; background: #111827; color: #fff; padding: 15px 18px; text-align: center; text-decoration: none; font-weight: 800; }
    @media (max-width: 420px) { .content { padding: 20px; } h1 { font-size: 21px; } }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="content">
        <div class="brand">TalkToStellar</div>
        <div class="check">OK</div>
        <h1>Comprovante TalkToStellar</h1>
        <img class="receipt" src="data:image/png;base64,${input.imageBase64}" alt="Comprovante TalkToStellar" />
        <dl>
          <div class="row"><dt>De</dt><dd>${escapeHtml(shortHash(input.paymentData.sender, 6, 6))}</dd></div>
          <div class="row"><dt>Para</dt><dd>${escapeHtml(shortHash(input.paymentData.destination, 6, 6))}</dd></div>
          <div class="row"><dt>Valor</dt><dd>${escapeHtml(input.paymentData.amount)} ${escapeHtml(input.paymentData.asset)}</dd></div>
          <div class="row"><dt>Taxa</dt><dd>${escapeHtml(input.paymentData.fee || 'Indisponível')}</dd></div>
          <div class="row"><dt>Data</dt><dd>${escapeHtml(formatDatePtBr(input.paymentData.completed_at))}</dd></div>
          <div class="row"><dt>ID da operação</dt><dd>${escapeHtml(operationId)}</dd></div>
        </dl>
        <a class="button" href="${downloadHref}" download>Baixar comprovante</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

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

  static async show(req: Request, res: Response) {
    try {
      const txHash = String(req.params.tx_hash || '').trim();
      const row = txHash ? await findPaymentByHash(txHash) : null;
      if (!row) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(notFoundPage());
      }

      const paymentData = paymentDataFromLog(row, txHash);
      const imageBase64 = ReceiptImageService.generateReceiptImageBase64(paymentData);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).send(receiptPage({ paymentData, imageBase64, txHash }));
    } catch (error: any) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(notFoundPage().replace('Comprovante não encontrado', escapeHtml(error?.message || String(error))));
    }
  }

  static async download(req: Request, res: Response) {
    try {
      const txHash = String(req.params.tx_hash || '').trim();
      const row = txHash ? await findPaymentByHash(txHash) : null;
      if (!row) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(notFoundPage());
      }

      const paymentData = paymentDataFromLog(row, txHash);
      const png = ReceiptImageService.generateReceiptImage(paymentData);
      const short = shortHash(txHash, 8, 0).replace(/\W+/g, '');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="comprovante-${short || 'talktostellar'}.png"`);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).send(png);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || String(error) });
    }
  }
}
