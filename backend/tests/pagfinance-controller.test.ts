const mockDb: { tables: Record<string, any[]>; inserts: Array<{ table: string; row: any }>; insertError: any } = {
  tables: {},
  inserts: [],
  insertError: null,
};

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<[string, any]> = [];
      const rowsFor = () =>
        (mockDb.tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v || k === '__like'));
      const builder: any = {
        select: () => builder,
        eq: (k: string, v: any) => {
          filters.push([k, v]);
          return builder;
        },
        not: () => builder,
        like: () => builder,
        order: () => builder,
        insert: (rows: any[]) => {
          if (mockDb.insertError) return Promise.resolve({ data: null, error: mockDb.insertError });
          for (const row of rows) mockDb.inserts.push({ table, row });
          return Promise.resolve({ data: rows, error: null });
        },
        limit: (n: number) => Promise.resolve({ data: rowsFor().slice(0, n), error: null }),
        maybeSingle: () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null }),
      };
      return builder;
    },
  },
}));

const mockSession = {
  getSession: jest.fn(),
};
jest.mock('../src/api/repository/core/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => mockSession),
}));

const mockWalletRepo = {
  getWalletBySession: jest.fn(),
};
jest.mock('../src/api/repository/core/wallet.repository', () => ({
  WalletRepository: jest.fn().mockImplementation(() => mockWalletRepo),
}));

jest.mock('../src/api/repository/operation.repository', () => ({
  OperationRepository: { create: jest.fn(), update: jest.fn() },
}));

jest.mock('../src/api/services/brl-reference-rate.service', () => ({
  BrlReferenceRateService: { quoteBrlToUsdc: jest.fn() },
}));

jest.mock('../src/integrations/pagfinance/settlement', () => ({
  claimOperationForCredit: jest.fn(),
  settleCashinOperation: jest.fn().mockResolvedValue(undefined),
  findOperationByPagfinanceIntentId: jest.fn(),
}));

const mockService: any = {
  enabled: true,
  settings: {
    minBrlAmount: 1,
    maxBrlAmount: 5000,
    intentExpiresInSeconds: 900,
    fallbackBrlPerUsdc: null,
  },
  ensureUser: jest.fn(),
  createIntent: jest.fn(),
  getIntent: jest.fn(),
};
jest.mock('../src/integrations/pagfinance', () => {
  const actualTypes = jest.requireActual('../src/integrations/pagfinance/types');
  return {
    getPagfinanceService: () => mockService,
    PagfinanceClient: { idempotencyKey: (prefix: string) => `${prefix}_test_key_123456` },
    PagfinanceApiError: actualTypes.PagfinanceApiError,
  };
});

import { PagfinanceController, isValidCpf } from '../src/api/controllers/pagfinance.controller';
import { OperationRepository } from '../src/api/repository/operation.repository';
import { BrlReferenceRateService } from '../src/api/services/brl-reference-rate.service';
import { PagfinanceApiError } from '../src/integrations/pagfinance/types';

const quoteBrlToUsdc = BrlReferenceRateService.quoteBrlToUsdc as jest.Mock;
const createOperation = OperationRepository.create as jest.Mock;

const VALID_CPF = '52998224725'; // passes check digits
const SESSION = {
  session_id: 's1',
  session_token: 'tok',
  user_id: 'u1',
  public_key: 'GPUBKEYPUBKEYPUBKEYPUBKEYPUBKEYPUBKEYPUBKEYPUBKEY123',
  email: 'ana@example.com',
  updated_at: new Date().toISOString(),
};

function fakeReq(overrides: any = {}) {
  return {
    headers: { 'x-session-id': 's1', 'x-session-token': 'tok' },
    query: {},
    body: {},
    params: {},
    ...overrides,
  } as any;
}

function fakeRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const ENV_KEYS = ['STELLAR_NETWORK', 'TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY', 'TALKTOSTELLAR_SPREAD_BPS'];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.STELLAR_NETWORK = 'TESTNET';
  mockDb.tables = {};
  mockDb.inserts = [];
  mockDb.insertError = null;
  jest.clearAllMocks();
  mockService.enabled = true;
  mockService.settings.fallbackBrlPerUsdc = null;
  mockSession.getSession.mockResolvedValue({ ...SESSION });
  mockWalletRepo.getWalletBySession.mockResolvedValue({ public_key: SESSION.public_key, name: 'Ana Silva' });
  quoteBrlToUsdc.mockResolvedValue({ destinationAmount: '9.5', brlPerUsdc: '5.26' });
  createOperation.mockResolvedValue({ id: 'op-1', created_at: 'now' });
  mockService.createIntent.mockResolvedValue({
    intentId: 'int-abc',
    status: 'ACTIVE',
    valueCents: 5000,
    brCode: 'br-code-payload',
    qrCodeImage: 'https://qr.example/img.png',
    paymentLinkUrl: 'https://pay.example/x',
    expiresIn: 900,
    cryptoEstimate: 9.4,
  });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('isValidCpf', () => {
  it('accepts a valid CPF and rejects invalid ones', () => {
    expect(isValidCpf(VALID_CPF)).toBe(true);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('12345678900')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });
});

