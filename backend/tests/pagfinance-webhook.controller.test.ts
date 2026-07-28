import crypto from 'crypto';

const WEBHOOK_SECRET = 'test-webhook-secret';

const mockDb: { tables: Record<string, any[]> } = { tables: {} };

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<[string, any]> = [];
      let inFilter: [string, any[]] | null = null;
      let updateFields: any = null;
      const matching = () =>
        (mockDb.tables[table] ?? []).filter(
          (r) =>
            filters.every(([k, v]) => r[k] === v) &&
            (!inFilter || inFilter[1].includes(r[inFilter[0]])),
        );
      const builder: any = {
        select: () => builder,
        eq: (k: string, v: any) => {
          filters.push([k, v]);
          return builder;
        },
        in: (k: string, values: any[]) => {
          inFilter = [k, values];
          return builder;
        },
        like: () => builder,
        not: () => builder,
        order: () => builder,
        update: (fields: any) => {
          updateFields = fields;
          return builder;
        },
        limit: (n: number) => Promise.resolve({ data: matching().slice(0, n), error: null }),
        maybeSingle: () => Promise.resolve({ data: matching()[0] ?? null, error: null }),
        then: (resolve: any, reject: any) => {
          const rows = matching();
          if (updateFields) for (const row of rows) Object.assign(row, updateFields);
          return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  },
}));

jest.mock('../src/api/repository/operation.repository', () => ({
  OperationRepository: { update: jest.fn() },
}));

jest.mock('../src/integrations/pagfinance/credit', () => ({
  creditUsdcToUser: jest.fn(),
  resolveCreditDestination: jest.fn(),
}));

jest.mock('../src/api/services/receipts/payment-receipt.service', () => ({
  PaymentReceiptService: { sendReceipt: jest.fn().mockResolvedValue('https://receipt.example') },
}));

const mockService: any = {
  enabled: true,
  settings: { webhookSecret: WEBHOOK_SECRET },
  verifyWebhookSignature: (rawBody: Buffer, header: string) => {
    const { verifyWebhookSignature } = jest.requireActual('../src/integrations/pagfinance/hmac');
    return verifyWebhookSignature(rawBody, header, mockService.settings.webhookSecret);
  },
};
jest.mock('../src/integrations/pagfinance', () => ({
  getPagfinanceService: () => mockService,
}));

import { PagfinanceWebhookController } from '../src/api/controllers/pagfinance-webhook.controller';
import { OperationRepository } from '../src/api/repository/operation.repository';
import { creditUsdcToUser, resolveCreditDestination } from '../src/integrations/pagfinance/credit';
import { PaymentReceiptService } from '../src/api/services/receipts/payment-receipt.service';

const updateOperation = OperationRepository.update as jest.Mock;
const credit = creditUsdcToUser as jest.Mock;
const resolveDestination = resolveCreditDestination as jest.Mock;
const sendReceipt = PaymentReceiptService.sendReceipt as jest.Mock;

const USER_KEY = 'GUSERUSERUSERUSERUSERUSERUSERUSERUSERUSERUSERUSERUSER56';

function operationRow(overrides: any = {}) {
  return {
    id: 'op-1',
    type: 'PIX_ONRAMP',
    status: 'PENDING',
    user_id: 'u1',
    source_session_id: 's1',
    source_public_key: USER_KEY,
    amount: 50,
    context: JSON.stringify({
      provider: 'pagfinance',
      pagfinance_intent_id: 'int-1',
      value_cents: 5000,
      source_amount_brl: 50,
      usdc_net: 9.97,
      usdc_fee: 0.03,
      language: 'pt',
    }),
    ...overrides,
  };
}

