import { PaymentReceiptService } from './payment-receipt.service';

export type ReceiptImageInput = {
  amount: string;
  currency: string;
  subtitle?: string;
  recipientName?: string;
  description?: string;
  convertedAmount?: string;
  convertedCurrency?: string;
  feeLabel?: string;
  quoteLabel?: string;
  settlementSeconds?: number | null;
  completedAt?: string | null;
  operationId?: string | null;
  balanceLabel?: string;
  statusBadge?: string;
  instantBadge?: string;
  protectedBadge?: string;
  savingsLabel?: string;
  savingsPercentLabel?: string;
};

function toNumber(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function truncate(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.trunc(value * factor) / factor;
}

function formatDisplayAmount(value: unknown, decimals = 2): string {
  const number = truncate(toNumber(value), decimals);
  return number.toFixed(decimals);
}

function displaySymbol(assetCode: string): string {
  const code = String(assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  if (code === 'USDC') return 'US$';
  if (code === 'BRL') return 'R$';
  return `${code} `;
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDatePtBr(value?: string | null): string {
  const ts = value ? Date.parse(value) : Date.now();
  const date = Number.isFinite(ts) ? new Date(ts) : new Date();
  const parts = date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return parts.replace('.', '');
}

function qrPattern(seed: string): string {
  const source = String(seed || 'TTS').trim();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const cells: string[] = [];
  const size = 9;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const bit = ((hash >>> ((x + y * size) % 24)) & 1) === 1;
      if (bit || x < 2 && y < 2 || x > 6 && y < 2 || x < 2 && y > 6) {
        cells.push(`<rect x="${x * 6}" y="${y * 6}" width="5" height="5" rx="1" fill="#E6ECFF"/>`);
      }
    }
  }
  return cells.join('');
}

export class ReceiptImageService {
  static toSvg(input: ReceiptImageInput): string {
    const opId = String(input.operationId || '').trim() || 'TTS-PENDING';
    const statusBadge = String(input.statusBadge || 'Transferência concluída').trim();
    const instantBadge = String(input.instantBadge || 'Liquidado instantaneamente').trim();
    const protectedBadge = String(input.protectedBadge || 'Protegido').trim();
    const amount = escapeXml(`${input.currency}${input.amount}`);
    const subtitle = escapeXml(String(input.subtitle || 'Pagamento internacional enviado com sucesso'));
    const recipient = escapeXml(String(input.recipientName || 'Destinatário'));
    const description = escapeXml(String(input.description || 'Transferência internacional'));
    const converted = escapeXml(`${input.convertedCurrency || 'R$'}${input.convertedAmount || '-'}`);
    const fee = escapeXml(String(input.feeLabel || '-'));
    const quote = escapeXml(String(input.quoteLabel || '-'));
    const settlement = Number.isFinite(Number(input.settlementSeconds || 0))
      ? `${Number(input.settlementSeconds || 0).toFixed(1)} segundos`
      : 'confirmada';
    const dateLabel = escapeXml(formatDatePtBr(input.completedAt));
    const savingsLabel = escapeXml(String(input.savingsLabel || 'R$ 0,00'));
    const savingsPercentLabel = escapeXml(String(input.savingsPercentLabel || 'menor que métodos tradicionais'));
    const safeOpId = escapeXml(opId);

    const lines = [
      ['Destinatário', recipient],
      ['Descrição', description],
      ['Valor convertido', converted],
      ['Taxa', fee],
      ['Cotação', quote],
      ['Liquidação', settlement],
      ['Data', dateLabel],
      ['ID', safeOpId],
    ];

    const rows = lines.map((line, index) => {
      const y = 500 + index * 44;
      return [
        `<text x="64" y="${y}" fill="#94A1C8" font-size="20" font-family="Inter, system-ui, sans-serif">${line[0]}</text>`,
        `<text x="658" y="${y}" text-anchor="end" fill="#F4F7FF" font-size="22" font-weight="600" font-family="Inter, system-ui, sans-serif">${line[1]}</text>`,
        index < lines.length - 1
          ? `<line x1="64" y1="${y + 20}" x2="658" y2="${y + 20}" stroke="#1B2545" stroke-width="1"/>`
          : '',
      ].join('');
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F1731"/>
      <stop offset="100%" stop-color="#0B1020"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.09)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.03)"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="22" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="720" height="1280" fill="url(#bg)"/>

  <rect x="36" y="40" width="648" height="1200" rx="40" fill="#0F1731" opacity="0.5"/>
  <rect x="44" y="48" width="632" height="1184" rx="36" fill="url(#card)" stroke="#22315C" stroke-width="1.5" filter="url(#shadow)"/>

  <text x="78" y="106" fill="#F4F7FF" font-size="28" font-weight="700" font-family="Inter, system-ui, sans-serif">TalkTo</text>
  <rect x="438" y="72" width="206" height="42" rx="21" fill="#143A2D" stroke="#2FA070" stroke-width="1"/>
  <text x="541" y="99" text-anchor="middle" fill="#7EE2B8" font-size="17" font-weight="600" font-family="Inter, system-ui, sans-serif">${escapeXml(statusBadge)}</text>

  <circle cx="360" cy="196" r="42" fill="#163D2D" stroke="#2CCB84" stroke-width="2"/>
  <path d="M341 196 L356 210 L382 184" fill="none" stroke="#A7FFD6" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>

  <text x="360" y="294" text-anchor="middle" fill="#F8FBFF" font-size="72" font-weight="800" font-family="Inter, system-ui, sans-serif">${amount}</text>
  <text x="360" y="336" text-anchor="middle" fill="#9FB0DB" font-size="24" font-family="Inter, system-ui, sans-serif">${subtitle}</text>

  <rect x="64" y="356" width="594" height="96" rx="18" fill="#101B34" stroke="#2B406F" stroke-width="1"/>
  <text x="92" y="397" fill="#8DA0CB" font-size="18" font-family="Inter, system-ui, sans-serif">Economia estimada</text>
  <text x="92" y="431" fill="#95FFD1" font-size="36" font-weight="800" font-family="Inter, system-ui, sans-serif">${savingsLabel}</text>
  <text x="628" y="421" text-anchor="end" fill="#B8C8EE" font-size="17" font-weight="600" font-family="Inter, system-ui, sans-serif">${savingsPercentLabel}</text>
  <text x="64" y="478" fill="#7C8BB3" font-size="14" font-family="Inter, system-ui, sans-serif">comparado a métodos tradicionais</text>

  ${rows}

  <rect x="64" y="930" width="274" height="40" rx="20" fill="#152642" stroke="#254273" stroke-width="1"/>
  <text x="201" y="956" text-anchor="middle" fill="#B8C8EE" font-size="16" font-weight="600" font-family="Inter, system-ui, sans-serif">${escapeXml(instantBadge)}</text>

  <rect x="356" y="930" width="132" height="40" rx="20" fill="#183A2C" stroke="#2A8F66" stroke-width="1"/>
  <text x="422" y="956" text-anchor="middle" fill="#8EF0C6" font-size="16" font-weight="600" font-family="Inter, system-ui, sans-serif">${escapeXml(protectedBadge)}</text>

  <rect x="542" y="912" width="116" height="116" rx="16" fill="#0D1328" stroke="#26365F"/>
  <g transform="translate(560 930)">
    ${qrPattern(opId)}
  </g>

  <text x="64" y="1060" fill="#7082B0" font-size="14" font-family="Inter, system-ui, sans-serif">Estimativa baseada em taxas internacionais médias.</text>
  <text x="64" y="1086" fill="#5F719D" font-size="13" font-family="Inter, system-ui, sans-serif">Recibo registrado no seu histórico.</text>
</svg>`;
  }

  static toBuffer(input: ReceiptImageInput): Buffer {
    return Buffer.from(this.toSvg(input), 'utf-8');
  }

  static fromPaymentReceipt(input: {
    destinationAmount: string;
    destinationAssetCode: string;
    counterpartyLabel?: string;
    sourceAmount?: string;
    sourceAssetCode?: string;
    feeDisplay?: string;
    savings?: { estimatedSavings?: number | string | null; savingsPercentage?: number | string | null } | null;
    settlementMs?: number | null;
    completedAt?: string | null;
    hash?: string | null;
    quote?: any;
  }): ReceiptImageInput {
    const opId = PaymentReceiptService.toPublicOperationId(input.hash);
    const quoteSource = String(input.quote?.sourceAmount || input.sourceAmount || '').trim();
    const quoteSourceAsset = String(input.quote?.sourceAsset?.code || input.sourceAssetCode || '').trim().toUpperCase();
    const quoteDest = String(input.quote?.destinationAmount || input.destinationAmount || '').trim();
    const quoteDestAsset = String(input.quote?.destinationAsset?.code || input.destinationAssetCode || '').trim().toUpperCase();
    const estimatedSavings = Number(String(input.savings?.estimatedSavings || '').replace(',', '.'));
    const savingsPercentage = Number(String(input.savings?.savingsPercentage || '').replace(',', '.'));

    return {
      amount: formatDisplayAmount(input.destinationAmount, 2),
      currency: displaySymbol(quoteDestAsset),
      recipientName: String(input.counterpartyLabel || 'Destinatário'),
      description: 'Transferência internacional',
      convertedAmount: formatDisplayAmount(quoteSource || input.sourceAmount || '', 2),
      convertedCurrency: displaySymbol(quoteSourceAsset || 'BRL'),
      feeLabel: String(input.feeDisplay || 'indisponível'),
      quoteLabel: quoteSource && quoteDest && quoteSourceAsset && quoteDestAsset
        ? `1 ${displaySymbol(quoteDestAsset)} = ${formatDisplayAmount(Number(quoteSource) / Math.max(Number(quoteDest), 0.0000001), 2)} ${displaySymbol(quoteSourceAsset)}`
        : 'não aplicável',
      settlementSeconds: Number.isFinite(Number(input.settlementMs || 0))
        ? Number(input.settlementMs || 0) / 1000
        : null,
      completedAt: input.completedAt || null,
      operationId: opId || null,
      balanceLabel: '-',
      savingsLabel: Number.isFinite(estimatedSavings) && estimatedSavings > 0
        ? `R$ ${formatDisplayAmount(estimatedSavings, 2)}`
        : 'R$ 0,00',
      savingsPercentLabel: Number.isFinite(savingsPercentage) && savingsPercentage > 0
        ? `${savingsPercentage.toFixed(0)}% menor`
        : 'estimativa',
    };
  }
}
