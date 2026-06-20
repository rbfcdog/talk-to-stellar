/**
 * Unit tests for PasskeyWalletService
 *
 * Env vars and mocks are set up BEFORE any imports so module-level constants
 * in the service (LAUNCHTUBE_JWT, RPC_URL, etc.) are captured correctly.
 */

process.env.STELLAR_NETWORK = 'testnet';
process.env.LAUNCHTUBE_JWT = 'test-jwt-token';

// ---------------------------------------------------------------------------
// Mock PasskeyServer
// ---------------------------------------------------------------------------

const mockServer = {
  getContractId: jest.fn(),
  send: jest.fn(),
  getSigners: jest.fn(),
};

jest.mock('passkey-kit', () => ({
  PasskeyServer: jest.fn(() => mockServer),
}));

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks — supabase is mocked globally via setup.ts)
// ---------------------------------------------------------------------------

import { PasskeyWalletService } from '../src/integrations/passkey-wallets/service';
import { supabase } from '../src/config/supabase';

// ---------------------------------------------------------------------------
// Helpers to build a chainable query builder stub
// ---------------------------------------------------------------------------

function makeBuilder(terminalValue: unknown) {
  const builder: any = {};
  const chain = () => builder;
  [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'like', 'ilike', 'in', 'contains', 'containedBy',
    'match', 'is', 'not', 'or', 'order', 'limit',
    'range', 'returns', 'throwOnError',
  ].forEach((m) => { builder[m] = jest.fn(chain); });
  builder.single = jest.fn(() => Promise.resolve(terminalValue));
  builder.maybeSingle = jest.fn(() => Promise.resolve(terminalValue));
  builder.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(terminalValue).then(onFulfilled, onRejected);
  return builder;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PasskeyWalletService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. register
  // -------------------------------------------------------------------------

  it('register — upserts to DB and returns record', async () => {
    const fakeRecord = {
      id: 'row-id',
      contract_id: 'CTEST...',
      user_id: 'user1',
      key_id_base64: 'base64key',
      network: 'testnet',
      funded: false,
      created_at: expect.any(String),
    };

    const builder = makeBuilder({ data: fakeRecord, error: null });
    jest.mocked(supabase.from).mockReturnValueOnce(builder);

    const result = await PasskeyWalletService.register({
      contract_id: 'CTEST...',
      user_id: 'user1',
      key_id_base64: 'base64key',
      network: 'testnet',
    });

    expect(supabase.from).toHaveBeenCalledWith('passkey_wallets');
    expect(result.contract_id).toBe('CTEST...');
  });

  // -------------------------------------------------------------------------
  // 2. getContractId — resolves via PasskeyServer
  // -------------------------------------------------------------------------

  it('getContractId — resolves via PasskeyServer.getContractId', async () => {
    mockServer.getContractId.mockResolvedValue('CRESOLVED...');

    const result = await PasskeyWalletService.getContractId('testKeyId');

    expect(result).toBe('CRESOLVED...');
    expect(mockServer.getContractId).toHaveBeenCalledWith({ keyId: 'testKeyId' });
  });

  // -------------------------------------------------------------------------
  // 3. getContractId — falls back to DB when PasskeyServer throws
  // -------------------------------------------------------------------------

  it('getContractId — falls back to DB when PasskeyServer throws', async () => {
    mockServer.getContractId.mockRejectedValue(new Error('network error'));

    const builder = makeBuilder({ data: { contract_id: 'CDBFOUND...' }, error: null });
    jest.mocked(supabase.from).mockReturnValueOnce(builder);

    const result = await PasskeyWalletService.getContractId('testKeyId');

    expect(result).toBe('CDBFOUND...');
    expect(supabase.from).toHaveBeenCalledWith('passkey_wallets');
  });

  // -------------------------------------------------------------------------
  // 4. getContractId — returns null when both PasskeyServer and DB miss
  // -------------------------------------------------------------------------

  it('getContractId — returns null when both PasskeyServer and DB miss', async () => {
    mockServer.getContractId.mockRejectedValue(new Error('not found'));

    const builder = makeBuilder({ data: null, error: null });
    jest.mocked(supabase.from).mockReturnValueOnce(builder);

    const result = await PasskeyWalletService.getContractId('unknownKey');

    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 5. relayTransaction — success
  // -------------------------------------------------------------------------

  it('relayTransaction — calls PasskeyServer.send and returns hash', async () => {
    mockServer.send.mockResolvedValue({ hash: 'abc123' });

    const result = await PasskeyWalletService.relayTransaction('signed-xdr');

    expect(mockServer.send).toHaveBeenCalledWith('signed-xdr');
    expect(result).toEqual({ success: true, hash: 'abc123' });
  });

  // -------------------------------------------------------------------------
  // 6. relayTransaction — returns error when LAUNCHTUBE_JWT not set
  //
  // LAUNCHTUBE_JWT is captured at module load time, so we must re-import the
  // service with a fresh module registry after deleting the env var.
  // -------------------------------------------------------------------------

  it('relayTransaction — returns error when LAUNCHTUBE_JWT not set', async () => {
    jest.resetModules();

    // Remove the JWT before re-requiring
    delete process.env.LAUNCHTUBE_JWT;

    // Re-apply mocks in the new module registry
    jest.mock('passkey-kit', () => ({
      PasskeyServer: jest.fn(() => mockServer),
    }));
    jest.mock('../src/utils/logger', () => ({
      logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
    }));
    // supabase mock must also be re-applied
    jest.mock('../src/config/supabase', () => ({
      supabase: {
        rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
        from: jest.fn(),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PasskeyWalletService: freshService } = require('../src/integrations/passkey-wallets/service');

    const result = await freshService.relayTransaction('signed-xdr');

    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('LAUNCHTUBE_JWT'),
    });
  });

  // -------------------------------------------------------------------------
  // 7. relayTransaction — handles Launchtube error gracefully
  // -------------------------------------------------------------------------

  it('relayTransaction — handles Launchtube error gracefully', async () => {
    process.env.LAUNCHTUBE_JWT = 'jwt';
    mockServer.send.mockRejectedValue(new Error('rate limited'));

    const result = await PasskeyWalletService.relayTransaction('signed-xdr');

    expect(result).toEqual({ success: false, error: 'rate limited' });
  });

  // -------------------------------------------------------------------------
  // 8. getBalance — parses XLM and USDC from Horizon response
  // -------------------------------------------------------------------------

  it('getBalance — parses XLM and USDC from Horizon response', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [
          { asset_type: 'native', balance: '5.0000000' },
          {
            asset_code: 'USDC',
            asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            balance: '100.0000000',
          },
        ],
      }),
    });

    const result = await PasskeyWalletService.getBalance('CCONTRACT...');

    expect(result).toEqual({ xlm: '5.0000000', usdc: '100.0000000' });
  });

  // -------------------------------------------------------------------------
  // 9. getBalance — returns zeros when account not found
  // -------------------------------------------------------------------------

  it('getBalance — returns zeros when account not found', async () => {
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await PasskeyWalletService.getBalance('CCONTRACT...');

    expect(result).toEqual({ xlm: '0', usdc: '0' });
  });

  // -------------------------------------------------------------------------
  // 10. getSigners — delegates to PasskeyServer.getSigners
  // -------------------------------------------------------------------------

  it('getSigners — delegates to PasskeyServer.getSigners', async () => {
    mockServer.getSigners.mockResolvedValue([{ keyId: 'key1' }]);

    const result = await PasskeyWalletService.getSigners('CCONTRACT...');

    expect(mockServer.getSigners).toHaveBeenCalledWith('CCONTRACT...');
    expect(result).toEqual([{ keyId: 'key1' }]);
  });
});
