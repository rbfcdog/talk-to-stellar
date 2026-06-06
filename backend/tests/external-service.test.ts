import { ExternalService } from '../src/api/services/core/external.service';
import { Keypair } from '@stellar/stellar-sdk';

function createQuery(data: any[] = [], error: any = null) {
  const result = { data, error };
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => ({ data: data[0] || null, error })),
    single: jest.fn(async () => ({ data: data[0] || null, error })),
    insert: jest.fn(async () => ({ data: null, error: null })),
    upsert: jest.fn(async () => ({ data: null, error: null })),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function createSupabaseMock(input: {
  externalAccounts?: any[];
  agentStates?: any[];
  agentSessions?: any[];
}) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'external_accounts') return createQuery(input.externalAccounts || []);
      if (table === 'agent_states') return createQuery(input.agentStates || []);
      if (table === 'agent_sessions') return createQuery(input.agentSessions || []);
      return createQuery([]);
    }),
  };
}

function createFilteredExternalAccountsSupabaseMock(externalAccounts: any[]) {
  return {
    from: jest.fn((table: string) => {
      if (table !== 'external_accounts') return createQuery([]);
      let rows = externalAccounts;
      const query: any = {
        select: jest.fn(() => query),
        eq: jest.fn((column: string, value: string) => {
          rows = rows.filter((row) => String(row[column] || '') === String(value || ''));
          return query;
        }),
        order: jest.fn(() => query),
        limit: jest.fn(async () => ({ data: rows, error: null })),
        then: (resolve: any, reject: any) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
      };
      return query;
    }),
  };
}

describe('ExternalService.checkExternalAccount', () => {
  it('returns a linked Telegram account from external_accounts', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [
        {
          provider: 'telegram',
          provider_user_id: '6405034913',
          session_id: '21804a36-08bf-4abf-8854-039429571e5d',
          user_id: 'rodrigo@example.com',
          data: { telegram_chat_id: '6405034913' },
        },
      ],
    });

    const service = new ExternalService(supabase as any);
    const account = await service.checkExternalAccount('telegram', '6405034913');

    expect(account).toMatchObject({
      provider: 'telegram',
      provider_user_id: '6405034913',
      session_id: '21804a36-08bf-4abf-8854-039429571e5d',
      user_id: 'rodrigo@example.com',
    });
  });

  it('does not treat agent state as a Telegram account link when external_accounts is only a placeholder', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [
        {
          provider: 'telegram',
          provider_user_id: '6405034913',
          session_id: null,
          user_id: null,
          data: { telegram_chat_id: '6405034913' },
        },
      ],
      agentStates: [
        {
          session_id: '21804a36-08bf-4abf-8854-039429571e5d',
          action_params: {
            external_provider: 'telegram',
            external_provider_user_id: '6405034913',
          },
          updated_at: '2026-05-15T12:00:00.000Z',
        },
      ],
      agentSessions: [
        {
          session_id: '21804a36-08bf-4abf-8854-039429571e5d',
          user_id: 'rodrigo@example.com',
          email: 'rodrigo@example.com',
        },
      ],
    });

    const service = new ExternalService(supabase as any);
    const account = await service.checkExternalAccount('telegram', '6405034913');

    expect(account).toBeNull();
  });

  it('does not recover a Telegram account from agent state when external_accounts has no row yet', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [],
      agentStates: [
        {
          session_id: 'session-from-chat',
          action_params: {
            external_provider: 'telegram',
            external_provider_user_id: '6405034913',
          },
          updated_at: '2026-05-15T12:00:00.000Z',
        },
      ],
      agentSessions: [
        {
          session_id: 'session-from-chat',
          user_id: 'rodrigo@example.com',
          email: 'rodrigo@example.com',
        },
      ],
    });

    const service = new ExternalService(supabase as any);
    const account = await service.checkExternalAccount('telegram', '6405034913');

    expect(account).toBeNull();
  });

  it('returns null when there is no linked mapping and no matching chat state', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [],
      agentStates: [],
      agentSessions: [],
    });

    const service = new ExternalService(supabase as any);
    const account = await service.checkExternalAccount('telegram', '6405034913');

    expect(account).toBeNull();
  });
});

describe('ExternalService short-link expiry', () => {
  function createShortLinkSupabaseMock(row: any) {
    return {
      from: jest.fn((table: string) => {
        if (table === 'short_links') return createQuery(row ? [row] : []);
        return createQuery([]);
      }),
    };
  }

  it('rejects sensitive short links older than 15 minutes even with a future stored expiry', async () => {
    const service = new ExternalService(createShortLinkSupabaseMock({
      url: 'https://app.example.com/pix-ramp?amount=100',
      purpose: 'pix_onramp',
      token_hash: null,
      session_id: 'session-1',
      user_id: 'user-1',
      created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    }) as any);

    await expect(service.resolveShortLinkRecord('old-pix-link')).resolves.toBeNull();
  });

  it('keeps sensitive short links valid inside the 15 minute max age', async () => {
    const service = new ExternalService(createShortLinkSupabaseMock({
      url: 'https://app.example.com/pix-ramp?amount=100',
      purpose: 'pix_onramp',
      token_hash: null,
      session_id: 'session-1',
      user_id: 'user-1',
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }) as any);

    await expect(service.resolveShortLinkRecord('fresh-pix-link')).resolves.toMatchObject({
      url: 'https://app.example.com/pix-ramp?amount=100',
      session_id: 'session-1',
      user_id: 'user-1',
    });
  });
});

