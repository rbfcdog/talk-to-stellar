import { PaymentReceiptService } from '../src/api/services/payment-receipt.service';
import { TransferNotificationService } from '../src/api/services/transfer-notification.service';

describe('PaymentReceiptService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FRONTEND_URL: 'https://talk-to-stellar-owxg.vercel.app',
      PAYMENT_CONFIRM_BASE: 'https://talk-to-stellar-owxg.vercel.app',
      BACKEND_URL: 'http://localhost:8080',
      TRADITIONAL_FEE_PCT: '0.045',
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

  it('builds a concise normal transfer receipt without fee, savings or settlement copy', async () => {
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
        sourceAsset: { code: 'TESOURO' },
        destinationAmount: '89.12',
        destinationAsset: { code: 'USDC' },
      },
      savings: {
        estimatedSavings: 18.8,
        savingsPercentage: 83,
      },
    });

    expect(receipt).toContain('Você converteu R$ 500.00 para US$ 89.12 e enviou para João.');
    expect(receipt).toContain('Status: concluído');
    expect(receipt).toContain('Cotação usada: 1 US$ = R$ 5.610412');
    expect(receipt).not.toContain('Taxa:');
    expect(receipt).not.toContain('Taxa estimada em métodos tradicionais:');
    expect(receipt).not.toContain('Economia estimada:');
    expect(receipt).not.toContain('Liquidação:');
    expect(receipt).toContain(`ID da operação: ${operationId}`);
    expect(receipt).not.toContain('Stellar hash');
    expect(receipt).not.toContain('blockchain');
  });

  it('uses the settled source and destination amounts as the receipt quote source of truth', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-source-of-truth',
      userId: 'user-source-of-truth',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '56',
      sourceAssetCode: 'BRL',
      destinationAmount: '10',
      destinationAssetCode: 'USDC',
      feeDisplay: 'R$ 0.17',
      hash: 'tx-source-of-truth',
      quote: {
        sourceAmount: '56',
        sourceAsset: { code: 'TESOURO' },
        destinationAmount: '11.373',
        destinationAsset: { code: 'USDC' },
      },
    });

    expect(receipt).toContain('Cotação usada: 1 US$ = R$ 5.6');
    expect(receipt).not.toContain('4.923897');
  });

  it('shows the real PIX on-ramp fee from gross and net BRL amounts', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_received',
      sessionId: 'session-pix-fee-delta',
      userId: 'user-pix-fee-delta',
      counterpartyLabel: 'PIX Etherfuse',
      sourceAmount: '100',
      sourceAssetCode: 'BRL',
      destinationAmount: '99.50',
      destinationAssetCode: 'BRL',
      status: 'completed',
      contextMessage: 'PIX confirmado. Entregamos BRL na sua conta TalkToStellar.',
    });

    expect(receipt).toContain('Taxa: R$ 0.50');
    expect(receipt).not.toContain('Taxa: indisponivel');
  });

  it('shows the real PIX on-ramp fee from saved operation context', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_received',
      sessionId: 'session-pix-fee-context',
      userId: 'user-pix-fee-context',
      counterpartyLabel: 'PIX Etherfuse',
      sourceAmount: '99.50',
      sourceAssetCode: 'BRL',
      destinationAmount: '99.50',
      destinationAssetCode: 'BRL',
      status: 'completed',
      contextMessage: 'Escolhemos a melhor rota para essa conversão e entregamos BRL na sua conta.',
      quote: {
        direction: 'onramp',
        source_amount_brl: '100',
        destination_amount_anchor: '99.50',
        provider_onramp_fee_amount: '0.20',
        talktostellar_transaction_fee_amount: '0.30',
        total_fee_amount: '0.50',
      },
    });

    expect(receipt).toContain('Taxa: R$ 0.50');
    expect(receipt).not.toContain('Taxa: indisponivel');
  });

  it('infers the PIX on-ramp fee from configured bps when only the net BRL amount is present', async () => {
    process.env.ETHERFUSE_ONRAMP_FEE_BPS = '20';
    process.env.TALKTOSTELLAR_SPREAD_BPS = '30';

    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_received',
      sessionId: 'session-pix-fee-bps',
      userId: 'user-pix-fee-bps',
      counterpartyLabel: 'PIX Etherfuse',
      sourceAmount: '99.50',
      sourceAssetCode: 'BRL',
      destinationAmount: '99.50',
      destinationAssetCode: 'BRL',
      status: 'completed',
      contextMessage: 'PIX confirmado. Entregamos BRL na sua conta TalkToStellar.',
    });

    expect(receipt).toContain('Taxa: R$ 0.50');
    expect(receipt).not.toContain('Taxa: indisponivel');
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

  it('does not invent BRL savings for USDC receipts without transaction quote values', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-no-fallback',
      userId: 'user-no-fallback',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '100',
      sourceAssetCode: 'USDC',
      destinationAmount: '100',
      destinationAssetCode: 'USDC',
      feeDisplay: 'US$ 0.01',
    });

    expect(receipt).not.toContain('Taxa:');
    expect(receipt).not.toContain('Taxa estimada em métodos tradicionais:');
    expect(receipt).not.toContain('Economia estimada:');
    expect(receipt).not.toContain('5.15');
  });

  it('ignores configured USD/BRL fallback for USDC receipt fee conversion', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-configured-fallback',
      userId: 'user-configured-fallback',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '100',
      sourceAssetCode: 'USDC',
      destinationAmount: '100',
      destinationAssetCode: 'USDC',
      feeDisplay: 'US$ 0.01',
    });

    expect(receipt).not.toContain('Taxa:');
    expect(receipt).not.toContain('Taxa estimada em métodos tradicionais:');
    expect(receipt).not.toContain('Economia estimada:');
    expect(receipt).not.toContain('5.15');
  });

  it('adds spread to exact fee when quote carries platform fee and shows traditional comparison', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'conversion',
      sessionId: 'session-3',
      userId: 'user-3',
      counterpartyLabel: 'Pedro',
      sourceAmount: '500',
      sourceAssetCode: 'BRL',
      destinationAmount: '89.12',
      destinationAssetCode: 'USDC',
      feeDisplay: 'R$ 0.000005 / US$ 0.000001',
      feeBrl: '0.000005',
      feeUsdc: '0.000001',
      quote: {
        sourceAmount: '500',
        sourceAsset: { code: 'TESOURO' },
        destinationAmount: '89.12',
        destinationAsset: { code: 'USDC' },
        platformFee: {
          feeAmount: '1.5000000',
          feeAssetCode: 'BRL',
        },
      },
    });

    expect(receipt).toContain('Taxa: R$ 1.50 / US$ 0.27');
    expect(receipt).toContain('Taxa estimada em métodos tradicionais:');
    expect(receipt).toContain('Economia estimada: R$ 21.00 em relação a métodos tradicionais.');
  });

  it('shortens PIX off-ramp context in text receipts', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-pix',
      userId: 'user-pix',
      counterpartyLabel: 'Seu PIX',
      sourceAmount: '10',
      sourceAssetCode: 'USDC',
      destinationAmount: '10',
      destinationAssetCode: 'BRL',
      status: 'completed',
      contextMessage: 'Retirada via PIX concluída: o saldo saiu da conta TalkToStellar e entrou no seu PIX.',
    });

    expect(receipt).toContain('Resumo: PIX enviado ao seu PIX.');
    expect(receipt).not.toContain('Retirada via PIX concluída');
  });

  it('uses the concise external callback for normal contact transfers', async () => {
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: {
        attempted: true,
        delivered: 1,
        recipients: 1,
        instances: ['TalkToStellar'],
        attempts: [],
      },
    });

    await PaymentReceiptService.sendReceipt({
      type: 'payment_sent',
      sessionId: 'session-callback',
      userId: 'user-callback',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '100',
      sourceAssetCode: 'USDC',
      destinationAmount: '100',
      destinationAssetCode: 'USDC',
      feeDisplay: 'US$ 0.01',
      hash: 'tx-callback-1',
      externalDeliveryText: 'Pagamento concluido.\nValor: US$ 100.00\nDestino: Ana Silva',
    });

    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      text: expect.stringContaining('Pagamento concluido.'),
      buttonText: 'Abrir comprovante',
    }));
    expect(notifySpy.mock.calls[0][0].text).toContain('Valor: US$ 100.00');
    expect(notifySpy.mock.calls[0][0].text).toContain('Destino: Ana Silva');
    expect(notifySpy.mock.calls[0][0].text).toContain('Comprovante:');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('💰 *Você economizou');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Taxa paga');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Liquidação');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Liquidacao');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('🔗 Evidência Stellar:');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('tx-callback-1');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Recibo registrado no seu histórico.');

    notifySpy.mockRestore();
  });

  it('does not use the savings-first WhatsApp receipt for XLM payments', async () => {
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: {
        attempted: true,
        delivered: 1,
        recipients: 1,
        instances: ['TalkToStellar'],
        attempts: [],
      },
    });

    await PaymentReceiptService.sendReceipt({
      type: 'payment_sent',
      sessionId: 'session-xlm',
      userId: 'user-xlm',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '10',
      sourceAssetCode: 'XLM',
      destinationAmount: '10',
      destinationAssetCode: 'XLM',
      feeDisplay: '0.00001 XLM',
      hash: 'tx-xlm-1',
      externalDeliveryText: 'Pagamento concluido.\nValor: 10 XLM\nDestino: Ana Silva',
    });

    const text = String(notifySpy.mock.calls[0]?.[0]?.text || '');
    expect(text).toContain('Pagamento concluido.');
    expect(text).toContain('Valor: 10 XLM');
    expect(text).not.toContain('Entregue: *US$ 0,00*');
    expect(text).not.toContain('Enviado: R$ 0,00');
    expect(text).not.toContain('Você economizou R$ 0,00');

    notifySpy.mockRestore();
  });
});
