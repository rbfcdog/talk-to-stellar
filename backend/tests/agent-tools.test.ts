const mockSetAlertThreshold = jest.fn().mockResolvedValue(true);
const mockGetWalletConversionRules = jest.fn().mockResolvedValue([
  {
    id: 'rule-123',
    from_asset_code: 'XLM',
    to_asset_code: 'USDC',
    min_amount: 10,
    trigger_type: 'on_receive',
    enabled: true,
  },
]);
const mockDisableConversionRule = jest.fn().mockResolvedValue(true);
const mockGetReferenceRate = jest.fn().mockResolvedValue({
  source: 'transaction_values',
  symbol: 'USDC/BRL',
  brlPerUsdc: '5.13000000',
  usdcPerBrl: '0.19493177',
  fetchedAt: '2026-05-15T12:00:00.000Z',
});
const mockQuoteBrlToUsdc = jest.fn(async (amountBrl: string) => {
  const sourceAmount = Number(String(amountBrl).replace(',', '.'));
  const brlPerUsdc = 5.13;
  return {
    source: 'transaction_values',
    symbol: 'USDC/BRL',
    brlPerUsdc: brlPerUsdc.toFixed(8),
    usdcPerBrl: (1 / brlPerUsdc).toFixed(8),
    fetchedAt: '2026-05-15T12:00:00.000Z',
    sourceAmount: sourceAmount.toFixed(7),
    destinationAmount: (sourceAmount / brlPerUsdc).toFixed(7),
    sourceAsset: { code: 'TESOURO' },
    destinationAsset: { code: 'USDC' },
    path: [],
  };
});
const mockQuoteUsdcToBrl = jest.fn(async (amountUsdc: string) => {
  const sourceAmount = Number(String(amountUsdc).replace(',', '.'));
  const brlPerUsdc = 5.13;
  return {
    source: 'transaction_values',
    symbol: 'USDC/BRL',
    brlPerUsdc: brlPerUsdc.toFixed(8),
    usdcPerBrl: (1 / brlPerUsdc).toFixed(8),
    fetchedAt: '2026-05-15T12:00:00.000Z',
    sourceAmount: sourceAmount.toFixed(7),
    destinationAmount: (sourceAmount * brlPerUsdc).toFixed(7),
    sourceAsset: { code: 'USDC' },
    destinationAsset: { code: 'TESOURO' },
    path: [],
  };
});
jest.mock('../src/api/services/balance-alert.service', () => ({
  BalanceAlertService: {
    setAlertThreshold: mockSetAlertThreshold,
  },
}));

jest.mock('../src/api/services/auto-conversion.service', () => ({
  AutoConversionService: {
    getWalletConversionRules: mockGetWalletConversionRules,
    disableConversionRule: mockDisableConversionRule,
  },
}));

jest.mock('../src/api/services/brl-reference-rate.service', () => ({
  BrlReferenceRateService: {
    getReferenceRate: mockGetReferenceRate,
    quoteBrlToUsdc: mockQuoteBrlToUsdc,
    quoteUsdcToBrl: mockQuoteUsdcToBrl,
  },
}));

