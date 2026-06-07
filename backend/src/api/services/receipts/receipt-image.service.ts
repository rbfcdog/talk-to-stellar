import { PaymentReceiptService } from './payment-receipt.service';
import { buildUsedQuoteLabel } from '../../../utils/quote-display';
import { Resvg } from '@resvg/resvg-js';

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

export type HostedReceiptPaymentData = {
  tx_hash: string;
  amount: string;
  asset: string;
  destination: string;
  sender: string;
  completed_at: string;
  fee?: string;
  estimated_savings?: string;
};

const RECEIPT_FONT_FAMILY = "'Noto Sans', 'DejaVu Sans', 'Inter', 'Segoe UI', sans-serif";

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
  if (code === 'BRL' || code === 'TESOURO') return 'R$';
  if (code === 'EURC' || code === 'EUR') return 'CETES';
  return `${code} `;
}

function sanitizeFeeLabel(value?: string): string {
  const fee = String(value || '').trim();
  if (!fee) return 'indisponível';
  if (!/\bXLM\b/i.test(fee)) return fee;
  const visibleParts = fee
    .split(/\s*\+\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !/\bXLM\b/i.test(part));
  return visibleParts.join(' + ') || 'taxa de rede convertida';
}

function sanitizeQuoteLabel(value: string): string {
  return String(value || 'Cotação usada: não aplicável').replace(/^Cotação usada:\s*/i, '').trim();
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textAttrs(family?: string): string {
  return ` font-family="${family || RECEIPT_FONT_FAMILY}" letter-spacing="0" font-kerning="normal" text-rendering="geometricPrecision"`;
}

function fitText(value: string, maxLength: number): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  void maxLength;
  return normalized;
}

