import { PagfinanceService } from '../src/integrations/pagfinance/service';
import { PagfinanceClient } from '../src/integrations/pagfinance/client';
import { PagfinanceApiError } from '../src/integrations/pagfinance/types';
import type { PagfinanceConfig } from '../src/integrations/pagfinance/config';

const CONFIG: PagfinanceConfig = {
  enabled: true,
  baseUrl: 'https://sandbox.example.test',
  partnerId: 'talktostellar',
  rawSecret: 'test-raw-secret',
  webhookSecret: 'test-webhook-secret',
  jwtTtlSeconds: 3_600,
  timeoutMs: 5_000,
  minBrlAmount: 1,
  maxBrlAmount: 5_000,
  intentExpiresInSeconds: 900,
  usdcTreasurySecret: '',
  fallbackBrlPerUsdc: null,
  appPublicWebhookUrl: '',
};

const PUBKEY = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function envelope<T>(data: T) {
  return { success: true, error: null, data };
}

function makeService(overrides: Partial<Record<'post' | 'patch' | 'get', jest.Mock>> = {}) {
  const post = overrides.post ?? jest.fn();
  const patch = overrides.patch ?? jest.fn().mockResolvedValue(envelope({}));
  const get = overrides.get ?? jest.fn();
  const client = { post, patch, get } as unknown as PagfinanceClient;
  const service = new PagfinanceService(CONFIG, client);
  return { service, post, patch, get };
}

describe('PagfinanceService.ensureUser', () => {
  it('creates the user then applies the KYC override', async () => {
    const { service, post, patch } = makeService({
      post: jest.fn().mockResolvedValue(envelope({ pubkey: PUBKEY })),
    });
    await service.ensureUser(PUBKEY, { name: 'Ana' });

    expect(post).toHaveBeenCalledWith('/api/v1/users', 'hmac', {
      uid: PUBKEY,
      pubkey: PUBKEY,
      blockchain: 'stellar',
      name: 'Ana',
      displayName: 'Ana',
    });
    expect(patch).toHaveBeenCalledWith(`/api/v1/users/${PUBKEY}/kyc`, 'hmac', {
      kycLevel: 1,
      kycStatus: 'APPROVED',
    });
  });

  it('treats CONFLICT on creation as success and still applies KYC', async () => {
    const { service, patch } = makeService({
      post: jest.fn().mockRejectedValue(new PagfinanceApiError({ status: 409, code: 'CONFLICT' })),
    });
    await expect(service.ensureUser(PUBKEY)).resolves.toBeUndefined();
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it('propagates non-conflict errors', async () => {
    const { service, patch } = makeService({
      post: jest.fn().mockRejectedValue(new PagfinanceApiError({ status: 403, code: 'FORBIDDEN' })),
    });
    await expect(service.ensureUser(PUBKEY)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(patch).not.toHaveBeenCalled();
  });

  it('skips remote calls for an already-provisioned pubkey', async () => {
    const post = jest.fn().mockResolvedValue(envelope({ pubkey: PUBKEY }));
    const { service } = makeService({ post });
    await service.ensureUser(PUBKEY);
    await service.ensureUser(PUBKEY);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('PagfinanceService.getUserJwt', () => {
  it('mints once and reuses the cached token while valid', async () => {
    const post = jest.fn().mockResolvedValue(
      envelope({ token: 'jwt-1', expiresIn: '1h', tokenType: 'Bearer', user: {} }),
    );
    const { service } = makeService({ post });

    expect(await service.getUserJwt(PUBKEY)).toBe('jwt-1');
    expect(await service.getUserJwt(PUBKEY)).toBe('jwt-1');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/v1/auth/token', 'hmac', {
      pubkey: PUBKEY,
      expiresIn: '3600s',
    });
  });

  it('recovers from USER_NOT_FOUND by provisioning and retrying once', async () => {
    const post = jest
      .fn()
      // 1st: mint fails — unknown user
      .mockRejectedValueOnce(new PagfinanceApiError({ status: 404, code: 'USER_NOT_FOUND' }))
      // 2nd: user creation
      .mockResolvedValueOnce(envelope({ pubkey: PUBKEY }))
      // 3rd: mint succeeds
      .mockResolvedValueOnce(envelope({ token: 'jwt-2', expiresIn: '1h', tokenType: 'Bearer', user: {} }));
    const { service, patch } = makeService({ post });

    expect(await service.getUserJwt(PUBKEY)).toBe('jwt-2');
    expect(patch).toHaveBeenCalledTimes(1); // KYC override during recovery
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('propagates non-recoverable mint errors', async () => {
    const post = jest.fn().mockRejectedValue(new PagfinanceApiError({ status: 403, code: 'USER_BLOCKED' }));
    const { service } = makeService({ post });
    await expect(service.getUserJwt(PUBKEY)).rejects.toMatchObject({ code: 'USER_BLOCKED' });
  });
});

describe('PagfinanceService cash-in calls', () => {
  function withJwt(extraPost?: (post: jest.Mock) => void) {
    const post = jest.fn().mockResolvedValueOnce(
      envelope({ token: 'jwt-x', expiresIn: '1h', tokenType: 'Bearer', user: {} }),
    );
    extraPost?.(post);
    return post;
  }

  it('creates an intent with the user JWT and idempotency key', async () => {
    const post = withJwt((p) =>
      p.mockResolvedValueOnce(envelope({ intentId: 'int-1', status: 'ACTIVE', valueCents: 5000, brCode: 'br' })),
    );
    const { service } = makeService({ post });

    const intent = await service.createIntent(
      PUBKEY,
      { amount: 50, customer: { name: 'Ana', taxID: '12345678900' } },
      'pgf_key_12345678',
    );

    expect(intent.intentId).toBe('int-1');
    expect(post).toHaveBeenLastCalledWith(
      '/api/v1/cashin/intent',
      { bearer: 'jwt-x' },
      { amount: 50, customer: { name: 'Ana', taxID: '12345678900' } },
      'pgf_key_12345678',
    );
  });

  it('fetches an intent by id with bearer auth', async () => {
    const post = withJwt();
    const get = jest.fn().mockResolvedValue(envelope({ intentId: 'int-2', status: 'COMPLETED', valueCents: 100, brCode: 'x' }));
    const { service } = makeService({ post, get });

    const intent = await service.getIntent(PUBKEY, 'int-2');
    expect(intent.status).toBe('COMPLETED');
    expect(get).toHaveBeenCalledWith('/api/v1/cashin/intent/int-2', { bearer: 'jwt-x' });
  });
});

describe('PagfinanceService configuration guard', () => {
  it('auto-disables with empty config and throws a clear error on use', async () => {
    const empty: PagfinanceConfig = { ...CONFIG, partnerId: '', rawSecret: '' };
    const service = new PagfinanceService(empty, {} as unknown as PagfinanceClient);
    expect(service.enabled).toBe(false);
    await expect(service.ensureUser(PUBKEY)).rejects.toThrow(/disabled/);
  });

  it('is disabled when PAGFINANCE_ENABLED is false even with credentials', () => {
    const off: PagfinanceConfig = { ...CONFIG, enabled: false };
    const service = new PagfinanceService(off, {} as unknown as PagfinanceClient);
    expect(service.enabled).toBe(false);
  });

  it('verifyWebhookSignature returns false without a webhook secret', () => {
    const noSecret: PagfinanceConfig = { ...CONFIG, webhookSecret: '' };
    const service = new PagfinanceService(noSecret, {} as unknown as PagfinanceClient);
    expect(service.verifyWebhookSignature(Buffer.from('{}'), 'sha256=abc')).toBe(false);
  });
});
