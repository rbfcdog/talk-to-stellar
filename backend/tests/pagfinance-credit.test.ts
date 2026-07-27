import { TESTNET_USDC_ISSUER, PUBLIC_USDC_ISSUER } from '../src/config/assets';

const mockDb: { tables: Record<string, any[]> } = { tables: {} };

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Array<[string, any]> = [];
      const rowsFor = () =>
        (mockDb.tables[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v));
      const builder: any = {
        select: () => builder,
        eq: (k: string, v: any) => {
          filters.push([k, v]);
          return builder;
        },
        order: () => builder,
        limit: (n: number) => Promise.resolve({ data: rowsFor().slice(0, n), error: null }),
        maybeSingle: () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null }),
      };
      return builder;
    },
  },
}));

jest.mock('../src/config/stellar', () => ({
  server: { loadAccount: jest.fn(), submitTransaction: jest.fn() },
  stellarConfig: { network: 'Test SDF Network ; September 2015', horizonUrl: 'https://horizon.test' },
}));

jest.mock('../src/api/services/stellar.service', () => ({
  StellarService: { submitAssetPaymentsFromSecret: jest.fn() },
}));

jest.mock('../src/api/services/trustline.service', () => ({
  TrustlineService: { ensureTrustline: jest.fn() },
}));

const mockGetSecret = jest.fn();
jest.mock('../src/api/services/core/vault.service', () => ({
  VaultService: jest.fn().mockImplementation(() => ({ getSecret: mockGetSecret })),
}));

import {
  creditUsdcToUser,
  resolveCreditDestination,
  resolveTreasurySecret,
  validateCreditReadiness,
} from '../src/integrations/pagfinance/credit';
import { server } from '../src/config/stellar';
import { StellarService } from '../src/api/services/stellar.service';
import { TrustlineService } from '../src/api/services/trustline.service';

const loadAccount = server.loadAccount as jest.Mock;
const submitPayments = StellarService.submitAssetPaymentsFromSecret as jest.Mock;
const ensureTrustline = TrustlineService.ensureTrustline as jest.Mock;

const USER_KEY = 'GUSERUSERUSERUSERUSERUSERUSERUSERUSERUSERUSERUSERUSER56';
const FEE_TREASURY = 'GFEEFEEFEEFEEFEEFEEFEEFEEFEEFEEFEEFEEFEEFEEFEEFEEFEE1234';