function limitWords(value: string, maxWords: number): string {
  const words = String(value || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.slice(0, Math.max(1, maxWords)).join(' ');
}

function compactReceiptMessage(value: string): string {
  const normalized = fitText(value, 0);
  if (!normalized) return '';
  if (/retirada via pix conclu[ií]da|pix enviado ao seu pix|entrou no seu pix|saldo saiu da conta/i.test(normalized)) {
    return 'PIX enviado';
  }
  if (/pix.*recebid|depositad/i.test(normalized)) {
    return 'PIX recebido';
  }
  return limitWords(normalized, 3);
}

function wrapReceiptText(value: string, maxLineLength: number, maxLines = 2): string[] {
  const normalized = fitText(value, maxLineLength);
  if (!normalized) return ['-'];

  const lines: string[] = [];
  let current = '';
  for (const word of normalized.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLineLength || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  return [
    ...lines.slice(0, Math.max(0, maxLines - 1)),
    lines.slice(Math.max(0, maxLines - 1)).join(' '),
  ];
}

function fittedFontSize(value: string, baseSize: number, maxChars: number, minimumSize: number): number {
  const length = fitText(value, maxChars).length;
  if (length <= maxChars) return baseSize;
  const overflow = length - maxChars;
  return Math.max(minimumSize, baseSize - Math.ceil(overflow * 0.55));
}

function centeredTextSvg(input: {
  value: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fill: string;
  weight?: number;
  family?: string;
  maxChars: number;
}): string {
  const raw = fitText(input.value, input.maxChars);
  const fontSize = fittedFontSize(raw, input.fontSize, input.maxChars, 14);
  return `<text x="${input.x}" y="${input.y}" text-anchor="middle" fill="${input.fill}" font-size="${fontSize}"${input.weight ? ` font-weight="${input.weight}"` : ''}${textAttrs(input.family)}>${escapeXml(raw)}</text>`;
}

function rightTextSvg(input: {
  value: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fill: string;
  weight?: number;
  family?: string;
  maxChars: number;
}): string {
  const raw = fitText(input.value, input.maxChars);
  const fontSize = fittedFontSize(raw, input.fontSize, input.maxChars, 13);
  return `<text x="${input.x}" y="${input.y}" text-anchor="end" fill="${input.fill}" font-size="${fontSize}"${input.weight ? ` font-weight="${input.weight}"` : ''}${textAttrs(input.family)}>${escapeXml(raw)}</text>`;
}

function rowValueSvg(value: string, y: number): string {
  const raw = fitText(value, 34);
  const lines = wrapReceiptText(raw, 31, 2);
  if (lines.length <= 1) {
    return rightTextSvg({
      value: raw,
      x: 658,
      y,
      width: 350,
      fontSize: 22,
      fill: '#F4F7FF',
      weight: 600,
      maxChars: 34,
    });
  }

  const [first, second] = lines;
  return `<text x="658" y="${y - 9}" text-anchor="end" fill="#F4F7FF" font-size="16" font-weight="600"${textAttrs()}><tspan x="658">${escapeXml(first)}</tspan><tspan x="658" dy="20">${escapeXml(second)}</tspan></text>`;
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
  static hostedReceiptInput(paymentData: HostedReceiptPaymentData): ReceiptImageInput {
    const estimatedSavings = Number(String(paymentData.estimated_savings || '').replace(',', '.'));
    const hasAmount = String(paymentData.amount || '').trim().length > 0;
    return {
      amount: hasAmount ? formatDisplayAmount(paymentData.amount, 2) : '-',
      currency: hasAmount ? displaySymbol(paymentData.asset) : '',
      subtitle: 'Pagamento enviado com sucesso',
      recipientName: paymentData.destination || 'Destinatário',
      description: `De ${fitText(paymentData.sender || 'TalkToStellar', 24)}`,
      convertedAmount: hasAmount ? formatDisplayAmount(paymentData.amount, 2) : '-',
      convertedCurrency: hasAmount ? displaySymbol(paymentData.asset) : '',
      feeLabel: sanitizeFeeLabel(paymentData.fee),
      quoteLabel: 'sem conversão',
      settlementSeconds: null,
      completedAt: paymentData.completed_at,
      operationId: PaymentReceiptService.toPublicOperationId(paymentData.tx_hash) || paymentData.tx_hash,
      savingsLabel: Number.isFinite(estimatedSavings) && estimatedSavings > 0
        ? `R$ ${formatDisplayAmount(estimatedSavings, 2)}`
        : 'R$ 0,01',
      savingsPercentLabel: 'estimativa',
    };
  }

  static generateReceiptImage(paymentData: HostedReceiptPaymentData): Buffer {
    const svg = this.toSvg(this.hostedReceiptInput(paymentData));
    return new Resvg(svg, {
      fitTo: {
        mode: 'width',
        value: 1080,
      },
      font: {
        defaultFontFamily: 'Inter',
        loadSystemFonts: true,
      },
    }).render().asPng();
  }

  static generateReceiptImageBase64(paymentData: HostedReceiptPaymentData): string {
    return this.generateReceiptImage(paymentData).toString('base64');
  }

  static toSvg(input: ReceiptImageInput): string {
    const opId = String(input.operationId || '').trim() || 'TTS-PENDING';
    const statusBadge = String(input.statusBadge || 'Transferência concluída').trim();
    const instantBadge = String(input.instantBadge || 'Liquidado instantaneamente').trim();
    const protectedBadge = String(input.protectedBadge || 'Protegido').trim();
    const amount = fitText(`${input.currency}${input.amount}`, 18);
    const subtitle = fitText(String(input.subtitle || 'Pagamento enviado com sucesso'), 46);
    const recipient = fitText(String(input.recipientName || 'Destinatário'), 34);
    const rawDescription = String(input.description || 'Transferência internacional');
    const description = compactReceiptMessage(rawDescription);
    const converted = fitText(`${input.convertedCurrency || 'R$'}${input.convertedAmount || '-'}`, 24);
    const quote = fitText(String(input.quoteLabel || '-'), 34);
    const dateLabel = fitText(formatDatePtBr(input.completedAt), 28);
    const savingsLabel = fitText(String(input.savingsLabel || 'R$ 0,00'), 18);
    const savingsPercentLabel = fitText(String(input.savingsPercentLabel || 'menor que métodos tradicionais'), 28);
    const amountSvg = centeredTextSvg({
      value: amount,
      x: 360,
      y: 294,
      width: 560,
      fontSize: 72,
      fill: '#F8FBFF',
      weight: 800,
      maxChars: 18,
    });
    const subtitleSvg = centeredTextSvg({
      value: subtitle,
      x: 360,
      y: 336,
      width: 560,
      fontSize: 24,
      fill: '#9FB0DB',
      maxChars: 46,
    });
    const savingsLabelSvg = rightTextSvg({
      value: savingsPercentLabel,
      x: 628,
      y: 421,
      width: 245,
      fontSize: 17,
      fill: '#B8C8EE',
      weight: 600,
      maxChars: 28,
    });

    const lines = [
      ['Destinatário', recipient],
      ['Valor convertido', converted],
      ['Cotação', quote],
      ['Data', dateLabel],
      ['ID', opId],
    ];

    const rows = lines.map((line, index) => {
      const y = 500 + index * 54;
      return [
        `<text x="64" y="${y}" fill="#94A1C8" font-size="20"${textAttrs()}>${line[0]}</text>`,
        rowValueSvg(line[1], y),
        index < lines.length - 1
          ? `<line x1="64" y1="${y + 27}" x2="658" y2="${y + 27}" stroke="#1B2545" stroke-width="1"/>`
          : '',
      ].join('');
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">
  <desc>${escapeXml(rawDescription)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0F1731"/>
      <stop offset="100%" stop-color="#0B1020"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.09"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.03"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="22" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="720" height="1280" fill="url(#bg)"/>

  <rect x="36" y="40" width="648" height="1200" rx="40" fill="#0F1731" opacity="0.5"/>
  <rect x="44" y="48" width="632" height="1184" rx="36" fill="url(#card)" stroke="#22315C" stroke-width="1.5" filter="url(#shadow)"/>

  <text x="78" y="106" fill="#F4F7FF" font-size="28" font-weight="700"${textAttrs()}>TalkTo</text>
  <rect x="438" y="72" width="206" height="42" rx="21" fill="#143A2D" stroke="#2FA070" stroke-width="1"/>
  <text x="541" y="99" text-anchor="middle" fill="#7EE2B8" font-size="17" font-weight="600"${textAttrs()}>${escapeXml(statusBadge)}</text>

  <circle cx="360" cy="196" r="42" fill="#163D2D" stroke="#2CCB84" stroke-width="2"/>
  <path d="M341 196 L356 210 L382 184" fill="none" stroke="#A7FFD6" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>

  ${amountSvg}
  ${subtitleSvg}

  <rect x="64" y="356" width="594" height="96" rx="18" fill="#101B34" stroke="#2B406F" stroke-width="1"/>
  <text x="92" y="397" fill="#8DA0CB" font-size="18"${textAttrs()}>Economia estimada</text>
  <text x="92" y="431" fill="#95FFD1" font-size="36" font-weight="800"${textAttrs()}>${escapeXml(savingsLabel)}</text>
  ${savingsLabelSvg}
  <text x="64" y="478" fill="#7C8BB3" font-size="14"${textAttrs()}>comparado a métodos tradicionais</text>

  ${rows}

  <rect x="64" y="930" width="274" height="40" rx="20" fill="#152642" stroke="#254273" stroke-width="1"/>
  ${centeredTextSvg({ value: instantBadge, x: 201, y: 956, width: 240, fontSize: 16, fill: '#B8C8EE', weight: 600, maxChars: 25 })}

  <rect x="356" y="930" width="132" height="40" rx="20" fill="#183A2C" stroke="#2A8F66" stroke-width="1"/>
  ${centeredTextSvg({ value: protectedBadge, x: 422, y: 956, width: 104, fontSize: 16, fill: '#8EF0C6', weight: 600, maxChars: 10 })}

  <rect x="542" y="912" width="116" height="116" rx="16" fill="#0D1328" stroke="#26365F"/>
  <g transform="translate(560 930)">
    ${qrPattern(opId)}
  </g>

  <text x="64" y="1060" fill="#7082B0" font-size="14"${textAttrs()}>Estimativa baseada em taxas internacionais médias.</text>
  <text x="64" y="1086" fill="#5F719D" font-size="13"${textAttrs()}>Recibo registrado no seu histórico.</text>
</svg>`;
  }

  static toBuffer(input: ReceiptImageInput): Buffer {
    return Buffer.from(this.toSvg(input), 'utf-8');
  }

  static fromPaymentReceipt(input: {
    destinationAmount: string;
    destinationAssetCode: string;
    counterpartyLabel?: string;
    counterpartyKey?: string;
    sourceAmount?: string;
    sourceAssetCode?: string;
    feeDisplay?: string;
    savings?: { estimatedSavings?: number | string | null; savingsPercentage?: number | string | null } | null;
    settlementMs?: number | null;
    completedAt?: string | null;
    hash?: string | null;
    quote?: any;
    contextMessage?: string | null;
  }): ReceiptImageInput {
    const opId = PaymentReceiptService.toPublicOperationId(input.hash);
    const quoteSource = String(input.sourceAmount || input.quote?.sourceAmount || '').trim();
    const quoteSourceAsset = String(input.sourceAssetCode || input.quote?.sourceAsset?.code || '').trim().toUpperCase();
    const quoteDest = String(input.destinationAmount || input.quote?.destinationAmount || '').trim();
    const quoteDestAsset = String(input.destinationAssetCode || input.quote?.destinationAsset?.code || '').trim().toUpperCase();
    const estimatedSavings = Number(String(input.savings?.estimatedSavings || '').replace(',', '.'));
    const savingsPercentage = Number(String(input.savings?.savingsPercentage || '').replace(',', '.'));

    const contextMessage = compactReceiptMessage(String(input.contextMessage || '').replace(/\s+/g, ' ').trim());
    const counterpartyKey = String(input.counterpartyKey || '').trim();
    const isPixOffRampReceipt = /pix/i.test(contextMessage) && quoteDestAsset === 'BRL';
    const description = isPixOffRampReceipt
      ? 'PIX enviado à chave'
      : (contextMessage || (counterpartyKey && !/^G[A-Z2-7]{55}$/i.test(counterpartyKey) ? `Chave ${counterpartyKey}` : 'Transferência otimizada'));

    return {
      amount: formatDisplayAmount(input.destinationAmount, 2),
      currency: displaySymbol(quoteDestAsset),
      subtitle: isPixOffRampReceipt ? 'PIX enviado à chave' : undefined,
      recipientName: String(input.counterpartyLabel || 'Destinatário'),
      description,
      convertedAmount: formatDisplayAmount(quoteSource || input.sourceAmount || '', 2),
      convertedCurrency: displaySymbol(quoteSourceAsset || 'BRL'),
      feeLabel: sanitizeFeeLabel(input.feeDisplay),
      quoteLabel: sanitizeQuoteLabel(buildUsedQuoteLabel({
        sourceAmount: input.sourceAmount,
        sourceAssetCode: input.sourceAssetCode,
        destinationAmount: input.destinationAmount,
        destinationAssetCode: input.destinationAssetCode,
      })),
      settlementSeconds: Number.isFinite(Number(input.settlementMs || 0))
        ? Number(input.settlementMs || 0) / 1000
        : null,
      completedAt: input.completedAt || null,
      operationId: opId || null,
      balanceLabel: '-',
      savingsLabel: Number.isFinite(estimatedSavings) && estimatedSavings > 0
        ? `R$ ${formatDisplayAmount(estimatedSavings, 2)}`
        : 'R$ 0,01',
      savingsPercentLabel: Number.isFinite(savingsPercentage) && savingsPercentage > 0
        ? `${savingsPercentage.toFixed(0)}% menor`
        : 'estimativa',
    };
  }
}