describe('createCashinIntent', () => {
  function withStoredCpf() {
    mockDb.tables.external_accounts = [{ session_id: 's1', data: { cpf: VALID_CPF, name: 'Ana Silva' } }];
    mockDb.tables.wallets = [{ session_id: 's1', name: 'Ana Silva' }];
  }

  it('rejects without a valid session', async () => {
    mockSession.getSession.mockResolvedValue(null);
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(fakeReq(), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 503 when the integration is disabled', async () => {
    mockService.enabled = false;
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(fakeReq(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('pagfinance_unavailable');
  });

  it('rejects an out-of-range amount', async () => {
    withStoredCpf();
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(fakeReq({ body: { amount_brl: 999999 } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('invalid_amount');
  });

  it('asks for customer data when no CPF is known', async () => {
    mockDb.tables.wallets = [{ session_id: 's1', name: 'Ana Silva' }];
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(fakeReq({ body: { amount_brl: 50 } }), res);
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('needs_customer_data');
  });

  it('rejects an invalid CPF sent in the request', async () => {
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(
      fakeReq({ body: { amount_brl: 50, customer_name: 'Ana', customer_tax_id: '12345678900' } }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('invalid_tax_id');
  });

  it('creates the intent, persists the operation context, and returns the QR payload', async () => {
    withStoredCpf();
    process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY = 'GFEETREASURY';
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(fakeReq({ body: { amount_brl: 50 } }), res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      operation_id: 'op-1',
      intent_id: 'int-abc',
      br_code: 'br-code-payload',
      payment_link_url: 'https://pay.example/x',
    });
    expect(res.body.usdc_estimate.gross).toBeCloseTo(9.5, 6);
    expect(res.body.usdc_estimate.net).toBeLessThan(9.5);

    expect(mockService.ensureUser).toHaveBeenCalledWith(SESSION.public_key, expect.objectContaining({ name: 'Ana Silva' }));
    expect(mockService.createIntent).toHaveBeenCalledWith(
      SESSION.public_key,
      expect.objectContaining({
        amount: 50,
        customer: expect.objectContaining({ name: 'Ana Silva', taxID: VALID_CPF }),
      }),
      'pgf_test_key_123456',
    );

    const persisted = createOperation.mock.calls[0][0];
    expect(persisted).toMatchObject({
      user_id: 'u1',
      type: 'PIX_ONRAMP',
      status: 'PENDING',
      amount: 50,
      asset_code: 'USDC',
      source_session_id: 's1',
      source_public_key: SESSION.public_key,
    });
    const context = JSON.parse(persisted.context);
    expect(context).toMatchObject({
      provider: 'pagfinance',
      pagfinance_intent_id: 'int-abc',
      anchor_order_id: 'int-abc',
      source_amount_brl: 50,
      final_asset_code: 'USDC',
      value_cents: 5000,
      rate_source: 'onchain_path',
      br_code: 'br-code-payload',
    });
    expect(context.usdc_net).toBeGreaterThan(0);
    expect(context.rate_locked_at).toBeTruthy();
  });

  it('persists newly provided customer data', async () => {
    mockDb.tables.wallets = [];
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(
      fakeReq({ body: { amount_brl: 50, customer_name: 'Ana Silva', customer_tax_id: VALID_CPF } }),
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(mockDb.inserts).toHaveLength(1);
    expect(mockDb.inserts[0]).toMatchObject({
      table: 'external_accounts',
      row: expect.objectContaining({ session_id: 's1', data: { cpf: VALID_CPF, name: 'Ana Silva' } }),
    });
  });

  it('maps a CPF unique violation to 409', async () => {
    mockDb.tables.wallets = [];
    mockDb.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(
      fakeReq({ body: { amount_brl: 50, customer_name: 'Ana Silva', customer_tax_id: VALID_CPF } }),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('cpf_conflict');
  });

  it('uses the env fallback rate on PUBLIC when the on-chain path fails', async () => {
    withStoredCpf();
    process.env.STELLAR_NETWORK = 'PUBLIC';
    mockService.settings.fallbackBrlPerUsdc = 5.0;
    quoteBrlToUsdc.mockRejectedValue(new Error('no path'));
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(fakeReq({ body: { amount_brl: 50 } }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.usdc_estimate.rate_source).toBe('fallback_env');
    expect(res.body.usdc_estimate.gross).toBeCloseTo(10, 6);
  });

  it('refuses the intent when no rate source is available', async () => {
    withStoredCpf();
    quoteBrlToUsdc.mockRejectedValue(new Error('no path'));
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(fakeReq({ body: { amount_brl: 50 } }), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('rate_unavailable');
    expect(mockService.createIntent).not.toHaveBeenCalled();
  });

  it('maps upstream 429 to retry_after_ms', async () => {
    withStoredCpf();
    mockService.createIntent.mockRejectedValue(
      new PagfinanceApiError({ status: 429, code: 'RATE_LIMITED', retryAfter: 7 }),
    );
    const res = fakeRes();
    await PagfinanceController.createCashinIntent(fakeReq({ body: { amount_brl: 50 } }), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.retry_after_ms).toBe(7000);
  });
});

describe('getCashinIntent poll recovery', () => {
  const { claimOperationForCredit, settleCashinOperation } = jest.requireMock(
    '../src/integrations/pagfinance/settlement',
  );

  it('claims and settles when the remote intent completed but the local one is PENDING', async () => {
    mockDb.tables.operations = [
      {
        id: 'op-9',
        type: 'PIX_ONRAMP',
        status: 'PENDING',
        source_session_id: 's1',
        amount: 50,
        context: JSON.stringify({
          provider: 'pagfinance',
          pagfinance_intent_id: 'int-9',
          value_cents: 5000,
          usdc_net: 9.9,
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        }),
      },
    ];
    mockService.getIntent.mockResolvedValue({ intentId: 'int-9', status: 'COMPLETED' });
    claimOperationForCredit.mockResolvedValue(true);

    const res = fakeRes();
    await PagfinanceController.getCashinIntent(fakeReq({ params: { intentId: 'int-9' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('CREDITING');
    expect(claimOperationForCredit).toHaveBeenCalledWith('op-9', ['PENDING', 'FAILED']);
    expect(settleCashinOperation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'op-9' }),
      { trigger: 'poll' },
    );
  });

  it('does not re-claim an expired operation', async () => {
    mockDb.tables.operations = [
      {
        id: 'op-10',
        type: 'PIX_ONRAMP',
        status: 'FAILED',
        source_session_id: 's1',
        amount: 50,
        context: JSON.stringify({
          provider: 'pagfinance',
          pagfinance_intent_id: 'int-10',
          failure_reason: 'expired',
        }),
      },
    ];
    mockService.getIntent.mockResolvedValue({ intentId: 'int-10', status: 'COMPLETED' });

    const res = fakeRes();
    await PagfinanceController.getCashinIntent(fakeReq({ params: { intentId: 'int-10' } }), res);
    expect(claimOperationForCredit).not.toHaveBeenCalled();
  });
});

describe('getCashinConfig', () => {
  it('reports availability and needs_customer_data for a session with stored CPF', async () => {
    mockDb.tables.external_accounts = [{ session_id: 's1', data: { cpf: VALID_CPF, name: 'Ana Silva' } }];
    mockDb.tables.wallets = [{ session_id: 's1', name: 'Ana Silva' }];
    const res = fakeRes();
    await PagfinanceController.getCashinConfig(fakeReq(), res);
    expect(res.body).toMatchObject({
      success: true,
      provider: 'pagfinance',
      available: true,
      needs_customer_data: false,
    });
  });

  it('defaults needs_customer_data to true without a session', async () => {
    const res = fakeRes();
    await PagfinanceController.getCashinConfig(fakeReq({ headers: {} }), res);
    expect(res.body.needs_customer_data).toBe(true);
  });
});