describe('ExternalService confirmation channel context', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DISABLE_SHORT_LINKS: 'true',
      PAYMENT_CONFIRM_BASE: 'https://app.example.com',
      JWT_SECRET: 'test-jwt-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('keeps the current WhatsApp channel on payment links even when the session has another saved channel', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [
        {
          provider: 'telegram',
          provider_user_id: '6405034913',
          session_id: 'session-1',
          user_id: 'user-1',
        },
      ],
    });
    const service = new ExternalService(supabase as any);
    const destination = Keypair.random().publicKey();

    const result = await service.createPaymentConfirmUrl({
      session_id: 'session-1',
      owner_id: 'user-1',
      amount: '10',
      asset_code: 'USDC',
      destination,
      destination_name: 'Ana Silva',
    }, {
      provider: 'whatsapp',
      provider_user_id: '5519981808102',
      source: 'whatsapp',
    });

    const parsedUrl = new URL(result.url);
    const tokenPayload = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString('utf8'));

    expect(parsedUrl.pathname).toBe('/confirm-payment');
    expect(parsedUrl.searchParams.get('provider')).toBe('whatsapp');
    expect(parsedUrl.searchParams.get('provider_user_id')).toBe('5519981808102');
    expect(tokenPayload.provider).toBe('whatsapp');
    expect(tokenPayload.provider_user_id).toBe('5519981808102');
  });

  it('keeps the current WhatsApp channel on conversion links when resolved session context points elsewhere', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [
        {
          provider: 'telegram',
          provider_user_id: '6405034913',
          session_id: 'session-1',
          user_id: 'user-1',
        },
      ],
    });
    const service = new ExternalService(supabase as any);

    const result = await service.createConversionConfirmUrlWithContext({
      session_id: 'session-1',
      owner_id: 'user-1',
      source_amount: '10',
      source_asset_code: 'USDC',
      dest_amount: '50',
      dest_asset_code: 'BRL',
    }, {
      provider: 'whatsapp',
      provider_user_id: '5519981808102',
      source: 'whatsapp',
    });

    const parsedUrl = new URL(result.url);
    const tokenPayload = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString('utf8'));

    expect(parsedUrl.pathname).toBe('/confirm-conversion');
    expect(parsedUrl.searchParams.get('provider')).toBe('whatsapp');
    expect(parsedUrl.searchParams.get('provider_user_id')).toBe('5519981808102');
    expect(tokenPayload.provider).toBe('whatsapp');
    expect(tokenPayload.provider_user_id).toBe('5519981808102');
  });

  it('keeps strict-receive conversion mode on conversion confirmation tokens', async () => {
    const supabase = createSupabaseMock({});
    const service = new ExternalService(supabase as any);

    const result = await service.createConversionConfirmUrlWithContext({
      session_id: 'session-1',
      owner_id: 'user-1',
      source_amount: '19.55',
      source_asset_code: 'USDC',
      dest_amount: '300',
      dest_asset_code: 'CETES',
      conversion_mode: 'strict_receive',
      quote: {
        sourceAmount: '19.55',
        sourceMax: '19.941',
        pathSourceAmount: '19.55',
        pathSourceMax: '19.941',
        destinationAmount: '300',
        networkFeeXlm: '0.00001',
        path: [],
      },
    });

    const tokenPayload = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString('utf8'));

    expect(tokenPayload.sub).toBe('external_conversion_confirm');
    expect(tokenPayload.source_amount).toBe('19.55');
    expect(tokenPayload.dest_amount).toBe('300');
    expect(tokenPayload.conversion_mode).toBe('strict_receive');
    expect(tokenPayload.quote.sourceMax).toBe('19.941');
    expect(tokenPayload.quote.pathSourceMax).toBe('19.941');
  });

  it('uses the user WhatsApp mapping for confirmation links when the browser session only has a web mapping', async () => {
    const supabase = createFilteredExternalAccountsSupabaseMock([
      {
        provider: 'web',
        provider_user_id: 'browser-session-1',
        session_id: 'browser-session-1',
        user_id: 'user-1',
      },
      {
        provider: 'whatsapp',
        provider_user_id: '5519981808102',
        session_id: 'whatsapp-session-1',
        user_id: 'user-1',
      },
    ]);
    const service = new ExternalService(supabase as any);
    const destination = Keypair.random().publicKey();

    const result = await service.createPaymentConfirmUrl({
      session_id: 'browser-session-1',
      owner_id: 'user-1',
      amount: '10',
      asset_code: 'USDC',
      destination,
      destination_name: 'Ana Silva',
    });

    const parsedUrl = new URL(result.url);
    const tokenPayload = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString('utf8'));

    expect(parsedUrl.searchParams.get('provider')).toBe('whatsapp');
    expect(parsedUrl.searchParams.get('provider_user_id')).toBe('5519981808102');
    expect(tokenPayload.provider).toBe('whatsapp');
    expect(tokenPayload.provider_user_id).toBe('5519981808102');
  });
});