describe('Agent tool execution', () => {
  let executeTool: (toolName: string, toolInput: Record<string, any>) => Promise<string>;
  let supabaseMock: any;
  let apiStellarService: any;

  beforeAll(() => {
    ({ executeTool } = require('../src/api/agent/tools'));
    ({ supabase: supabaseMock } = require('../src/config/supabase'));
    ({ StellarService: apiStellarService } = require('../src/api/services/stellar.service'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as any);
    process.env.STELLAR_NETWORK = 'TESTNET';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('executes set_alert_threshold with mock data', async () => {
    const output = await executeTool('set_alert_threshold', {
      wallet_id: 42,
      threshold_usdc: 7.5,
    });

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.wallet_id).toBe(42);
    expect(parsed.threshold_usdc).toBe(7.5);
    expect(mockSetAlertThreshold).toHaveBeenCalledWith(42, 7.5);
  });

  it('executes get_conversion_rules with mock data', async () => {
    const output = await executeTool('get_conversion_rules', {
      wallet_id: 42,
    });

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0]).toMatchObject({
      id: 'rule-123',
      from_asset: 'XLM',
      to_asset: 'USDC',
      min_amount: 10,
      trigger: 'on_receive',
      enabled: true,
    });
    expect(mockGetWalletConversionRules).toHaveBeenCalledWith(42);
  });

  it('executes disable_conversion_rule with mock data', async () => {
    const output = await executeTool('disable_conversion_rule', {
      rule_id: 'rule-123',
    });

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.rule_id).toBe('rule-123');
    expect(mockDisableConversionRule).toHaveBeenCalledWith('rule-123');
  });

  it('lists the current chat capabilities around PIX, multi-asset conversion, review, and contacts', async () => {
    const output = await executeTool('get_intent_help', {});
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.commands.map((item: any) => item.command)).toEqual(expect.arrayContaining([
      'saldo',
      'contatos',
      'enviar',
      'PIX',
      'converter',
      'rendimentos',
      'melhor rota',
      'histórico',
      'comparativo de economia',
      'apelido de transação',
      'link de pagamento',
      'PIN',
    ]));
    expect(parsed.message).toContain('R$, US$, CETES');
    expect(parsed.message).toContain('XLM');
    expect(parsed.message).toContain('Também posso explicar');
    expect(parsed.message).toContain('Mais usados:');
    expect(parsed.message).toContain('Organização:');
    expect(parsed.message).toContain('Mais opções:');
    expect(parsed.message).toContain('Contatos');
    expect(parsed.message).toContain('Link de pagamento');
    expect(parsed.message).toContain('Aplicações e posições');
    expect(parsed.message).toContain('Histórico');
    expect(parsed.message).toContain('comprovantes e apelidos');
    expect(parsed.message).toContain('Perfil, PIN e acesso');
    expect(parsed.message).toContain('biometria');
    expect(parsed.message).toContain('inclusive com erros de digitação');
    expect(JSON.stringify(parsed)).not.toMatch(/rendendo|APY/i);
    expect(parsed.message).not.toMatch(/ciclo completo|money cycle|sair para meu PIX/i);
    expect(JSON.stringify(parsed)).not.toMatch(/Defindex|vault|XDR|issuer|trustline|Horizon|blockchain|crypto|TESOURO/i);
  });

  it('returns coded product context for LLM explanations', async () => {
    const output = await executeTool('get_product_context', {
      topic: 'all',
      language: 'pt-BR',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.features.map((item: any) => item.key)).toEqual(expect.arrayContaining([
      'contacts',
      'balance',
      'pix',
      'conversion',
      'rendimentos',
    ]));
    expect(parsed.assets.map((item: any) => item.code)).toEqual(expect.arrayContaining([
      'BRL',
      'USDC',
      'CETES',
      'XLM',
    ]));
    expect(parsed.rendimentos.user_copy).toContain('Nada é confirmado sem PIN');
  });

  it('explains user-facing assets directly without returning the generic help menu', async () => {
    const output = await executeTool('get_explanations', {
      topic: 'assets',
      language: 'pt-BR',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.topic).toBe('assets');
    expect(parsed.message).toContain('Assets são as moedas');
    expect(parsed.message).toContain('R$ / BRL');
    expect(parsed.message).toContain('USDC / US$');
    expect(parsed.message).toContain('CETES');
    expect(parsed.message).toContain('XLM');
    expect(parsed.message).toContain('nada é confirmado sem sua autorização');
    expect(parsed.message).not.toContain('Posso ajudar com sua conta TalkToStellar');
    expect(parsed.message).not.toContain('Mais usados:');
    expect(parsed.message).not.toContain('Organização:');
  });

  it('executes get_brl_usdc_quote from the configured BRL asset reference', async () => {
    const output = await executeTool('get_brl_usdc_quote', {});
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.source).toBe('transaction_values');
    expect(parsed.brl_per_usdc).toBe('5.13000000');
    expect(parsed.usdc_per_brl).toBe('0.19493177');
    expect(parsed.message).toContain('BRL da sua conta');
  });

  it('executes get_conversion_preview with live backend quote data and real fee fields', async () => {
    const output = await executeTool('get_conversion_preview', {
      brl_amount: '5000',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.quote.brl_per_usdc).toBe(5.13);
    expect(parsed.output.receive_usdc).toBeCloseTo(974.66, 2);
    expect(parsed.fees.total_fee_brl).toBeGreaterThanOrEqual(0);
    expect(parsed.comparison.traditional_fee_brl).toBe(175);
    expect(parsed.message).toContain('Estimativa: R$ 5.000 -> US$ 974,66 líquido.');
  });

  it('shows a WhatsApp savings calculator with real conversion preview data and comparison fees', async () => {
    const output = await executeTool('show_savings_calculator', {
      brl_amount: '5000',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.usd_received).toBeCloseTo(974.66, 2);
    expect(parsed.brl_per_usdc).toBe(5.13);
    expect(parsed.talktostellar_fee_brl).toBe(0);
    expect(parsed.traditional_bank_fee_brl).toBe(175);
    expect(parsed.wise_reference_fee_brl).toBe(90);
    expect(parsed.savings_brl).toBeGreaterThan(174.99);
    expect(parsed.annual_savings_brl).toBeGreaterThan(2099);
    expect(parsed.message).toContain('💸 *Simulação de envio: R$ 5.000*');
    expect(parsed.message).toContain('✅ Você recebe líquido: *US$ 974,66*');
    expect(parsed.message).toContain('💱 Dólar agora: *R$ 5,1300*');
    expect(parsed.message).toContain('Taxa total');
  });

  it('builds the WhatsApp receipt with savings before the technical hash', async () => {
    const ExternalService = require('../src/api/services/core/external.service').default;
    const { PaymentReceiptService } = require('../src/api/services/payment-receipt.service');
    const shortLinkSpy = jest
      .spyOn(ExternalService.prototype, 'shortenPublicUrl')
      .mockImplementation(async (input: any) => `https://app.example.com/r/${input.purpose}`);
    const receiptSpy = jest
      .spyOn(PaymentReceiptService, 'createReceiptLink')
      .mockResolvedValueOnce('https://app.example.com/receipt/test');

    try {
      const output = await executeTool('send_receipt_with_savings', {
        brl_sent: '5000',
        usd_received: '970.87',
        fee_charged: '15',
        stellar_hash: 'a3f8b2ccccccccccccccccccccccccccccccccccccccccccd91c',
        recipient_name: 'Ana Silva',
        session_id: '11111111-1111-4111-8111-111111111111',
        user_id: 'user-1',
      });
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.savings_brl).toBe(160);
      expect(parsed.recipient_name).toBe('Ana Silva');
      expect(parsed.message).toContain('✅ *Transferência concluída*');
      expect(parsed.message).toContain('👤 Destinatário: *Ana Silva*');
      expect(parsed.message).toContain('💰 *Você economizou R$ 160,00*');
      expect(parsed.message.indexOf('💰 *Você economizou')).toBeLessThan(parsed.message.indexOf('📄 Comprovante PDF:'));
      expect(parsed.message).toContain('📊 Ver histórico: https://app.example.com/r/savings_history');
      expect(parsed.message).toContain('📄 Comprovante PDF: https://app.example.com/receipt/test');
      expect(receiptSpy).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: '11111111-1111-4111-8111-111111111111',
        userId: 'user-1',
        counterpartyLabel: 'Ana Silva',
      }));
    } finally {
      shortLinkSpy.mockRestore();
      receiptSpy.mockRestore();
    }
  });

  it('falls back to an asset-aware receipt when savings receipt is called for XLM', async () => {
    const { PaymentReceiptService } = require('../src/api/services/payment-receipt.service');
    const receiptSpy = jest
      .spyOn(PaymentReceiptService, 'createReceiptLink')
      .mockResolvedValueOnce('https://app.example.com/receipt/xlm');

    try {
      const output = await executeTool('send_receipt_with_savings', {
        source_amount: '10',
        source_asset_code: 'XLM',
        destination_amount: '10',
        destination_asset_code: 'XLM',
        fee_display: '0.00001 XLM',
        stellar_hash: 'xlmhash123',
        recipient_name: 'Ana Silva',
        session_id: '11111111-1111-4111-8111-111111111111',
        user_id: 'user-1',
      });
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain('Você enviou 10 XLM para Ana Silva.');
      expect(parsed.message).toContain('Comprovante: https://app.example.com/receipt/xlm');
      expect(parsed.message).not.toContain('US$ 0,00');
      expect(parsed.message).not.toContain('R$ 0,00');
      expect(parsed.message).not.toContain('economizou');
    } finally {
      receiptSpy.mockRestore();
    }
  });

  it('sanitizes conversion route failures before returning them to chat', async () => {
    const quoteSpy = jest
      .spyOn(apiStellarService, 'quoteStrictSendConversion')
      .mockRejectedValueOnce(new Error(
        'Não foi encontrado caminho de conversão entre USDC e BRL. source_issuer=GUSDC; dest_issuer=GBRL. Diagnóstico: Sem rota de liquidez | Confirme trustline.'
      ));

    try {
      const output = await executeTool('get_best_route', {
        source_public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        destination: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        source_amount: '100',
        source_asset_code: 'USDC',
        source_asset_issuer: 'GUSDC',
        dest_asset_code: 'BRL',
        dest_asset_issuer: 'GBRL',
      });
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('rota segura');
      expect(parsed.error).not.toContain('source_issuer');
      expect(parsed.error).not.toContain('dest_issuer');
      expect(parsed.error).not.toMatch(/trustline|liquidez/i);
    } finally {
      quoteSpy.mockRestore();
    }
  });

  it('executes get_pair_quote for any configured pair using the dynamic best-route matrix', async () => {
    const quoteSpy = jest
      .spyOn(apiStellarService, 'quoteStrictSendConversion')
      .mockImplementation(async ({ sourceAsset, destAsset, sourceAmount }: any) => {
        const source = String(sourceAsset?.code || '').toUpperCase() === 'TESOURO' ? 'BRL' : String(sourceAsset?.code || '').toUpperCase();
        const destination = String(destAsset?.code || '').toUpperCase() === 'TESOURO' ? 'BRL' : String(destAsset?.code || '').toUpperCase();
        const rates: Record<string, number> = {
          'XLM->USDC': 0.2,
          'USDC->XLM': 5,
          'CETES->USDC': 0.1,
          'USDC->CETES': 10,
        };
        const rate = rates[`${source}->${destination}`];
        if (!rate) throw new Error(`No direct route for ${source}->${destination}`);
        const amount = Number(String(sourceAmount || '0').replace(',', '.'));
        return {
          sourceAmount: amount.toFixed(7),
          destinationAmount: (amount * rate).toFixed(7),
          sourceAsset,
          destinationAsset: destAsset,
          destinationMin: (amount * rate * 0.99).toFixed(7),
          path: [],
          platformFee: { enabled: false, feeAmount: '0', feeAssetCode: source, feeBps: 0 },
          networkFeeXlm: '0.0000100',
        };
      });

    try {
      const output = await executeTool('get_pair_quote', {
        source_asset_code: 'XLM',
        dest_asset_code: 'CETES',
        source_amount: '100',
        language: 'pt-BR',
      });
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.source_asset_code).toBe('XLM');
      expect(parsed.dest_asset_code).toBe('CETES');
      expect(parsed.source_amount).toBe('100');
      expect(parsed.destination_amount).toBe('200');
      expect(parsed.rate).toBeCloseTo(2, 10);
      expect(parsed.route_status).toBe('synthetic');
      expect(parsed.bridge_asset_code).toBe('USDC');
      expect(parsed.all_pairs_summary.total_pairs).toBe(16);
      expect(parsed.message).toContain('Cotação de envio pela melhor rota');
      expect(parsed.message).toContain('100 XLM');
      expect(parsed.message).toContain('200 CETES');
    } finally {
      quoteSpy.mockRestore();
    }
  });

  it('executes get_all_pair_quotes with a compact dynamic pair summary', async () => {
    const quoteSpy = jest
      .spyOn(apiStellarService, 'quoteStrictSendConversion')
      .mockImplementation(async ({ sourceAsset, destAsset, sourceAmount }: any) => {
        const source = String(sourceAsset?.code || '').toUpperCase() === 'TESOURO' ? 'BRL' : String(sourceAsset?.code || '').toUpperCase();
        const destination = String(destAsset?.code || '').toUpperCase() === 'TESOURO' ? 'BRL' : String(destAsset?.code || '').toUpperCase();
        const rates: Record<string, number> = {
          'XLM->USDC': 0.2,
          'USDC->XLM': 5,
          'CETES->USDC': 0.1,
          'USDC->CETES': 10,
        };
        const rate = rates[`${source}->${destination}`];
        if (!rate) throw new Error(`No direct route for ${source}->${destination}`);
        const amount = Number(String(sourceAmount || '0').replace(',', '.'));
        return {
          sourceAmount: amount.toFixed(7),
          destinationAmount: (amount * rate).toFixed(7),
          sourceAsset,
          destinationAsset: destAsset,
          destinationMin: (amount * rate * 0.99).toFixed(7),
          path: [],
          platformFee: { enabled: false, feeAmount: '0', feeAssetCode: source, feeBps: 0 },
          networkFeeXlm: '0.0000100',
        };
      });

    try {
      const output = await executeTool('get_all_pair_quotes', {
        language: 'pt-BR',
      });
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.assets).toEqual(['BRL', 'USDC', 'CETES', 'XLM']);
      expect(parsed.summary.total_pairs).toBe(16);
      expect(parsed.displayed_pairs).toBe(6);
      expect(parsed.pairs).toHaveLength(6);
      expect(parsed.message).toContain('Cotações atuais');
      expect(parsed.message).toContain('BRL/USDC: R$ 1.00 -> US$');
      expect(parsed.message).toContain('USDC/XLM: US$ 1.00 ->');
      expect(parsed.message).toContain('CETES/XLM: 1 CETES ->');
      expect(parsed.message).toContain('Conferi arbitragem direta de ida e volta');
      expect(parsed.message).not.toContain('mesmo ativo');
      expect(parsed.message).not.toContain('US$ 1.00 -> US$ 1.00');
      expect(parsed.message).toContain('Nada é executado sem abrir a confirmação e digitar o PIN');
    } finally {
      quoteSpy.mockRestore();
    }
  });

  it('uses exact-target pricing for market price pair quotes', async () => {
    const quoteSpy = jest
      .spyOn(apiStellarService, 'quotePathPayment')
      .mockResolvedValueOnce({
        sourceAmount: '69.82',
        destinationAmount: '100',
        sourceAsset: { code: 'TESOURO' },
        destinationAsset: { code: 'XLM' },
        sourceMax: '71.2164',
        pathSourceAmount: '69.82',
        pathSourceMax: '71.2164',
        path: [],
        platformFee: { enabled: false, feeAmount: '0', feeAssetCode: 'TESOURO', feeBps: 0 },
        networkFeeXlm: '0.0000100',
      });

    try {
      const output = await executeTool('get_pair_quote', {
        source_asset_code: 'XLM',
        dest_asset_code: 'BRL',
        source_amount: '100',
        amount_was_provided: true,
        quote_mode: 'market_price',
        language: 'pt-BR',
      });
      const parsed = JSON.parse(output);

      expect(quoteSpy).toHaveBeenCalledWith(expect.objectContaining({
        destAmount: '100',
        sourceAsset: expect.objectContaining({ code: 'TESOURO' }),
        destAsset: expect.objectContaining({ code: 'XLM' }),
      }));
      expect(parsed.success).toBe(true);
      expect(parsed.quote_mode).toBe('market_price');
      expect(parsed.target_asset_code).toBe('XLM');
      expect(parsed.price_asset_code).toBe('BRL');
      expect(parsed.target_amount).toBe('100');
      expect(parsed.required_amount).toBe('69.82');
      expect(parsed.rate).toBeCloseTo(0.6982, 10);
      expect(parsed.message).toContain('para receber 100 XLM');
      expect(parsed.message).toContain('R$ 69.82');
      expect(parsed.message).toContain('alvo exato');
      expect(parsed.message).not.toContain('R$ 287');
    } finally {
      quoteSpy.mockRestore();
    }
  });

  it('preserves WhatsApp channel context in payment confirmation links', async () => {
    const ExternalService = require('../src/api/services/core/external.service').default;
    const createPaymentSpy = jest
      .spyOn(ExternalService.prototype, 'createPaymentConfirmUrl')
      .mockResolvedValueOnce({
        token: 'payment-token',
        url: 'https://app.example.com/r/payment',
      });

    try {
      const output = await executeTool('prepare_payment_confirmation', {
        session_id: '11111111-1111-4111-8111-111111111111',
        owner_id: 'user-1',
        amount: '100',
        asset_code: 'USDC',
        destination: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        destination_name: 'Ana Silva',
        provider: 'whatsapp',
        provider_user_id: '5519981808102',
        source: 'whatsapp',
      });
      const parsed = JSON.parse(output);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain('Gerei o link de confirmação com a cotação atual');
      expect(parsed.message).toContain('100 USDC');
      expect(parsed.message).toContain('Ana Silva');
      expect(parsed.message).toContain('https://app.example.com/r/payment');
      expect(parsed.message).not.toMatch(/saldo/i);
      expect(parsed.message).not.toMatch(/taxa estimada|indispon[ií]vel/i);
      expect(createPaymentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: '11111111-1111-4111-8111-111111111111',
          owner_id: 'user-1',
          amount: '100',
        }),
        expect.objectContaining({
          provider: 'whatsapp',
          provider_user_id: '5519981808102',
          source: 'whatsapp',
        })
      );
    } finally {
      createPaymentSpy.mockRestore();
    }
  });

  it('lists yield options with user-facing currencies and no provider internals', async () => {
    const { AnchorService } = require('../src/api/services/anchor.service');
    const statusSpy = jest.spyOn(AnchorService, 'getDefindexYieldStatus').mockResolvedValueOnce({
      success: true,
      runtime: {
        configured: true,
        execution_enabled: false,
        network: 'testnet',
      },
      vaults: [
        { asset_code: 'USDC', display_asset_code: 'USDC', apy_percent: '5.25' },
        { asset_code: 'CETES', display_asset_code: 'CETES', apy: { apyPercent: '8.75' } },
        { asset_code: 'XLM', display_asset_code: 'XLM', apy_percent: '2.1' },
      ],
    } as any);

    const output = await executeTool('get_yield_options', { language: 'en' });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.options).toEqual([
      { currency: 'USD', name: 'dollars', available: true },
      { currency: 'CETES', name: 'Mexico test option', available: true },
      { currency: 'XLM', name: 'XLM', available: true },
    ]);
    expect(parsed.message).toContain('Earnings options');
    expect(parsed.disclosure.toLowerCase()).toContain('testnet');
    expect(parsed.disclosure.toLowerCase()).not.toMatch(/investment advice|fixed income|savings account|bank deposit/);
    expect(JSON.stringify(parsed)).not.toMatch(/APY|estimated_apy/i);
    expect(JSON.stringify(parsed)).not.toMatch(/vault|TESOURO|XDR/i);
    expect(statusSpy).toHaveBeenCalledTimes(1);
  });

  it('prepares yield through the tool layer without exposing unsigned operation payloads', async () => {
    const { AnchorService } = require('../src/api/services/anchor.service');
    const prepareSpy = jest.spyOn(AnchorService, 'prepareDefindexYieldForSession').mockResolvedValueOnce({
      success: true,
      prepared: true,
      public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      action: 'deposit',
      amount: '100',
      amount_units: 1000000000,
      vault: { asset_code: 'TESOURO', display_asset_code: 'BRL' },
      xdr: 'UNSIGNED_OPERATION_SHOULD_NOT_LEAK',
      raw: { provider: 'defindex' },
    } as any);
    jest.spyOn(AnchorService, 'getDefindexYieldStatus').mockResolvedValueOnce({
      success: true,
      runtime: { configured: true, execution_enabled: true },
      vaults: [],
    } as any);

    const output = await executeTool('prepare_yield_action', {
      session_id: '11111111-1111-4111-8111-111111111111',
      action: 'deposit',
      amount: '100',
      asset_code: 'BRL',
      language: 'en',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.review).toMatchObject({
      action: 'apply',
      amount: '100',
      currency: 'BRL',
      name: 'reais',
    });
    expect(parsed.frontend_url).toContain('/r/');
    expect(parsed.message).toContain(parsed.frontend_url);
    expect(prepareSpy).toHaveBeenCalledWith(expect.objectContaining({
      session_id: '11111111-1111-4111-8111-111111111111',
      action: 'deposit',
      amount: '100',
      asset_code: 'TESOURO',
    }));
    expect(parsed).not.toHaveProperty('xdr');
    expect(parsed).not.toHaveProperty('raw');
    expect(parsed).not.toHaveProperty('public_key');
    expect(JSON.stringify(parsed)).not.toMatch(/Defindex|vault|XDR|UNSIGNED_OPERATION/i);
  });

  it('opens frontend interfaces for broad multi-asset money intents', async () => {
    const bringOutput = await executeTool('open_asset_interface', {
      action: 'bring',
      amount: '100',
      language: 'pt-BR',
    });
    const bring = JSON.parse(bringOutput);

    expect(bring.success).toBe(true);
    expect(bring.asset_code).toBe('BRL');
    expect(bring.frontend_url).toContain('/pix-on?');
    expect(bring.frontend_url).toContain('asset=BRL');
    expect(bring.frontend_url).toContain('currency=BRL');

    const bringUsdOutput = await executeTool('open_asset_interface', {
      action: 'bring',
      amount: '100',
      asset_code: 'USDC',
      language: 'pt-BR',
    });
    const bringUsd = JSON.parse(bringUsdOutput);

    expect(bringUsd.success).toBe(true);
    expect(bringUsd.frontend_url).toContain('/pix-on?');
    expect(bringUsd.frontend_url).toContain('asset=BRL');
    expect(bringUsd.frontend_url).toContain('target_asset=USDC');
    expect(bringUsd.frontend_url).toContain('currency=BRL');

    const keepOutput = await executeTool('open_asset_interface', {
      action: 'keep',
      amount: '50',
      asset_code: 'CETES',
      language: 'en',
    });
    const keep = JSON.parse(keepOutput);

    expect(keep.success).toBe(true);
    expect(keep.frontend_url).toContain('/rendimentos?');
    expect(keep.frontend_url).toContain('view=application');
    expect(keep.frontend_url).toContain('asset=CETES');
    expect(keep.frontend_url).toContain('amount=50');

    const sendOutOutput = await executeTool('open_asset_interface', {
      action: 'send_out',
      amount: '120',
      asset_code: 'BRL',
      destination_pix_key: 'user@example.com',
      language: 'pt-BR',
    });
    const sendOut = JSON.parse(sendOutOutput);

    expect(sendOut.success).toBe(true);
    expect(sendOut.frontend_url).toContain('/pix-off?');
    expect(sendOut.frontend_url).toContain('destination_pix_key=user%40example.com');
    expect(sendOut.message).toContain('Mandar para PIX');
  });

  it('does not expose the deprecated money cycle interface', async () => {
    const output = await executeTool('open_money_cycle', {
      amount: '500',
      asset_code: 'BRL',
      destination_pix_key: 'user@example.com',
      language: 'pt-BR',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unknown tool');
  });

  it('opens the conversion interface with multi-asset defaults from chat', async () => {
    const output = await executeTool('open_conversion_interface', {
      source_amount: '500',
      source_asset_code: 'BRL',
      dest_asset_code: 'CETES',
      language: 'en',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe('conversion_confirmation_prefill');
    expect(parsed.source_asset_code).toBe('BRL');
    expect(parsed.dest_asset_code).toBe('CETES');
    expect(parsed.frontend_url).toContain('/convert?');
    expect(parsed.frontend_url).toContain('amount=500');
    expect(parsed.frontend_url).toContain('source_asset=BRL');
    expect(parsed.frontend_url).toContain('dest_asset=CETES');
    expect(parsed.message).toContain('Conversion is ready to review');
    expect(JSON.stringify(parsed)).not.toMatch(/Defindex|vault|issuer|trustline|XDR/i);
  });

  it('opens the conversion picker when amount or assets are missing', async () => {
    const output = await executeTool('open_conversion_interface', {
      language: 'pt-BR',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.action).toBe('conversion_picker');
    expect(parsed.frontend_url).toContain('/convert?');
    expect(parsed.message).toContain('escolher valor e moedas');
  });

  it('sanitizes yield confirmation setup errors before returning them to chat', async () => {
    const { AnchorService } = require('../src/api/services/anchor.service');
    jest.spyOn(AnchorService, 'executeDefindexYieldForSession').mockRejectedValueOnce(
      new Error('Execução Defindex está desativada. Configure DEFINDEX_ENABLE_EXECUTION=true para assinar e enviar XDR.')
    );

    const output = await executeTool('confirm_yield_action', {
      session_id: '11111111-1111-4111-8111-111111111111',
      action: 'deposit',
      amount: '100',
      asset_code: 'BRL',
      pin: '1234',
      language: 'en',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('view-only');
    expect(parsed.error).toContain('environment');
    expect(parsed.error).not.toMatch(/Defindex|DEFINDEX|XDR|vault/i);
  });

  it('adds an existing TalkToStellar user by email directly from the database', async () => {
    const teamPublicKey = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const tableResults: Record<string, Array<{ data: any; error: any }>> = {
      wallets: [
        { data: null, error: null },
        { data: null, error: null },
        { data: { session_id: 'team-session', public_key: teamPublicKey, name: 'Team TalkToStellar', pix_key: 'team.talktostellar@gmail.com' }, error: null },
      ],
      contacts: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      agent_sessions: [
        { data: [], error: null },
        { data: [], error: null },
        { data: { user_id: 'team-user', email: 'team.talktostellar@gmail.com', phone_number: null }, error: null },
      ],
      users: [
        { data: { id: 'team-user', email: 'team.talktostellar@gmail.com', stellar_public_key: teamPublicKey }, error: null },
      ],
      external_accounts: [
        { data: [], error: null },
      ],
    };
    const upsertPayloads: any[] = [];

    supabaseMock.from = jest.fn((table: string) => {
      const query: any = {
        select: jest.fn(() => query),
        eq: jest.fn(() => query),
        ilike: jest.fn(() => query),
        order: jest.fn(() => query),
        limit: jest.fn(() => query),
        maybeSingle: jest.fn(async () => tableResults[table]?.shift() || { data: null, error: null }),
        single: jest.fn(async () => tableResults[table]?.shift() || { data: null, error: null }),
        upsert: jest.fn((payload: any) => {
          upsertPayloads.push(payload);
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: 'contact-team',
                  owner_id: payload.owner_id,
                  contact_name: payload.contact_name,
                  stellar_public_key: payload.stellar_public_key,
                  pix_key: payload.pix_key,
                },
                error: null,
              }),
            }),
          };
        }),
        then: (resolve: any, reject: any) => Promise
          .resolve(tableResults[table]?.shift() || { data: [], error: null })
          .then(resolve, reject),
      };
      return query;
    });

    const output = await executeTool('add_contact', {
      user_id: 'owner-user',
      contact_key: 'team.talktostellar@gmail.com',
    });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(supabaseMock.from).toHaveBeenCalledWith('users');
    expect(upsertPayloads[0]).toMatchObject({
      owner_id: 'owner-user',
      contact_name: 'team.talktostellar@gmail.com',
      stellar_public_key: teamPublicKey,
      pix_key: 'team.talktostellar@gmail.com',
    });
    expect(parsed.message).toContain('Contato adicionado com sucesso');
    expect(parsed.message).toContain('team.talktostellar@gmail.com');
  });
});
