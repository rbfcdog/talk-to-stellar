import { PaymentReceiptService } from '../src/api/services/payment-receipt.service';

describe('PaymentReceiptService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PAYMENT_CONFIRM_BASE: 'https://talk-to-stellar-owxg.vercel.app',
      BACKEND_URL: 'http://localhost:8080',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('builds hosted receipt URLs from the configured frontend base', () => {
    const url = PaymentReceiptService.buildHostedReceiptUrl('abc123');

    expect(url).toBe('https://talk-to-stellar-owxg.vercel.app/api/external/receipts/abc123');
    expect(url).not.toContain('localhost:8080');
  });

  it('builds a premium receipt with quote, fee and public operation id', async () => {
    const operationId = PaymentReceiptService.toPublicOperationId('abc123');
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-1',
      userId: 'user-1',
      counterpartyLabel: 'João',
      sourceAmount: '500',
      sourceAssetCode: 'BRL',
      destinationAmount: '89.12',
      destinationAssetCode: 'USDC',
      feeDisplay: 'R$ 0.08 / US$ 0.01',
      feeXlm: '0.0000100',
      hash: 'abc123',
      settlementMs: 3200,
      completedAt: '2026-05-12T12:00:00.000Z',
      quote: {
        sourceAmount: '500',
        sourceAsset: { code: 'BRL' },
        destinationAmount: '89.12',
        destinationAsset: { code: 'USDC' },
      },
      savings: {
        estimatedSavings: 18.8,
        savingsPercentage: 83,
      },
    });

    expect(receipt).toContain('Você converteu R$ 500.00 para US$ 89.12 e enviou para João.');
    expect(receipt).toContain('Status: Confirmado');
    expect(receipt).toContain('Cotação usada: 1 US$ = R$ 5.610412');
    expect(receipt).toContain('Taxa exata: R$ 0.08 / US$ 0.01');
    expect(receipt).toContain('Economia estimada: R$ 18.80 em relação a métodos tradicionais.');
    expect(receipt).toContain('Liquidação: 3.2s');
    expect(receipt).toContain(`ID da operação: ${operationId}`);
    expect(receipt).not.toContain('Stellar hash');
    expect(receipt).not.toContain('blockchain');
  });

  it('hides quote line when payment uses the same asset', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-2',
      userId: 'user-2',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '10',
      sourceAssetCode: 'USDC',
      destinationAmount: '10',
      destinationAssetCode: 'USDC',
      feeDisplay: 'R$ 0.000005 / US$ 0.000001',
      settlementMs: 2200,
      completedAt: '2026-05-12T19:22:20.000Z',
    });

    expect(receipt).toContain('Você enviou US$ 10.00 para Ana Silva.');
    expect(receipt).not.toContain('Cotação usada:');
  });
});
