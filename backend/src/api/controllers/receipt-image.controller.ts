import { Request, Response } from 'express';
import crypto from 'crypto';
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

  if (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('payment_logs') || message.includes('schema cache')) {
      return null;
    }
    throw error;
  }
  return data || null;
}

async function findPaymentConfirmationByHash(txHash: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('payment_confirmations')
    .select('*')
    .eq('payment_hash', txHash)
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('payment_confirmations') || message.includes('schema cache')) {
      return null;
    }
    throw error;
  }
  return data || null;
}

async function findStoredReceiptImage(code: string): Promise<any | null> {
  const normalized = String(code || '').trim();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('receipt_images')
    .select('code, image_data_url, image_mime, tx_hash, operation_id, expires_at, created_at')
    .eq('code', normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('receipt_images') || message.includes('schema cache')) {
      return null;
    }
    throw error;
  }

  if (!data?.image_data_url) return null;
  const expiresAt = data.expires_at ? Date.parse(String(data.expires_at)) : 0;
  if (expiresAt && Number.isFinite(expiresAt) && expiresAt < Date.now()) return null;
  return data;
}

async function findLegacyShortReceiptImage(code: string): Promise<any | null> {
  const normalized = String(code || '').trim();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('short_links')
    .select('url, expires_at, created_at')
    .eq('code', normalized)
    .eq('purpose', 'receipt_image')
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('short_links') || message.includes('schema cache')) {
      return null;
    }
    throw error;
  }

  const url = String(data?.url || '').trim();
  if (!/^data:image\//i.test(url)) return null;
  const expiresAt = data?.expires_at ? Date.parse(String(data.expires_at)) : 0;
  if (expiresAt && Number.isFinite(expiresAt) && expiresAt < Date.now()) return null;
  return { image_data_url: url, image_mime: url.startsWith('data:image/png') ? 'image/png' : 'image/svg+xml', created_at: data?.created_at };
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

function paymentDataFromConfirmation(row: any, txHash: string): HostedReceiptPaymentData {
  const details = row?.details || {};
  const transferDetails = details?.transferDetails || {};
  return {
    tx_hash: txHash,
    amount: String(transferDetails?.destinationAmount || row?.amount || ''),
    asset: String(transferDetails?.destinationAssetCode || details?.destination_asset_code || row?.asset_code || 'USDC'),
    destination: String(row?.destination_name || row?.destination || details?.recipient_name || ''),
    sender: String(details?.sender_name || row?.user_id || 'TalkToStellar'),
    completed_at: String(row?.completed_at || row?.used_at || row?.created_at || new Date().toISOString()),
    fee: String(transferDetails?.feeDisplay || transferDetails?.totalFeeDisplay || transferDetails?.feeXlm || ''),
    estimated_savings: String(details?.savings?.estimated_savings || details?.savings?.estimatedSavings || ''),
  };
}

function paymentDataFromHash(txHash: string): HostedReceiptPaymentData {
  return {
    tx_hash: txHash,
    amount: '',
    asset: '',
    destination: 'Destinatário',
    sender: 'TalkToStellar',
    completed_at: new Date().toISOString(),
    fee: 'Indisponível',
    estimated_savings: '',
  };
}

async function resolvePaymentData(txHash: string): Promise<HostedReceiptPaymentData | null> {
  if (!txHash) return null;

  const paymentLog = await findPaymentByHash(txHash);
  if (paymentLog) return paymentDataFromLog(paymentLog, txHash);

  const confirmation = await findPaymentConfirmationByHash(txHash);
  if (confirmation) return paymentDataFromConfirmation(confirmation, txHash);

  // Last-resort compatibility for old receipt links: render a downloadable receipt
  // with the operation id instead of returning a dead page.
  return paymentDataFromHash(txHash);
}

async function persistGeneratedReceiptByHash(txHash: string, paymentData: HostedReceiptPaymentData, imageBase64: string) {
  if (!txHash) return;

  const code = crypto.createHash('sha256').update(`receipt:${txHash}`).digest('base64url').slice(0, 10);
  const operationId = PaymentReceiptService.toPublicOperationId(txHash) || '';
  const imageDataUrl = `data:image/png;base64,${imageBase64}`;
  const tokenHash = crypto.createHash('sha256').update(`receipt:${code}:${operationId || txHash}`).digest('hex');

  const receiptInsert = await supabase
    .from('receipt_images')
    .upsert({
      code,
      operation_id: operationId || null,
      tx_hash: txHash,
      session_id: null,
      user_id: null,
      receipt_type: null,
      image_data_url: imageDataUrl,
      image_mime: 'image/png',
      metadata: {
        amount: paymentData.amount || '',
        asset: paymentData.asset || '',
        destination: paymentData.destination || '',
        sender: paymentData.sender || '',
        completed_at: paymentData.completed_at || '',
        fee: paymentData.fee || '',
      },
      expires_at: null,
      created_at: new Date().toISOString(),
    }, { onConflict: 'code' });

  if (receiptInsert.error) {
    const message = String(receiptInsert.error?.message || '').toLowerCase();
    if (!message.includes('receipt_images') && !message.includes('schema cache')) {
      throw receiptInsert.error;
    }
  }

  const shortLinkUpsert = await supabase
    .from('short_links')
    .upsert({
      code,
      url: imageDataUrl,
      purpose: 'receipt_image',
      token_hash: tokenHash,
      session_id: null,
      user_id: null,
      expires_at: null,
      created_at: new Date().toISOString(),
    }, { onConflict: 'code' });

  if (shortLinkUpsert.error) {
    const message = String(shortLinkUpsert.error?.message || '').toLowerCase();
    if (!message.includes('short_links') && !message.includes('schema cache')) {
      throw shortLinkUpsert.error;
    }
  }
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
  static async viewer(req: Request, res: Response) {
    try {
      const code = String(req.params.code || '').trim();
      const stored = await findStoredReceiptImage(code);
      const legacy = stored || await findLegacyShortReceiptImage(code);
      if (!legacy) {
        return res.status(404).json({
          success: false,
          message: 'Comprovante não encontrado. Confira o link ou solicite um novo comprovante.',
        });
      }

      return res.status(200).json({
        success: true,
        url: legacy.image_data_url,
        imageDataUrl: legacy.image_data_url,
        imageMime: legacy.image_mime || 'image/svg+xml',
        txHash: legacy.tx_hash || null,
        operationId: legacy.operation_id || null,
        createdAt: legacy.created_at || null,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || String(error),
      });
    }
  }

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
    const txHash = String(req.params.tx_hash || '').trim();
    try {
      if (!txHash) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(notFoundPage());
      }
      const paymentData = await resolvePaymentData(txHash) || paymentDataFromHash(txHash);

      const imageBase64 = ReceiptImageService.generateReceiptImageBase64(paymentData);
      await persistGeneratedReceiptByHash(txHash, paymentData, imageBase64).catch(() => {});
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(200).send(receiptPage({ paymentData, imageBase64, txHash }));
    } catch (error: any) {
      if (txHash) {
        try {
          const fallback = paymentDataFromHash(txHash);
          const imageBase64 = ReceiptImageService.generateReceiptImageBase64(fallback);
          await persistGeneratedReceiptByHash(txHash, fallback, imageBase64).catch(() => {});
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=300');
          return res.status(200).send(receiptPage({ paymentData: fallback, imageBase64, txHash }));
        } catch {
          // ignore and return error page below
        }
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(500).send(notFoundPage().replace('Comprovante não encontrado', escapeHtml(error?.message || String(error))));
    }
  }

  static async download(req: Request, res: Response) {
    const txHash = String(req.params.tx_hash || '').trim();
    try {
      if (!txHash) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(404).send(notFoundPage());
      }
      const paymentData = await resolvePaymentData(txHash) || paymentDataFromHash(txHash);

      const png = ReceiptImageService.generateReceiptImage(paymentData);
      await persistGeneratedReceiptByHash(txHash, paymentData, png.toString('base64')).catch(() => {});
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
