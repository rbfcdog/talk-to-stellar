/**
 * Bridge.xyz HTTP Client Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BridgeClient } from '../src/client';
import type { BridgeConfig } from '../src/config';

function makeConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    apiKey: 'test-key-bridge-12345',
    baseUrl: 'https://api.bridge.xyz/v0',
    webhookSecret: 'whsec_test',
    enabled: true,
    developerFeePercent: '0.30',
    sandbox: true,
    ...overrides,
  };
}

describe('BridgeClient', () => {
  let client: BridgeClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new BridgeClient(makeConfig());
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('headers', () => {
    it('sends Api-Key header', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await client.get('/test');

      const call = fetchMock.mock.calls[0];
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers['Api-Key']).toBe('test-key-bridge-12345');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('sends Idempotency-Key header when provided', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await client.post('/test', { data: true }, 'idem_abc123');

      const call = fetchMock.mock.calls[0];
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBe('idem_abc123');
    });
  });

  describe('error handling', () => {
    it('throws BridgeApiError on non-2xx', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Bad Request', message: 'Invalid field' }),
      });

      await expect(client.post('/test', {})).rejects.toMatchObject({
        status: 400,
        error: 'Bad Request',
        message: 'Invalid field',
      });
    });

    it('handles JSON parse failure in error response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve(null),
      });

      await expect(client.post('/test', {})).rejects.toMatchObject({
        status: 500,
      });
    });
  });

  describe('HTTP methods', () => {
    it('GET', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'x' }),
      });
      const result = await client.get('/customers/cust_123');
      expect(result).toEqual({ id: 'x' });
      expect(fetchMock.mock.calls[0][0]).toContain('/customers/cust_123');
    });

    it('GET with query params', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      await client.get('/customers', { limit: '10', starting_after: 'cust_abc' });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('limit=10');
      expect(url).toContain('starting_after=cust_abc');
    });

    it('POST', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'x' }),
      });
      const result = await client.post('/transfers', { amount: '100' }, 'idem_1');
      expect(result).toEqual({ id: 'x' });
      expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    });

    it('PUT', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'x' }),
      });
      const result = await client.put('/customers/cust_123', { first_name: 'Test' });
      expect(result).toEqual({ id: 'x' });
      expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
    });

    it('DELETE', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      await client.delete('/transfers/xfer_001');
      expect(fetchMock.mock.calls[0][1]?.method).toBe('DELETE');
    });
  });

  describe('idempotency key generation', () => {
    it('generates unique keys', () => {
      const a = BridgeClient.idempotencyKey('test');
      const b = BridgeClient.idempotencyKey('test');
      expect(a).not.toBe(b);
      expect(a).toMatch(/^test_/);
    });
  });

  describe('URL building', () => {
    it('strips trailing slash from base URL', () => {
      const c = new BridgeClient(makeConfig({ baseUrl: 'https://api.bridge.xyz/v0/' }));
      expect(c['baseUrl']).toBe('https://api.bridge.xyz/v0');
    });
  });

  describe('timeout', () => {
    it('aborts after timeout', async () => {
      fetchMock.mockImplementation(() =>
        new Promise((resolve) => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({}),
        }), 100)),
      );

      const fastClient = new BridgeClient(makeConfig(), 10); // 10ms timeout
      await expect(fastClient.get('/test')).rejects.toThrow();
    });
  });
});
