import { buildOperationFingerprint, stableHash } from '../src/services/idempotency.service';

describe('Idempotency service helpers', () => {
  it('hashes equivalent payloads deterministically regardless of key order', () => {
    const a = stableHash({ route: '/x', body: { b: 2, a: 1 }, list: [{ z: true, y: false }] });
    const b = stableHash({ list: [{ y: false, z: true }], body: { a: 1, b: 2 }, route: '/x' });

    expect(a).toBe(b);
  });

  it('changes hash when the same key is reused with a different payload', () => {
    const first = stableHash({ route: '/api/external/finalize', body: { amount: '50.00' } });
    const second = stableHash({ route: '/api/external/finalize', body: { amount: '51.00' } });

    expect(first).not.toBe(second);
  });

  it('builds stable operation fingerprints from the business identity', () => {
    const first = buildOperationFingerprint({
      sourceSessionId: 'session-1',
      sourceUserId: 'user-1',
      destination: 'GABC',
      amount: '50,00',
      assetCode: 'usd',
      tokenHash: 'token-1',
      operationType: 'payment',
    });
    const retry = buildOperationFingerprint({
      sourceSessionId: 'session-1',
      sourceUserId: 'user-1',
      destination: 'GABC',
      amount: '50.00',
      assetCode: 'USD',
      tokenHash: 'token-1',
      operationType: 'PAYMENT',
    });
    const differentToken = buildOperationFingerprint({
      sourceSessionId: 'session-1',
      sourceUserId: 'user-1',
      destination: 'GABC',
      amount: '50.00',
      assetCode: 'USD',
      tokenHash: 'token-2',
      operationType: 'PAYMENT',
    });

    expect(first).toBe(retry);
    expect(first).not.toBe(differentToken);
  });
});
