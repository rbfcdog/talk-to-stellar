import { ReceiptImageService } from '../src/api/services/receipt-image.service';
import { PaymentReceiptService } from '../src/api/services/payment-receipt.service';

describe('ReceiptImageService', () => {
  it('renders dynamic svg with transaction fields', () => {
    const svg = ReceiptImageService.toSvg({
      amount: '245.90',
      currency: 'US$',
      subtitle: 'Pagamento internacional enviado com sucesso',
      recipientName: 'João Silva',
      description: 'Pagamento de serviço freelance',
      convertedAmount: '1.392,12',
      convertedCurrency: 'R$',
      feeLabel: 'R$4,12',
      quoteLabel: '1 USD = 5.66 BRL',
      settlementSeconds: 3.2,
      completedAt: '2026-05-11T17:32:00.000Z',
      operationId: 'TTS-84X92A1',
      balanceLabel: 'US$1,240.22',
      savingsLabel: 'R$ 84.00',
      savingsPercentLabel: '83% menor',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('João Silva');
    expect(svg).toContain('Pagamento de serviço freelance');
    expect(svg).toContain('US$245.90');
    expect(svg).toContain('TTS-84X92A1');
    expect(svg).toContain('Liquidado instantaneamente');
    expect(svg).toContain('Protegido');
    expect(svg).toContain('Economia estimada');
    expect(svg).toContain('R$ 84.00');
    expect(svg).toContain('83% menor');
    expect(svg).not.toContain('Saldo restante');
  });

  it('renders receipt text with uniform spacing attributes and without glyph stretching', () => {
    const svg = ReceiptImageService.toSvg({
      amount: '100.00',
      currency: 'US$',
      recipientName: 'contatojpsobral@gmail.com',
      convertedAmount: '100.00',
      convertedCurrency: 'US$',
      quoteLabel: 'não aplicável',
      completedAt: '2026-06-07T14:28:00.000Z',
      operationId: 'OP-BXV87TRV',
      savingsLabel: 'R$ 0,01',
      savingsPercentLabel: 'estimativa',
    });

    expect(svg).not.toMatch(/\btextLength=|\blengthAdjust=|spacingAndGlyphs/);
    const textTags = svg.match(/<text\b[^>]*>/g) || [];
    expect(textTags.length).toBeGreaterThan(0);
    for (const tag of textTags) {
      expect(tag).toContain('letter-spacing="0"');
      expect(tag).toContain('font-kerning="normal"');
      expect(tag).toContain('text-rendering="geometricPrecision"');
    }
  });

  it('formats receipt payment values with user-facing symbols and the same executed quote', async () => {
    const receiptInput = {
      type: 'payment_sent' as const,
      sessionId: 'session-1',
      userId: 'user-1',
      destinationAmount: '10.999',
      destinationAssetCode: 'USDC',
      sourceAmount: '61.239',
      sourceAssetCode: 'BRL',
      counterpartyLabel: 'Ana',
      feeDisplay: 'US$ 0.03 + 0.00002 XLM',
      quote: {
        sourceAmount: '61.239',
        sourceAsset: { code: 'TESOURO' },
        destinationAmount: '10.999',
        destinationAsset: { code: 'USDC' },
      },
    };
    const svg = ReceiptImageService.toSvg(ReceiptImageService.fromPaymentReceipt(receiptInput));
    const receiptText = await PaymentReceiptService.buildReceiptText(receiptInput);

    expect(svg).toContain('US$10.99');
    expect(svg).toContain('R$61.23');
    expect(svg).toContain('1 US$ = R$ 5.56');
    expect(receiptText).toContain('Cotação usada: 1 US$ = R$ 5.56');
    expect(svg).not.toContain('USDC');
    expect(svg).not.toContain('BRL');
    expect(svg).not.toContain('XLM');
  });

  it('keeps PIX off-ramp receipt copy short and without ellipsis', () => {
    const svg = ReceiptImageService.toSvg(ReceiptImageService.fromPaymentReceipt({
      destinationAmount: '10',
      destinationAssetCode: 'BRL',
      sourceAmount: '10',
      sourceAssetCode: 'USDC',
      counterpartyLabel: 'Conta bancária externa TalkToStellar',
      contextMessage: 'Retirada via PIX concluída: o saldo saiu da conta TalkToStellar e entrou no seu PIX.',
      hash: 'pix-off-hash-1',
      completedAt: '2026-05-14T21:00:13.000Z',
    }));

    expect(svg).toContain('PIX enviado à chave');
    expect(svg).not.toContain('Retirada via PIX conclu');
    expect(svg).not.toContain('…');
  });
});
