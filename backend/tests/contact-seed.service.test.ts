const mockContactRows: any[] = [];
let mockNetwork: 'TESTNET' | 'PUBLIC' = 'TESTNET';
const mockCreateTestAccount = jest.fn();

function createContactsBuilder() {
  const filters: Record<string, any> = {};
  const builder: any = {};

  builder.select = jest.fn(() => builder);
  builder.limit = jest.fn(() => builder);
  builder.order = jest.fn(() => builder);
  builder.eq = jest.fn((field: string, value: any) => {
    filters[field] = value;
    return builder;
  });
  builder.maybeSingle = jest.fn(async () => {
    const row = mockContactRows.find((candidate) => (
      Object.entries(filters).every(([field, value]) => candidate[field] === value)
    ));
    return { data: row || null, error: null };
  });
  builder.insert = jest.fn(async (payload: any) => {
    const row = {
      id: `contact-${mockContactRows.length + 1}`,
      ...payload,
    };
    mockContactRows.push(row);
    return { data: row, error: null };
  });
  builder.update = jest.fn((payload: any) => ({
    eq: jest.fn(async (field: string, value: any) => {
      const row = mockContactRows.find((candidate) => candidate[field] === value);
      if (row) {
        Object.assign(row, payload);
      }
      return { data: row || null, error: null };
    }),
  }));

  return builder;
}

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'contacts') return createContactsBuilder();
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(async () => ({ data: null, error: null })),
        insert: jest.fn(async () => ({ data: null, error: null })),
        update: jest.fn(() => ({ eq: jest.fn(async () => ({ data: null, error: null })) })),
      };
    }),
    rpc: jest.fn(async () => ({ data: 'vault-secret-id', error: null })),
  },
}));

jest.mock('../src/config/assets', () => ({
  getAssetIssuer: jest.fn(() => ''),
  getDefaultTrustedAssets: jest.fn(() => []),
  getStellarNetworkName: jest.fn(() => mockNetwork),
  isInitialUsdcConversionEnabled: jest.fn(() => false),
  TESTNET_USDC_ISSUER: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
}));

jest.mock('../src/api/services/stellar.service', () => ({
  StellarService: {
    createTestAccount: mockCreateTestAccount,
  },
}));

jest.mock('../src/api/repository/core/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    saveSession: jest.fn(async () => undefined),
  })),
}));

jest.mock('../src/api/repository/core/wallet.repository', () => ({
  WalletRepository: jest.fn().mockImplementation(() => ({
    getWalletByPublicKey: jest.fn(async () => null),
    saveWallet: jest.fn(async () => undefined),
  })),
}));

jest.mock('../src/api/repository/core/external.repository', () => ({
  ExternalRepository: jest.fn().mockImplementation(() => ({
    createMapping: jest.fn(async () => undefined),
  })),
}));

jest.mock('../src/api/services/core/vault.service', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    storeSecret: jest.fn(async () => 'vault-secret-id'),
  })),
}));

jest.mock('../src/api/services/core/stellar.service', () => ({
  StellarService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../src/api/services/trustline.service', () => ({
  TrustlineService: {
    createDefaultTrustlines: jest.fn(async () => ({ success: true, assets: [], errors: [] })),
  },
}));

import { ContactSeedService, STARTER_CONTACTS } from '../src/api/services/contact-seed.service';

describe('ContactSeedService starter contacts', () => {
  beforeEach(() => {
    mockContactRows.length = 0;
    mockNetwork = 'TESTNET';
    mockCreateTestAccount.mockReset();
  });

  it('keeps onboarding contacts complete when dynamic starter wallet creation fails', async () => {
    mockCreateTestAccount.mockRejectedValue(new Error('friendbot unavailable'));

    const result = await ContactSeedService.ensureStarterContactsForUser('owner-123');

    expect(result).toEqual({
      created: STARTER_CONTACTS.length,
      updated: 0,
      skipped: 0,
      errors: [],
    });
    expect(mockCreateTestAccount).toHaveBeenCalledTimes(STARTER_CONTACTS.length);
    expect(mockContactRows).toHaveLength(STARTER_CONTACTS.length);
    expect(mockContactRows.map((row) => row.contact_name).sort()).toEqual(
      STARTER_CONTACTS.map((contact) => contact.contact_name).sort(),
    );
    expect(mockContactRows.every((row) => /^G[A-Z2-7]{55}$/.test(row.stellar_public_key))).toBe(true);
    expect(mockContactRows.every((row) => String(row.pix_key || '').length >= 10)).toBe(true);
  });

  it('seeds static starter contacts on public network without trying to create funded test wallets', async () => {
    mockNetwork = 'PUBLIC';

    const result = await ContactSeedService.ensureStarterContactsForUser('owner-public');

    expect(result.created).toBe(STARTER_CONTACTS.length);
    expect(result.errors).toEqual([]);
    expect(mockCreateTestAccount).not.toHaveBeenCalled();
    expect(mockContactRows).toHaveLength(STARTER_CONTACTS.length);
  });
});
