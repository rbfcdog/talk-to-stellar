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
  source: 'configured_tesouro_asset',
  symbol: 'USDC/BRL',
  brlPerUsdc: '5.13000000',
  usdcPerBrl: '0.19493177',
  fetchedAt: '2026-05-15T12:00:00.000Z',
});
const mockQuoteBrlToUsdc = jest.fn(async (amountBrl: string) => {
  const sourceAmount = Number(String(amountBrl).replace(',', '.'));
  const brlPerUsdc = 5.13;
  return {
    source: 'configured_tesouro_asset',
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
const mockGetUsdBrlRate = jest.fn().mockResolvedValue({
  brlPerUsd: 5.13,
  source: 'configured_tesouro_asset',
  fetchedAt: '2026-05-15T12:00:00.000Z',
  fallbackApplied: false,
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
  },
}));

jest.mock('../src/api/services/fiat-rate.service', () => ({
  FiatRateService: {
    getUsdBrlRate: mockGetUsdBrlRate,
    isSaneUsdBrlRate: jest.fn(() => true),
    clearCacheForTests: jest.fn(),
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
    process.env.USD_BRL_FALLBACK_RATE = '5.13';
    process.env.XLM_USDC_FALLBACK_RATE = '0.1';
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
      'aplicação',
      'melhor rota',
      'histórico',
      'comparativo de economia',
      'apelido de transação',
      'link de pagamento',
      'PIN',
    ]));
    expect(parsed.message).toContain('R$, US$, CETES');
    expect(parsed.message).toContain('1. Contatos');
    expect(parsed.message).toContain('Link de pagamento');
    expect(parsed.message).toContain('Histórico, comprovantes e apelidos');
    expect(parsed.message).toContain('PIN e entrada com biometria');
    expect(JSON.stringify(parsed)).not.toMatch(/rendimento|rendendo|APY/i);
    expect(parsed.message).not.toMatch(/ciclo completo|money cycle|sair para meu PIX/i);
    expect(JSON.stringify(parsed)).not.toMatch(/Defindex|vault|XDR|issuer|trustline|Horizon|blockchain|crypto|TESOURO/i);
  });

  it('executes get_brl_usdc_quote from the configured BRL asset reference', async () => {
    const output = await executeTool('get_brl_usdc_quote', {});
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.source).toBe('configured_tesouro_asset');
    expect(parsed.brl_per_usdc).toBe('5.13000000');
    expect(parsed.usdc_per_brl).toBe('0.19493177');
    expect(parsed.message).toContain('BRL da sua conta');
    expect(mockGetUsdBrlRate).toHaveBeenCalledTimes(1);
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
    expect(mockGetUsdBrlRate).toHaveBeenCalled();
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
    expect(parsed.message).toContain('Options for review');
    expect(parsed.disclosure.toLowerCase()).toContain('preview only');
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
      action: 'review entry',
      amount: '100',
      currency: 'BRL',
      name: 'reais',
    });
    expect(parsed.frontend_url).toContain('/review?');
    expect(parsed.frontend_url).toContain('asset=BRL');
    expect(parsed.frontend_url).toContain('amount=100');
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
    const keepOutput = await executeTool('open_asset_interface', {
      action: 'keep',
      amount: '50',
      asset_code: 'CETES',
      language: 'en',
    });
    const keep = JSON.parse(keepOutput);

    expect(keep.success).toBe(true);
    expect(keep.frontend_url).toContain('/review?');
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
    expect(parsed.action).toBe('conversion_interface');
    expect(parsed.source_asset_code).toBe('BRL');
    expect(parsed.dest_asset_code).toBe('CETES');
    expect(parsed.frontend_url).toContain('/convert?');
    expect(parsed.frontend_url).toContain('amount=500');
    expect(parsed.frontend_url).toContain('source_asset=BRL');
    expect(parsed.frontend_url).toContain('dest_asset=CETES');
    expect(parsed.message).toContain('Conversion is ready to review');
    expect(JSON.stringify(parsed)).not.toMatch(/Defindex|vault|issuer|trustline|XDR/i);
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
    expect(parsed.error).toContain('review mode');
    expect(parsed.error).toContain('compliance approval');
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
