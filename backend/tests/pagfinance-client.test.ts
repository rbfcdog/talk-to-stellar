import { PagfinanceClient } from '../src/integrations/pagfinance/client';
import { PagfinanceApiError } from '../src/integrations/pagfinance/types';
import type { PagfinanceConfig } from '../src/integrations/pagfinance/config';

const CONFIG: PagfinanceConfig = {
  enabled: true,
  baseUrl: 'https://sandbox.example.test',
  partnerId: 'talktostellar',
  rawSecret: 'test-raw-secret',
  webhookSecret: 'test-webhook-secret',
  jwtTtlSeconds: 86_400,
  timeoutMs: 5_000,
  minBrlAmount: 1,
  maxBrlAmount: 5_000,
  intentExpiresInSeconds: 900,
  usdcTreasurySecret: '',
  fallbackBrlPerUsdc: null,
  appPublicWebhookUrl: '',
};

type FetchCall = { url: string; init: RequestInit };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeClient(responses: Array<Response | Error>) {
  const calls: FetchCall[] = [];
  const fetchFn = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra fetch call');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];
  const sleepFn = async (ms: number) => {
    sleeps.push(ms);
  };
  const client = new PagfinanceClient(CONFIG, { fetchFn, sleepFn });
  return { client, calls, sleeps };
}

function authHeaderOf(call: FetchCall): string {
  return (call.init.headers as Record<string, string>)['Authorization'];
}

describe('PagfinanceClient retry behavior', () => {
  it('retries a GET on 503 and succeeds on the second attempt', async () => {
    const { client, calls, sleeps } = makeClient([
      jsonResponse(503, { success: false, error: 'indisponível', code: 'SERVICE_UNAVAILABLE' }),
      jsonResponse(200, { success: true, error: null, data: { ok: true } }),
    ]);
    const result = await client.get<any>('/api/v1/cashin/intents', 'hmac');
    expect(result.data.ok).toBe(true);
    expect(calls.length).toBe(2);
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(500);
  });

  it('honors retryAfter from a 429 body', async () => {
    const { client, sleeps } = makeClient([
      jsonResponse(429, { success: false, error: 'muitas requisições', retryAfter: 2 }),
      jsonResponse(200, { success: true, error: null, data: {} }),
    ]);
    await client.get<any>('/api/v1/cashin/intents', 'hmac');
    expect(sleeps[0]).toBeGreaterThanOrEqual(2000);
    expect(sleeps[0]).toBeLessThanOrEqual(15000);
  });

  it('does not retry a deterministic 400', async () => {
    const { client, calls } = makeClient([
      jsonResponse(400, { success: false, error: 'inválido', code: 'VALIDATION_ERROR' }),
    ]);
    await expect(client.get<any>('/api/v1/cashin/intents', 'hmac')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(calls.length).toBe(1);
  });

  it('does not retry a POST without an Idempotency-Key', async () => {
    const { client, calls } = makeClient([
      jsonResponse(503, { success: false, error: 'indisponível' }),
    ]);
    await expect(
      client.post<any>('/api/v1/cashin/intent', { bearer: 'jwt' }, { amount: 10 }),
    ).rejects.toBeInstanceOf(PagfinanceApiError);
    expect(calls.length).toBe(1);
  });

  it('retries a POST when an Idempotency-Key was sent, keeping the same key', async () => {
    const { client, calls } = makeClient([
      jsonResponse(503, { success: false, error: 'indisponível' }),
      jsonResponse(201, { success: true, error: null, data: { intentId: 'abc' } }),
    ]);
    const result = await client.post<any>(
      '/api/v1/cashin/intent',
      { bearer: 'jwt' },
      { amount: 10 },
      'pgf_test_12345678',
    );
    expect(result.data.intentId).toBe('abc');
    expect(calls.length).toBe(2);
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>)['Idempotency-Key']).toBe('pgf_test_12345678');
    }
  });

  it('re-signs each HMAC attempt with a fresh nonce', async () => {
    const { client, calls } = makeClient([
      jsonResponse(503, { success: false, error: 'indisponível' }),
      jsonResponse(200, { success: true, error: null, data: {} }),
    ]);
    await client.get<any>('/api/v1/users/partner/talktostellar', 'hmac');
    const [first, second] = calls.map(authHeaderOf);
    const nonceOf = (h: string) => /nonce=([^,]+),/.exec(h)?.[1];
    expect(first).toMatch(/^HMAC-SHA256 partnerId=talktostellar,timestamp=\d+,nonce=.+,signature=[0-9a-f]{64}$/);
    expect(nonceOf(first)).toBeTruthy();
    expect(nonceOf(first)).not.toBe(nonceOf(second));
  });

  it('retries network errors and maps HTTP errors to PagfinanceApiError', async () => {
    const { client, calls } = makeClient([
      new Error('socket hang up'),
      jsonResponse(403, { success: false, error: 'proibido', code: 'INSUFFICIENT_KYC' }),
    ]);
    try {
      await client.get<any>('/api/v1/cashin/intents', 'hmac');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PagfinanceApiError);
      expect((err as PagfinanceApiError).status).toBe(403);
      expect((err as PagfinanceApiError).code).toBe('INSUFFICIENT_KYC');
    }
    expect(calls.length).toBe(2);
  });

  it('sends Bearer auth and the exact serialized body', async () => {
    const { client, calls } = makeClient([
      jsonResponse(201, { success: true, error: null, data: {} }),
    ]);
    const body = { amount: 100, customer: { name: 'Ana', taxID: '12345678900' } };
    await client.post<any>('/api/v1/cashin/intent', { bearer: 'jwt-token' }, body, 'pgf_key_12345678');
    expect(authHeaderOf(calls[0])).toBe('Bearer jwt-token');
    expect(calls[0].init.body).toBe(JSON.stringify(body));
  });

  it('generates idempotency keys within 8..200 chars', () => {
    const key = PagfinanceClient.idempotencyKey('pgf');
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(200);
    expect(key.startsWith('pgf_')).toBe(true);
  });
});
