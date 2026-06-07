import { PaymentReceiptService } from '../src/api/services/payment-receipt.service';
import { TransferNotificationService } from '../src/api/services/transfer-notification.service';
import { EconomyEngineService } from '../src/api/services/economy-engine.service';
import { supabase } from '../src/config/supabase';

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
    (PaymentReceiptService as any).clearExternalDeliveryDedupeForTests?.();
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
    expect(receipt).toContain('Cotação usada: 1 US$ = R$ 5.61');
    expect(receipt).not.toContain('Taxa:');
    expect(receipt).not.toContain('Taxa estimada em métodos tradicionais:');
    expect(receipt).not.toContain('Economia estimada:');
    expect(receipt).not.toContain('Liquidação:');
    expect(receipt).toContain(`ID da operação: ${operationId}`);
    expect(receipt).not.toContain('Stellar hash');
    expect(receipt).not.toContain('blockchain');
  });

  it('builds cross-asset payment receipts fully in English when requested', async () => {
    const operationId = PaymentReceiptService.toPublicOperationId('tx-english-cross-asset');
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-english-cross-asset',
      userId: 'user-english-cross-asset',
      language: 'en',
      counterpartyLabel: 'Rodrigo Camargo',
      counterpartyKey: 'rodrigooobfcdog@gmail.com',
      sourceAmount: '10',
      sourceAssetCode: 'USDC',
      destinationAmount: '15.3002683',
      destinationAssetCode: 'XLM',
      hash: 'tx-english-cross-asset',
      completedAt: '2026-06-05T22:51:38.000Z',
    });

    expect(receipt).toContain('You converted US$ 10.00 to 15.30 XLM and sent it to Rodrigo Camargo.');
    expect(receipt).toContain('Key: rodrigooobfcdog@gmail.com');
    expect(receipt).toContain('Status: completed');
    expect(receipt).toContain('Quote used: 1 XLM = 0.65 US$ (US$ 10.00 -> 15.30 XLM)');
    expect(receipt).toContain('Time:');
    expect(receipt).toContain(`Operation ID: ${operationId}`);
    expect(receipt).toContain('Receipt saved in your history.');
    expect(receipt).not.toContain('Você');
    expect(receipt).not.toContain('Chave:');
    expect(receipt).not.toContain('Cotação usada');
    expect(receipt).not.toContain('Recibo registrado');
  });

  it('hides transfer values, quote, fee, and savings text when amount privacy is enabled', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-hidden-values',
      userId: 'user-hidden-values',
      language: 'en',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '100',
      sourceAssetCode: 'USDC',
      destinationAmount: '1539.9100000',
      destinationAssetCode: 'CETES',
      feeDisplay: '0.00001 XLM',
      hash: 'tx-hidden-values',
      completedAt: '2026-06-06T17:23:00.000Z',
      savings: {
        estimatedSavings: 18.04,
      },
      hideAmounts: true,
    });

    expect(receipt).toContain('You sent a transfer to Ana Silva.');
    expect(receipt).toContain('Status: completed');
    expect(receipt).toContain('Receipt saved in your history.');
    expect(receipt).not.toContain('US$');
    expect(receipt).not.toContain('CETES');
    expect(receipt).not.toContain('100');
    expect(receipt).not.toContain('1539');
    expect(receipt).not.toContain('Quote used');
    expect(receipt).not.toContain('Fee:');
    expect(receipt).not.toContain('Estimated savings');
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

    expect(receipt).toContain('Você recebeu R$ 99.50 de PIX.');
    expect(receipt).toContain('Taxa: R$ 0.50');
    expect(receipt).not.toContain('Taxa: indisponivel');
    expect(receipt).not.toMatch(/Etherfuse|anchor|provedor|provider/i);
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

    expect(receipt).toContain('Você recebeu R$ 99.50 de PIX.');
    expect(receipt).toContain('Taxa: R$ 0.50');
    expect(receipt).not.toContain('Taxa: indisponivel');
    expect(receipt).not.toMatch(/Etherfuse|anchor|provedor|provider/i);
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

    expect(receipt).toContain('Você recebeu R$ 99.50 de PIX.');
    expect(receipt).toContain('Taxa: R$ 0.50');
    expect(receipt).not.toContain('Taxa: indisponivel');
    expect(receipt).not.toMatch(/Etherfuse|anchor|provedor|provider/i);
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

    expect(receipt).toContain('PIX enviado à chave.');
    expect(receipt).not.toContain('Resumo:');
    expect(receipt).not.toContain('Summary:');
    expect(receipt).not.toContain('Retirada via PIX concluída');
    expect(receipt).not.toContain('Liquidação: confirmada');
  });

  it('shows the real PIX off-ramp fee from quote fee fields', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-pix-off-fee',
      userId: 'user-pix-off-fee',
      counterpartyLabel: 'Seu PIX',
      sourceAmount: '50.25',
      sourceAssetCode: 'BRL',
      destinationAmount: '50',
      destinationAssetCode: 'BRL',
      status: 'completed',
      contextMessage: 'PIX enviado à chave.',
      quote: {
        direction: 'offramp',
        source_amount: '50.25',
        target_brl: '50',
        anchor_provider_fee_amount: '0.10',
        talktostellar_transaction_fee_amount: '0.15',
        total_fee_amount: '0.25',
      },
    });

    expect(receipt).toContain('PIX enviado à chave.');
    expect(receipt).not.toContain('Resumo:');
    expect(receipt).not.toContain('Summary:');
    expect(receipt).toContain('Taxa: R$ 0.25');
    expect(receipt).not.toContain('Taxa: indisponível');
    expect(receipt).not.toContain('Taxa: indisponivel');
    expect(receipt).not.toContain('Liquidação: confirmada');
  });

  it('infers the PIX off-ramp fee from debited and received BRL amounts', async () => {
    const receipt = await PaymentReceiptService.buildReceiptText({
      type: 'payment_sent',
      sessionId: 'session-pix-off-fee-delta',
      userId: 'user-pix-off-fee-delta',
      counterpartyLabel: 'Seu PIX',
      sourceAmount: '50.25',
      sourceAssetCode: 'BRL',
      destinationAmount: '50',
      destinationAssetCode: 'BRL',
      status: 'completed',
      contextMessage: 'PIX enviado à chave.',
      quote: {
        direction: 'offramp',
      },
    });

    expect(receipt).toContain('Taxa: R$ 0.25');
    expect(receipt).not.toContain('Taxa: indisponível');
    expect(receipt).not.toContain('Taxa: indisponivel');
    expect(receipt).not.toContain('Liquidação: confirmada');
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
      buttonText: null,
      buttonUrl: null,
    }));
    expect(notifySpy.mock.calls[0][0].text).toContain('Valor: US$ 100.00');
    expect(notifySpy.mock.calls[0][0].text).toContain('Destino: Ana Silva');
    expect(notifySpy.mock.calls[0][0].text).toContain('Comprovante: https://talk-to-stellar-owxg.vercel.app/');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('💰 *Você economizou');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Taxa paga');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Liquidação');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Liquidacao');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('🔗 Evidência Stellar:');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('tx-callback-1');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Recibo registrado no seu histórico.');

    notifySpy.mockRestore();
  });

  it('localizes savings-first WhatsApp receipts when the session language is English', async () => {
    const createSpy = jest
      .spyOn(PaymentReceiptService, 'createReceiptLink')
      .mockResolvedValueOnce('https://talk-to-stellar-owxg.vercel.app/receipt/en-savings');
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
      type: 'payment_received',
      sessionId: 'session-english-callback',
      userId: 'user-english-callback',
      language: 'en',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'PIX',
      sourceAmount: '448.72',
      sourceAssetCode: 'BRL',
      destinationAmount: '100',
      destinationAssetCode: 'USDC',
      feeBrl: '2.23',
      hash: 'tx-english-savings',
      quote: { direction: 'onramp' },
    });

    const sentText = notifySpy.mock.calls[0][0].text;
    expect(sentText).toContain('✅ *Transfer completed*');
    expect(sentText).toContain('Delivered:');
    expect(sentText).toContain('Sent:');
    expect(sentText).toContain('Fee paid:');
    expect(sentText).toContain('You saved');
    expect(sentText).toContain('View history:');
    expect(sentText).toContain('Receipt: https://talk-to-stellar-owxg.vercel.app/receipt/en-savings');
    expect(sentText).not.toContain('Transferência concluída');
    expect(sentText).not.toContain('Entregue:');
    expect(sentText).not.toContain('Enviado:');
    expect(sentText).not.toContain('Taxa paga:');
    expect(sentText).not.toContain('Você economizou');
    expect(sentText).not.toContain('Ver histórico:');
    expect(sentText).not.toContain('Comprovante:');

    createSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('persists real receipt savings before writing the cumulative account savings line', async () => {
    const originalRepo = (PaymentReceiptService as any).agentRepo;
    (PaymentReceiptService as any).agentRepo = {
      getSession: jest.fn().mockResolvedValue({ session_id: 'session-savings-persist' }),
      getState: jest.fn().mockResolvedValue({ action_params: { language: 'pt-BR' } }),
    };

    const originalFrom = (supabase.from as jest.Mock).getMockImplementation();
    const savedEvents: any[] = [];
    const financialEventsBuilder: any = {};
    financialEventsBuilder.select = jest.fn(() => financialEventsBuilder);
    financialEventsBuilder.eq = jest.fn(() => financialEventsBuilder);
    financialEventsBuilder.gte = jest.fn(() => financialEventsBuilder);
    financialEventsBuilder.order = jest.fn(async () => ({ data: savedEvents, error: null }));
    financialEventsBuilder.upsert = jest.fn(async (payload: any) => {
      savedEvents.push(payload);
      return { data: payload, error: null };
    });
    financialEventsBuilder.insert = jest.fn(async (payload: any) => {
      savedEvents.push(payload);
      return { data: payload, error: null };
    });

    const paymentLogsBuilder: any = {};
    paymentLogsBuilder.select = jest.fn(() => paymentLogsBuilder);
    paymentLogsBuilder.eq = jest.fn(() => paymentLogsBuilder);
    paymentLogsBuilder.gte = jest.fn(() => paymentLogsBuilder);
    paymentLogsBuilder.order = jest.fn(async () => ({ data: [], error: null }));

    const agentSessionsBuilder: any = {};
    agentSessionsBuilder.select = jest.fn(() => agentSessionsBuilder);
    agentSessionsBuilder.eq = jest.fn(() => agentSessionsBuilder);
    agentSessionsBuilder.order = jest.fn(() => agentSessionsBuilder);
    agentSessionsBuilder.limit = jest.fn(() => agentSessionsBuilder);
    agentSessionsBuilder.maybeSingle = jest.fn(async () => ({
      data: {
        session_id: 'session-savings-persist',
        user_id: 'user-savings-persist',
        public_key: 'GTEST',
      },
      error: null,
    }));

    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'agent_sessions') return agentSessionsBuilder;
      if (table === 'financial_events') return financialEventsBuilder;
      if (table === 'payment_logs') return paymentLogsBuilder;
      return originalFrom ? originalFrom(table) : { upsert: jest.fn(async () => ({ data: null, error: null })) };
    });

    const createSpy = jest
      .spyOn(PaymentReceiptService, 'createReceiptLink')
      .mockResolvedValueOnce('https://talk-to-stellar-owxg.vercel.app/receipt/savings-persist');
    const saveSpy = jest.spyOn(PaymentReceiptService as any, 'saveReceiptMessage').mockResolvedValue(true);
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: {
        attempted: true,
        delivered: 1,
        recipients: 1,
        instances: ['TalkToStellar'],
        attempts: [],
      },
    });

    try {
      await PaymentReceiptService.sendReceipt({
        type: 'payment_received',
        sessionId: 'session-savings-persist',
        userId: 'user-savings-persist',
        provider: 'whatsapp',
        providerUserId: '5519997624114',
        counterpartyLabel: 'PIX',
        sourceAmount: '450.09',
        sourceAssetCode: 'BRL',
        destinationAmount: '100',
        destinationAssetCode: 'USDC',
        feeBrl: '2.24',
        hash: 'tx-savings-persist',
        completedAt: '2026-06-05T21:23:55.000Z',
        quote: { direction: 'onramp' },
        savings: {
          estimatedSavings: 18.01,
          estimatedTraditionalFee: 20.25,
          actualFee: 2.24,
          grossAmountBrl: 450.09,
          savingsPercentage: 88.94,
        },
      });

      expect(financialEventsBuilder.upsert).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'savings_estimated',
        amount: 18.01,
        currency: 'BRL',
        user_id: 'user-savings-persist',
      }), { onConflict: 'dedupe_key' });
      expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('Economia acumulada da conta: R$ 18,01 em relação a métodos tradicionais.'),
      }));
      expect(saveSpy).not.toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('Economia acumulada da conta: R$ 0'),
      }));
    } finally {
      (PaymentReceiptService as any).agentRepo = originalRepo;
      (supabase.from as jest.Mock).mockImplementation(originalFrom as any);
      createSpy.mockRestore();
      saveSpy.mockRestore();
      notifySpy.mockRestore();
    }
  });

  it('does not save a zero cumulative savings message when persisted savings are absent', async () => {
    const calcSpy = jest.spyOn(EconomyEngineService, 'calculateIdentity').mockResolvedValue({
      period: 'lifetime',
      operationCount: 0,
      countryCount: 0,
      operationAmountBrl: 0,
      estimatedTraditionalFee: 0,
      actualFee: 0,
      estimatedSavings: 0,
      savingsPercentage: 0,
      effectiveSavingsRate: 0,
      comparisonMethod: 'traditional_providers_average_1_25pct',
      message: '',
    });
    const createSpy = jest.spyOn(PaymentReceiptService, 'createReceiptLink').mockResolvedValue('https://talk-to-stellar-owxg.vercel.app/receipt/no-savings');
    const saveSpy = jest.spyOn(PaymentReceiptService as any, 'saveReceiptMessage').mockResolvedValue(true);
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: { attempted: true, delivered: 1, recipients: 1, instances: ['TalkToStellar'], attempts: [] },
    });

    await PaymentReceiptService.sendReceipt({
      type: 'payment_sent',
      sessionId: 'session-no-savings',
      userId: 'user-no-savings',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'Seu PIX',
      sourceAmount: '62.64',
      sourceAssetCode: 'BRL',
      destinationAmount: '62.51',
      destinationAssetCode: 'BRL',
      feeBrl: '0.13',
      hash: 'tx-no-savings',
      quote: { direction: 'offramp' },
      contextMessage: 'PIX enviado à chave.',
    });

    expect(saveSpy).not.toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringMatching(/Economia acumulada da conta:.*0|Account lifetime savings:.*0/),
    }));

    calcSpy.mockRestore();
    createSpy.mockRestore();
    saveSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('uses English copy for cumulative savings when receipt language is English', async () => {
    const calcSpy = jest.spyOn(EconomyEngineService, 'calculateIdentity').mockResolvedValue({
      period: 'lifetime',
      operationCount: 1,
      countryCount: 0,
      operationAmountBrl: 450.09,
      estimatedTraditionalFee: 20.25,
      actualFee: 2.24,
      estimatedSavings: 18.01,
      savingsPercentage: 88.94,
      effectiveSavingsRate: 4,
      comparisonMethod: 'traditional_providers_average_4_5pct',
      message: '',
    });
    const createSpy = jest.spyOn(PaymentReceiptService, 'createReceiptLink').mockResolvedValue('https://talk-to-stellar-owxg.vercel.app/receipt/en-savings');
    const saveSpy = jest.spyOn(PaymentReceiptService as any, 'saveReceiptMessage').mockResolvedValue(true);
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: { attempted: true, delivered: 1, recipients: 1, instances: ['TalkToStellar'], attempts: [] },
    });

    await PaymentReceiptService.sendReceipt({
      type: 'payment_received',
      sessionId: 'session-en-savings',
      userId: 'user-en-savings',
      language: 'en',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'PIX',
      sourceAmount: '450.09',
      sourceAssetCode: 'BRL',
      destinationAmount: '100',
      destinationAssetCode: 'USDC',
      feeBrl: '2.24',
      hash: 'tx-en-savings',
      quote: { direction: 'onramp' },
    });

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Account lifetime savings:'),
    }));
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('vs traditional methods.'),
    }));
    expect(saveSpy).not.toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Economia acumulada da conta'),
    }));

    calcSpy.mockRestore();
    createSpy.mockRestore();
    saveSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('falls back to the agent state language for English external receipts', async () => {
    const originalRepo = (PaymentReceiptService as any).agentRepo;
    (PaymentReceiptService as any).agentRepo = {
      getSession: jest.fn().mockResolvedValue({ session_id: 'session-state-language' }),
      getState: jest.fn().mockResolvedValue({ action_params: { language: 'en' } }),
    };
    const saveSpy = jest.spyOn(PaymentReceiptService as any, 'saveReceiptMessage').mockResolvedValue(true);
    const createSpy = jest
      .spyOn(PaymentReceiptService, 'createReceiptLink')
      .mockResolvedValueOnce('https://talk-to-stellar-owxg.vercel.app/receipt/state-language');
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
      type: 'payment_received',
      sessionId: 'session-state-language',
      userId: 'user-state-language',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'PIX',
      sourceAmount: '448.72',
      sourceAssetCode: 'BRL',
      destinationAmount: '100',
      destinationAssetCode: 'USDC',
      feeBrl: '2.23',
      hash: 'tx-state-language',
      quote: { direction: 'onramp' },
    });

    const sentText = notifySpy.mock.calls[0][0].text;
    expect(sentText).toContain('✅ *Transfer completed*');
    expect(sentText).toContain('You saved');
    expect(sentText).toContain('Receipt: https://talk-to-stellar-owxg.vercel.app/receipt/state-language');
    expect(sentText).not.toContain('Transferência concluída');
    expect(sentText).not.toContain('Você economizou');

    (PaymentReceiptService as any).agentRepo = originalRepo;
    saveSpy.mockRestore();
    createSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('falls back to hosted receipt URL when the receipt viewer cannot be created', async () => {
    const createSpy = jest.spyOn(PaymentReceiptService, 'createReceiptLink').mockRejectedValue(new Error('receipt_images unavailable'));
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: {
        attempted: true,
        delivered: 1,
        recipients: 1,
        instances: ['TalkToStellar'],
        attempts: [],
      },
    });

    const result = await PaymentReceiptService.sendReceipt({
      type: 'payment_received',
      sessionId: 'session-pix-fallback',
      userId: 'user-pix-fallback',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'PIX Etherfuse',
      sourceAmount: '100.50',
      sourceAssetCode: 'BRL',
      destinationAmount: '100',
      destinationAssetCode: 'BRL',
      hash: 'sandbox-pix-fallback-1',
      externalDeliveryText: 'PIX Etherfuse confirmado com sucesso.\nValor recebido: R$100.00',
    });

    const fallbackUrl = 'https://talk-to-stellar-owxg.vercel.app/api/external/receipts/sandbox-pix-fallback-1';
    expect(result).toBe(fallbackUrl);
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({
      buttonText: null,
      buttonUrl: null,
      text: expect.stringContaining('PIX confirmado com sucesso.'),
    }));
    expect(notifySpy.mock.calls[0][0].text).toContain(`Comprovante: ${fallbackUrl}`);
    expect(notifySpy.mock.calls[0][0].text).not.toMatch(/Etherfuse|anchor|provedor|provider/i);

    createSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('still appends a usable receipt link when the payment hash is missing', async () => {
    const createSpy = jest.spyOn(PaymentReceiptService, 'createReceiptLink').mockRejectedValue(new Error('receipt_images unavailable'));
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: {
        attempted: true,
        delivered: 1,
        recipients: 1,
        instances: ['TalkToStellar'],
        attempts: [],
      },
    });

    const result = await PaymentReceiptService.sendReceipt({
      type: 'payment_received',
      sessionId: 'session-pix-no-hash',
      userId: 'user-pix-no-hash',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'PIX',
      sourceAmount: '100.50',
      sourceAssetCode: 'BRL',
      destinationAmount: '100',
      destinationAssetCode: 'BRL',
      hash: '',
      dedupeKey: 'pix-onramp:operation-no-hash',
      externalDeliveryText: 'PIX confirmado com sucesso.\nValor recebido: R$100.00\nComprovante:',
    });

    expect(result).toContain('/api/external/receipts/');
    expect(result).toContain(encodeURIComponent('pix-onramp:operation-no-hash'));
    expect(notifySpy.mock.calls[0][0].text).toContain(`Comprovante: ${result}`);
    expect(notifySpy.mock.calls[0][0].text).not.toMatch(/Comprovante:\s*(?:\n|$)/);

    createSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('skips the external callback when the deduped receipt row already exists', async () => {
    const createSpy = jest.spyOn(PaymentReceiptService, 'createReceiptLink').mockResolvedValue('https://app.example.com/receipt/once');
    const saveSpy = jest.spyOn(PaymentReceiptService as any, 'saveReceiptMessage').mockResolvedValue(false);
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: {
        attempted: true,
        delivered: 1,
        recipients: 1,
        instances: ['TalkToStellar'],
        attempts: [],
      },
    });

    const result = await PaymentReceiptService.sendReceipt({
      type: 'payment_received',
      sessionId: 'session-pix-dedupe',
      userId: 'user-pix-dedupe',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'PIX Etherfuse',
      sourceAmount: '10.15',
      sourceAssetCode: 'BRL',
      destinationAmount: '10.07',
      destinationAssetCode: 'BRL',
      hash: 'sandbox-ledger-duplicate',
      dedupeKey: 'pix-onramp:operation-duplicate',
      externalDeliveryText: 'PIX confirmado com sucesso.\nValor recebido: R$10.07',
    });

    expect(result).toBe('https://app.example.com/receipt/once');
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: 'receipt:pix-onramp:operation-duplicate:text',
    }));
    expect(notifySpy).not.toHaveBeenCalled();

    createSpy.mockRestore();
    saveSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('delivers only the first external callback for repeated receipt dedupe keys', async () => {
    const createSpy = jest.spyOn(PaymentReceiptService, 'createReceiptLink').mockResolvedValue('https://app.example.com/receipt/once');
    const saveSpy = jest.spyOn(PaymentReceiptService as any, 'saveReceiptMessage')
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: {
        attempted: true,
        delivered: 1,
        recipients: 1,
        instances: ['TalkToStellar'],
        attempts: [],
      },
    });

    const result = await PaymentReceiptService.sendReceipt({
      type: 'payment_received',
      sessionId: 'session-pix-dedupe',
      userId: 'user-pix-dedupe',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'PIX',
      sourceAmount: '10.15',
      sourceAssetCode: 'BRL',
      destinationAmount: '10.07',
      destinationAssetCode: 'BRL',
      hash: 'sandbox-ledger-duplicate',
      dedupeKey: 'pix-onramp:operation-duplicate',
      externalDeliveryText: 'PIX confirmado com sucesso.\nValor recebido: R$10.07',
    });

    await PaymentReceiptService.sendReceipt({
      type: 'payment_received',
      sessionId: 'session-pix-dedupe',
      userId: 'user-pix-dedupe',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'PIX',
      sourceAmount: '10.15',
      sourceAssetCode: 'BRL',
      destinationAmount: '10.07',
      destinationAssetCode: 'BRL',
      hash: 'sandbox-ledger-duplicate',
      dedupeKey: 'pix-onramp:operation-duplicate',
      externalDeliveryText: 'PIX confirmado com sucesso.\nValor recebido: R$10.07',
    });

    expect(result).toBe('https://app.example.com/receipt/once');
    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: 'receipt:pix-onramp:operation-duplicate:text',
    }));
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      text: expect.stringContaining('PIX confirmado com sucesso.'),
      buttonText: null,
      buttonUrl: null,
    }));

    createSpy.mockRestore();
    saveSpy.mockRestore();
    notifySpy.mockRestore();
  });

  it('preserves explicit conversion callback text and appends the receipt link', async () => {
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
      type: 'conversion',
      sessionId: 'session-conversion-callback',
      userId: 'user-conversion-callback',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'sua conta TalkToStellar',
      sourceAmount: '100',
      sourceAssetCode: 'XLM',
      destinationAmount: '65',
      destinationAssetCode: 'USDC',
      hash: 'conversion-callback-hash',
      externalDeliveryText: 'Conversão concluída.\nConvertido: 100 XLM\nRecebido: US$ 65.00',
    });

    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      buttonText: null,
      buttonUrl: null,
      text: expect.stringContaining('Conversão concluída.'),
    }));
    expect(notifySpy.mock.calls[0][0].text).toContain('Convertido: 100 XLM');
    expect(notifySpy.mock.calls[0][0].text).toContain('Recebido: US$ 65.00');
    expect(notifySpy.mock.calls[0][0].text).toContain('Comprovante: https://talk-to-stellar-owxg.vercel.app/');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Você economizou');
    expect(notifySpy.mock.calls[0][0].text).not.toContain('Taxa paga');

    notifySpy.mockRestore();
  });

  it('does not leak explicit external amount text when amount privacy is enabled', async () => {
    const notifySpy = jest.spyOn(TransferNotificationService, 'notifyExternalChannelMessage').mockResolvedValue({
      whatsapp: {
        attempted: true,
        delivered: 1,
        recipients: 1,
        instances: ['TalkToStellar'],
        attempts: [],
      },
    });
    const createSpy = jest
      .spyOn(PaymentReceiptService, 'createReceiptLink')
      .mockResolvedValueOnce('https://talk-to-stellar-owxg.vercel.app/receipt/hidden-values');
    const saveSpy = jest.spyOn(PaymentReceiptService as any, 'saveReceiptMessage').mockResolvedValue(true);

    await PaymentReceiptService.sendReceipt({
      type: 'payment_sent',
      sessionId: 'session-hidden-external',
      userId: 'user-hidden-external',
      language: 'en',
      provider: 'whatsapp',
      providerUserId: '5519997624114',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '100',
      sourceAssetCode: 'USDC',
      destinationAmount: '1539.91',
      destinationAssetCode: 'CETES',
      hash: 'tx-hidden-external',
      externalDeliveryText: 'PIX confirmed and transfer sent.\nAmount: 1539.91 CETES\nDestination: Ana Silva',
      hideAmounts: true,
    });

    const text = String(notifySpy.mock.calls[0]?.[0]?.text || '');
    expect(text).toContain('You sent a transfer to Ana Silva.');
    expect(text).toContain('Receipt: https://talk-to-stellar-owxg.vercel.app/receipt/hidden-values');
    expect(text).not.toContain('Amount:');
    expect(text).not.toContain('1539');
    expect(text).not.toContain('CETES');
    expect(text).not.toContain('US$');

    notifySpy.mockRestore();
    createSpy.mockRestore();
    saveSpy.mockRestore();
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
    expect(text).toContain('Comprovante: https://talk-to-stellar-owxg.vercel.app/');
    expect(text).not.toContain('Entregue: *US$ 0,00*');
    expect(text).not.toContain('Enviado: R$ 0,00');
    expect(text).not.toContain('Você economizou R$ 0,00');

    notifySpy.mockRestore();
  });
});
