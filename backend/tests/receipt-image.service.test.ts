import { ReceiptImageService } from '../src/api/services/receipt-image.service';

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
  });
});
