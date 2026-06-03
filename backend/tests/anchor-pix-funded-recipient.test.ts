import { supabase } from '../src/config/supabase';
import { AnchorService } from '../src/api/services/anchor.service';

function createContactsBuilder(contactRows: any[]) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: contactRows, error: null }),
  };
}

function createWalletsBuilder(walletRow: any = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(
      walletRow
        ? { data: walletRow, error: null }
        : { data: null, error: { code: 'PGRST116', message: 'not found' } }
    ),
  };
}

describe('AnchorService PIX-funded transfer recipient resolution', () => {
  const anaPublicKey = 'GDRJSYKLLAJB57DCGYAAH4XMFPURAI5VP6FI3VXE5SC2SEKCDGGZUZUP';
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STELLAR_NETWORK: 'TESTNET',
      ETHERFUSE_SANDBOX_PIX_FALLBACK: 'true',
      USDC_ISSUER: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    };
    delete process.env.TESOURO_DISTRIBUTOR_SECRET;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it('accepts the public key carried by the chat link when the saved contact row only has phone/PIX metadata', async () => {
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'contacts') {
        return createContactsBuilder([
          {
            id: 421,
            contact_name: 'Ana Silva',
            stellar_public_key: null,
            pix_key: '5595280606751',
            phone_number: '5595280606751',
          },
        ]) as any;
      }
      if (table === 'wallets') {
        return createWalletsBuilder({
          session_id: 'recipient-session',
          user_id: 'ana-user',
          public_key: anaPublicKey,
          vault_secret_id: 'recipient-vault',
        }) as any;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const recipient = await (AnchorService as any).resolveTransferRecipient(
      'owner-user',
      'Ana Silva',
      {
        preferredKey: '5595280606751',
        preferredPublicKey: anaPublicKey,
      }
    );

    expect(recipient).toMatchObject({
      publicKey: anaPublicKey,
      displayName: 'Ana Silva',
      pixKey: '5595280606751',
      recipientKey: '5595280606751',
      sessionId: 'recipient-session',
      vaultSecretId: 'recipient-vault',
    });
  });

  it('still rejects a stale link public key when the saved contact has a different destination key', async () => {
    const otherPublicKey = 'GDS5DQONHNVG2JDZSMTATOIOGGCQV6ZTKWLJ755QUBRY7YSAMDITZOJ6';
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'contacts') {
        return createContactsBuilder([
          {
            id: 421,
            contact_name: 'Ana Silva',
            stellar_public_key: otherPublicKey,
            pix_key: '5595280606751',
            phone_number: '5595280606751',
          },
        ]) as any;
      }
      if (table === 'wallets') return createWalletsBuilder(null) as any;
      throw new Error(`Unexpected table ${table}`);
    });

    await expect((AnchorService as any).resolveTransferRecipient(
      'owner-user',
      'Ana Silva',
      {
        preferredKey: '5595280606751',
        preferredPublicKey: anaPublicKey,
      }
    )).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('uses the PIX key carried by the chat link when the typed recipient name has a typo', async () => {
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'contacts') {
        return createContactsBuilder([
          {
            id: 421,
            contact_name: 'Ana Silva',
            stellar_public_key: anaPublicKey,
            pix_key: '5595280606751',
            phone_number: null,
          },
        ]) as any;
      }
      if (table === 'wallets') {
        return createWalletsBuilder({
          session_id: 'recipient-session',
          user_id: 'ana-user',
          public_key: anaPublicKey,
          vault_secret_id: 'recipient-vault',
        }) as any;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const recipient = await (AnchorService as any).resolveTransferRecipient(
      'owner-user',
      'ana sillva',
      {
        preferredKey: '5595280606751',
      }
    );

    expect(recipient).toMatchObject({
      publicKey: anaPublicKey,
      displayName: 'Ana Silva',
      pixKey: '5595280606751',
      recipientKey: '5595280606751',
      sessionId: 'recipient-session',
    });
  });

  it('simulates the post-PIX transfer in sandbox ledger mode when no on-chain funding secret is available', async () => {
    jest.spyOn(AnchorService as any, 'getRuntimeInfo').mockReturnValue({
      sandbox: true,
      provider: 'etherfuse',
      network: 'Stellar Testnet',
      base_url: 'https://api.sand.etherfuse.com',
      stellar_network_id: 'TESTNET',
      asset: {
        code: 'TESOURO',
        issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
        identifier: 'TESOURO',
      },
    });
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'owner-user',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sessionPinHash: 'hash',
    });
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockReturnValue(undefined);
    jest.spyOn(AnchorService as any, 'resolveTransferRecipient').mockResolvedValue({
      publicKey: anaPublicKey,
      displayName: 'Ana Silva',
      pixKey: '5595280606751',
      recipientKey: '5595280606751',
    });

    const result = await AnchorService.submitPixFundedTransferForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      recipient: 'Ana Silva',
      recipient_key: '5595280606751',
      amount: '43.29',
      asset_code: 'USDC',
      order_id: 'sandbox-pix-ledger-test',
      pin: '1234',
    });

    expect(result).toMatchObject({
      success: true,
      sandbox: true,
      sandbox_ledger_transfer: true,
      recipient_name: 'Ana Silva',
      amount: '43.29',
      asset_code: 'USDC',
    });
    expect(String(result.transaction_hash)).toMatch(/^sandbox-ledger-transfer-/);
  });

  it('allows XLM as the exact asset for a post-PIX transfer', async () => {
    jest.spyOn(AnchorService as any, 'getRuntimeInfo').mockReturnValue({
      sandbox: true,
      provider: 'etherfuse',
      network: 'Stellar Testnet',
      base_url: 'https://api.sand.etherfuse.com',
      stellar_network_id: 'TESTNET',
      asset: {
        code: 'TESOURO',
        issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
        identifier: 'TESOURO',
      },
    });
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'owner-user',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sessionPinHash: 'hash',
    });
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockReturnValue(undefined);
    jest.spyOn(AnchorService as any, 'resolveTransferRecipient').mockResolvedValue({
      publicKey: anaPublicKey,
      displayName: 'Ana Silva',
      pixKey: '5595280606751',
      recipientKey: '5595280606751',
    });

    const result = await AnchorService.submitPixFundedTransferForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      recipient: 'Ana Silva',
      recipient_key: '5595280606751',
      amount: '100',
      asset_code: 'XLM',
      order_id: 'sandbox-pix-xlm-test',
      pin: '1234',
    });

    expect(result).toMatchObject({
      success: true,
      sandbox: true,
      sandbox_ledger_transfer: true,
      recipient_name: 'Ana Silva',
      amount: '100',
      asset_code: 'XLM',
    });
    expect(result.asset_issuer).toBeUndefined();
    expect(String(result.transaction_hash)).toMatch(/^sandbox-ledger-transfer-/);
  });
});