const ENV_KEYS = [
  'STELLAR_NETWORK',
  'PAGFINANCE_ENABLED',
  'PAGFINANCE_PARTNER_ID',
  'PAGFINANCE_RAW_SECRET',
  'PAGFINANCE_USDC_TREASURY_SECRET',
  'STELLAR_SECRET_KEY',
  'STELLAR_SPONSOR_SECRET',
  'STELLAR_WALLET_SPONSOR_SECRET',
  'STELLAR_MAINNET_SPONSOR_SECRET',
  'TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY',
  'TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY',
  'USDC_ISSUER',
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.STELLAR_NETWORK = 'TESTNET';
  mockDb.tables = {};
  jest.clearAllMocks();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function accountWithUsdc(issuer: string) {
  return { balances: [{ asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: issuer }] };
}

describe('resolveTreasurySecret', () => {
  it('prefers PAGFINANCE_USDC_TREASURY_SECRET', () => {
    process.env.PAGFINANCE_USDC_TREASURY_SECRET = 'S_PGF';
    process.env.STELLAR_SECRET_KEY = 'S_GLOBAL';
    expect(resolveTreasurySecret('TESTNET')).toBe('S_PGF');
  });

  it('falls back to STELLAR_SECRET_KEY', () => {
    process.env.STELLAR_SECRET_KEY = 'S_GLOBAL';
    expect(resolveTreasurySecret('TESTNET')).toBe('S_GLOBAL');
  });

  it('falls through the sponsor chain only on PUBLIC', () => {
    process.env.STELLAR_MAINNET_SPONSOR_SECRET = 'S_SPONSOR';
    expect(resolveTreasurySecret('TESTNET')).toBeNull();
    expect(resolveTreasurySecret('PUBLIC')).toBe('S_SPONSOR');
  });

  it('returns null when nothing is configured', () => {
    expect(resolveTreasurySecret('PUBLIC')).toBeNull();
  });
});

describe('resolveCreditDestination', () => {
  it('uses the session wallet directly on TESTNET', async () => {
    const result = await resolveCreditDestination({
      network: 'TESTNET',
      sourcePublicKey: USER_KEY,
    });
    expect(result).toEqual({
      success: true,
      destination: { publicKey: USER_KEY, source: 'session_wallet' },
    });
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('uses the source key on PUBLIC when the account exists on Horizon', async () => {
    loadAccount.mockResolvedValue(accountWithUsdc(PUBLIC_USDC_ISSUER));
    const result = await resolveCreditDestination({
      network: 'PUBLIC',
      sourcePublicKey: USER_KEY,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.destination.publicKey).toBe(USER_KEY);
  });

  it('falls back to the primary stellar_mainnet_wallets row', async () => {
    loadAccount.mockRejectedValue(new Error('not found'));
    mockDb.tables.stellar_mainnet_wallets = [
      { session_id: 's1', is_primary: true, public_key: 'GMAINNETWALLET' },
    ];
    const result = await resolveCreditDestination({
      network: 'PUBLIC',
      sourcePublicKey: USER_KEY,
      sessionId: 's1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.destination).toEqual({ publicKey: 'GMAINNETWALLET', source: 'mainnet_wallet' });
    }
  });

  it('falls back to the bridge wallet by email', async () => {
    loadAccount.mockRejectedValue(new Error('not found'));
    mockDb.tables.bridge_stellar_wallets = [
      { email: 'ana@example.com', is_primary: true, public_key: 'GBRIDGEWALLET' },
    ];
    const result = await resolveCreditDestination({
      network: 'PUBLIC',
      sourcePublicKey: USER_KEY,
      email: 'ana@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.destination).toEqual({ publicKey: 'GBRIDGEWALLET', source: 'bridge_wallet' });
    }
  });

  it('fails explicitly when no mainnet destination exists', async () => {
    loadAccount.mockRejectedValue(new Error('not found'));
    const result = await resolveCreditDestination({
      network: 'PUBLIC',
      sourcePublicKey: USER_KEY,
      sessionId: 's1',
      email: 'ana@example.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/mainnet/i);
  });
});

describe('creditUsdcToUser', () => {
  it('pays user + fee treasury in one submission on TESTNET', async () => {
    process.env.PAGFINANCE_USDC_TREASURY_SECRET = 'S_TREASURY';
    process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY = FEE_TREASURY;
    loadAccount.mockResolvedValue(accountWithUsdc(TESTNET_USDC_ISSUER));
    submitPayments.mockResolvedValue({ success: true, hash: 'tx-hash-1' });

    const result = await creditUsdcToUser({
      destinationPublicKey: USER_KEY,
      usdcNet: '9.97',
      usdcFee: '0.03',
      userId: 'u1',
      memoText: 'PIX PAGFINANCE',
    });

    expect(result).toEqual({ success: true, hash: 'tx-hash-1' });
    expect(submitPayments).toHaveBeenCalledWith({
      sourceSecret: 'S_TREASURY',
      payments: [
        { destination: USER_KEY, amount: '9.97', assetCode: 'USDC', assetIssuer: TESTNET_USDC_ISSUER },
        { destination: FEE_TREASURY, amount: '0.03', assetCode: 'USDC', assetIssuer: TESTNET_USDC_ISSUER },
      ],
      memoText: 'PIX PAGFINANCE',
    });
  });

  it('omits the fee payment when the fee is zero or no fee treasury is set', async () => {
    process.env.PAGFINANCE_USDC_TREASURY_SECRET = 'S_TREASURY';
    loadAccount.mockResolvedValue(accountWithUsdc(TESTNET_USDC_ISSUER));
    submitPayments.mockResolvedValue({ success: true, hash: 'tx-hash-2' });

    await creditUsdcToUser({ destinationPublicKey: USER_KEY, usdcNet: '10', usdcFee: '0', userId: 'u1' });
    expect(submitPayments.mock.calls[0][0].payments).toHaveLength(1);
  });

  it('fails without submitting when no treasury secret is configured', async () => {
    const result = await creditUsdcToUser({
      destinationPublicKey: USER_KEY,
      usdcNet: '10',
      usdcFee: '0',
      userId: 'u1',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/PAGFINANCE_USDC_TREASURY_SECRET/);
    expect(submitPayments).not.toHaveBeenCalled();
  });

  it('ensures the trustline via TrustlineService on TESTNET when missing', async () => {
    process.env.PAGFINANCE_USDC_TREASURY_SECRET = 'S_TREASURY';
    loadAccount.mockResolvedValue({ balances: [] });
    mockDb.tables.wallets = [{ public_key: USER_KEY, vault_secret_id: 'vault-1' }];
    mockGetSecret.mockResolvedValue('S_WALLET');
    ensureTrustline.mockResolvedValue({ success: true, existing: false });
    submitPayments.mockResolvedValue({ success: true, hash: 'tx-hash-3' });

    const result = await creditUsdcToUser({
      destinationPublicKey: USER_KEY,
      usdcNet: '5',
      usdcFee: '0',
      userId: 'u1',
    });

    expect(result.success).toBe(true);
    expect(ensureTrustline).toHaveBeenCalledWith(USER_KEY, 'S_WALLET', 'u1', {
      code: 'USDC',
      issuer: TESTNET_USDC_ISSUER,
    });
  });

  it('fails explicitly when the trustline cannot be ensured', async () => {
    process.env.PAGFINANCE_USDC_TREASURY_SECRET = 'S_TREASURY';
    loadAccount.mockResolvedValue({ balances: [] });
    // no wallets row → no signing key available
    const result = await creditUsdcToUser({
      destinationPublicKey: USER_KEY,
      usdcNet: '5',
      usdcFee: '0',
      userId: 'u1',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/trustline|signing key/i);
    expect(submitPayments).not.toHaveBeenCalled();
  });

  it('propagates submission failure without throwing', async () => {
    process.env.PAGFINANCE_USDC_TREASURY_SECRET = 'S_TREASURY';
    loadAccount.mockResolvedValue(accountWithUsdc(TESTNET_USDC_ISSUER));
    submitPayments.mockResolvedValue({ success: false, error: 'op_underfunded' });

    const result = await creditUsdcToUser({
      destinationPublicKey: USER_KEY,
      usdcNet: '10',
      usdcFee: '0',
      userId: 'u1',
    });
    expect(result).toEqual({ success: false, error: 'op_underfunded' });
  });
});

describe('validateCreditReadiness', () => {
  it('warns when enabled on PUBLIC without a treasury', () => {
    process.env.STELLAR_NETWORK = 'PUBLIC';
    process.env.PAGFINANCE_ENABLED = 'true';
    process.env.PAGFINANCE_PARTNER_ID = 'talktostellar';
    process.env.PAGFINANCE_RAW_SECRET = 'x';
    const result = validateCreditReadiness();
    expect(result.ok).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/treasury/i);
  });

  it('is quiet when a treasury is configured', () => {
    process.env.STELLAR_NETWORK = 'PUBLIC';
    process.env.PAGFINANCE_ENABLED = 'true';
    process.env.PAGFINANCE_PARTNER_ID = 'talktostellar';
    process.env.PAGFINANCE_RAW_SECRET = 'x';
    process.env.PAGFINANCE_USDC_TREASURY_SECRET = 'S_TREASURY';
    expect(validateCreditReadiness().ok).toBe(true);
  });

  it('is quiet when the integration is disabled', () => {
    expect(validateCreditReadiness().ok).toBe(true);
  });
});
