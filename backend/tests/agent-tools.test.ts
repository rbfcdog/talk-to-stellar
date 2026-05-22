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
  source: 'configured_brl_asset',
  symbol: 'USDC/BRL',
  brlPerUsdc: '5.13000000',
  usdcPerBrl: '0.19493177',
  fetchedAt: '2026-05-15T12:00:00.000Z',
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
  },
}));

describe('Agent tool execution', () => {
  let executeTool: (toolName: string, toolInput: Record<string, any>) => Promise<string>;
  let supabaseMock: any;
  let apiStellarService: any;

  beforeAll(() => {
    ({ executeTool } = require('../src/agent/tools'));
    ({ supabase: supabaseMock } = require('../src/config/supabase'));
    ({ StellarService: apiStellarService } = require('../src/api/services/stellar.service'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('executes get_brl_usdc_quote from the configured BRL asset reference', async () => {
    const output = await executeTool('get_brl_usdc_quote', {});
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.source).toBe('configured_brl_asset');
    expect(parsed.brl_per_usdc).toBe('5.13000000');
    expect(parsed.usdc_per_brl).toBe('0.19493177');
    expect(parsed.message).toContain('BRL da sua conta');
    expect(mockGetReferenceRate).toHaveBeenCalledTimes(1);
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