function envelopeFor(overrides: any = {}) {
  return {
    event: 'CASHIN_COMPLETED',
    intentId: 'int-1',
    status: 'COMPLETED',
    timestamp: new Date().toISOString(),
    data: {
      intentId: 'int-1',
      walletAddress: USER_KEY,
      valueCents: 5000,
      transactionID: 'pix-tx-1',
      completedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

function signedReq(payload: unknown, secret = WEBHOOK_SECRET) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return {
    headers: { 'x-app-signature': signature },
    rawBody,
    query: {},
    body: {},
    params: {},
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

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

const savedNetwork = process.env.STELLAR_NETWORK;

beforeEach(() => {
  process.env.STELLAR_NETWORK = 'TESTNET';
  mockDb.tables = {};
  jest.clearAllMocks();
  mockService.settings.webhookSecret = WEBHOOK_SECRET;
  resolveDestination.mockResolvedValue({
    success: true,
    destination: { publicKey: USER_KEY, source: 'session_wallet' },
  });
  credit.mockResolvedValue({ success: true, hash: 'stellar-tx-hash' });
  updateOperation.mockResolvedValue({});
});

afterEach(() => {
  if (savedNetwork === undefined) delete process.env.STELLAR_NETWORK;
  else process.env.STELLAR_NETWORK = savedNetwork;
});

describe('PagfinanceWebhookController.cashin', () => {
  it('rejects an invalid signature with 401', async () => {
    mockDb.tables.operations = [operationRow()];
    const req = signedReq(envelopeFor(), 'wrong-secret');
    const res = fakeRes();
    await PagfinanceWebhookController.cashin(req, res);
    expect(res.statusCode).toBe(401);
    expect(credit).not.toHaveBeenCalled();
  });

  it('rejects when no webhook secret is configured (never fail-open)', async () => {
    mockService.settings.webhookSecret = '';
    const req = signedReq(envelopeFor());
    const res = fakeRes();
    await PagfinanceWebhookController.cashin(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('webhook_secret_missing');
  });

  it('acks and ignores non-CASHIN_COMPLETED events', async () => {
    const req = signedReq(envelopeFor({ event: 'KYC_APPROVED' }));
    const res = fakeRes();
    await PagfinanceWebhookController.cashin(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ignored).toBe(true);
    expect(credit).not.toHaveBeenCalled();
  });

  it('acks and ignores an unknown intent', async () => {
    const req = signedReq(envelopeFor());
    const res = fakeRes();
    await PagfinanceWebhookController.cashin(req, res);
    expect(res.body.ignored).toBe(true);
    expect(credit).not.toHaveBeenCalled();
  });

  it('treats an already-claimed operation as a duplicate and credits nothing', async () => {
    mockDb.tables.operations = [operationRow({ status: 'CREDITING' })];
    const req = signedReq(envelopeFor());
    const res = fakeRes();
    await PagfinanceWebhookController.cashin(req, res);
    await flushAsync();
    expect(res.body.duplicate).toBe(true);
    expect(credit).not.toHaveBeenCalled();
    expect(updateOperation).not.toHaveBeenCalled();
  });

  it('claims, credits once, completes the operation, and sends the receipt', async () => {
    mockDb.tables.operations = [operationRow()];
    const req = signedReq(envelopeFor());
    const res = fakeRes();
    await PagfinanceWebhookController.cashin(req, res);
    expect(res.body).toEqual({ success: true });
    await flushAsync();

    // Claim flipped the row to CREDITING before settlement.
    expect(mockDb.tables.operations[0].status).toBe('CREDITING');

    expect(credit).toHaveBeenCalledTimes(1);
    expect(credit).toHaveBeenCalledWith({
      destinationPublicKey: USER_KEY,
      usdcNet: '9.97',
      usdcFee: '0.03',
      userId: 'u1',
      memoText: 'PIX PAGFINANCE',
    });

    expect(updateOperation).toHaveBeenCalledWith(
      'op-1',
      expect.objectContaining({
        status: 'COMPLETED',
        stellar_transaction_hash: 'stellar-tx-hash',
      }),
    );
    const finalContext = JSON.parse(updateOperation.mock.calls[0][1].context);
    expect(finalContext).toMatchObject({
      credit_hash: 'stellar-tx-hash',
      credited_usdc: 9.97,
      final_amount: 9.97,
      transaction_id: 'pix-tx-1',
      settled_by: 'webhook',
    });

    expect(sendReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'payment_received',
        sessionId: 's1',
        userId: 'u1',
        destinationAmount: '9.97',
        destinationAssetCode: 'USDC',
        sourceAssetCode: 'BRL',
        hash: 'stellar-tx-hash',
        dedupeKey: 'pix-onramp:op-1',
      }),
    );
  });

  it('marks the operation FAILED on walletAddress mismatch without crediting', async () => {
    mockDb.tables.operations = [operationRow()];
    const req = signedReq(envelopeFor({ data: { ...envelopeFor().data, walletAddress: 'GOTHERWALLET1234' } }));
    const res = fakeRes();
    await PagfinanceWebhookController.cashin(req, res);
    await flushAsync();

    expect(credit).not.toHaveBeenCalled();
    expect(updateOperation).toHaveBeenCalledWith(
      'op-1',
      expect.objectContaining({ status: 'FAILED' }),
    );
    const failedContext = JSON.parse(updateOperation.mock.calls[0][1].context);
    expect(failedContext.credit_error).toMatch(/walletAddress/);
  });

  it('marks the operation FAILED when the credit submission fails', async () => {
    mockDb.tables.operations = [operationRow()];
    credit.mockResolvedValue({ success: false, error: 'op_underfunded' });
    const req = signedReq(envelopeFor());
    const res = fakeRes();
    await PagfinanceWebhookController.cashin(req, res);
    await flushAsync();

    expect(updateOperation).toHaveBeenCalledWith(
      'op-1',
      expect.objectContaining({ status: 'FAILED' }),
    );
    const failedContext = JSON.parse(updateOperation.mock.calls[0][1].context);
    expect(failedContext.credit_error).toBe('op_underfunded');
    expect(sendReceipt).not.toHaveBeenCalled();
  });
});
