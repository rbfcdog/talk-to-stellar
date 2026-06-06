import { supabase } from '../src/config/supabase';
import { AnchorService } from '../src/api/services/anchor.service';
import { PaymentReceiptService } from '../src/api/services/receipts/payment-receipt.service';
import { StellarService } from '../src/api/services/stellar.service';
import VaultService from '../src/api/services/core/vault.service';

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

function createFlexibleWalletsBuilder(options: {
  pixRow?: any;
  sessionRow?: any;
  publicKeyRow?: any;
} = {}) {
  const filters: Array<{ column: string; value: string }> = [];
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    ilike: jest.fn((column: string, value: string) => {
      filters.push({ column, value });
      return builder;
    }),
    eq: jest.fn((column: string, value: string) => {
      filters.push({ column, value });
      return builder;
    }),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(async () => {
      const pixFilter = filters.find((filter) => filter.column === 'pix_key');
      if (pixFilter && options.pixRow) return { data: options.pixRow, error: null };
      return { data: null, error: null };
    }),
    single: jest.fn(async () => {
      const sessionFilter = filters.find((filter) => filter.column === 'session_id');
      if (sessionFilter && options.sessionRow) return { data: options.sessionRow, error: null };
      const publicKeyFilter = filters.find((filter) => filter.column === 'public_key');
      if (publicKeyFilter && options.publicKeyRow) return { data: options.publicKeyRow, error: null };
      return { data: null, error: { code: 'PGRST116', message: 'not found' } };
    }),
  };
  return builder;
}

function createAgentSessionsBuilder(sessionRow: any = null) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: sessionRow, error: null }),
  };
  return builder;
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
      CETES_ISSUER_TESTNET: 'GCRYUGD5HYEZB7KUW2JK3AGC6W2GZLHB7NJZQDA2WPKNCLUPQ3WQ4QG7',
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

  it('resolves a saved contact that only has email/PIX metadata through the recipient session wallet', async () => {
    jest.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'contacts') {
        return createContactsBuilder([
          {
            id: 421,
            contact_name: 'Ana Silva',
            stellar_public_key: null,
            pix_key: 'ana.silva@example.com',
            phone_number: null,
          },
        ]) as any;
      }
      if (table === 'wallets') {
        return createFlexibleWalletsBuilder({
          sessionRow: {
            session_id: 'recipient-session',
            user_id: 'ana-user',
            public_key: anaPublicKey,
            vault_secret_id: 'recipient-vault',
            pix_key: 'ana.silva@example.com',
          },
        }) as any;
      }
      if (table === 'agent_sessions') {
        return createAgentSessionsBuilder({
          session_id: 'recipient-session',
          user_id: 'ana-user',
          email: 'ana.silva@example.com',
        }) as any;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const recipient = await (AnchorService as any).resolveTransferRecipient(
      'owner-user',
      'Ana Silva',
      {
        preferredKey: 'ana.silva@example.com',
      }
    );

    expect(recipient).toMatchObject({
      publicKey: anaPublicKey,
      displayName: 'Ana Silva',
      pixKey: 'ana.silva@example.com',
      recipientKey: 'ana.silva@example.com',
      sessionId: 'recipient-session',
      vaultSecretId: 'recipient-vault',
    });
  });

  it('completes CETES PIX-funded transfer and sends a concise WhatsApp callback receipt', async () => {
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/cetes-pix');
    jest.spyOn(AnchorService as any, 'getRuntimeInfo').mockReturnValue({ sandbox: true });
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'sender-session',
      userId: 'sender-user',
      publicKey: 'GB7L4QQQAMRJQI7GGRH2Y6TSDD2JTFNGEHPKLB3XU43YSOE6GJLMFZWT',
      vaultSecretId: '',
    });
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockImplementation(() => undefined);
    jest.spyOn(AnchorService as any, 'sandboxLedgerFallbackAllowed').mockReturnValue(true);
    jest.spyOn(AnchorService as any, 'resolveTransferRecipient').mockResolvedValue({
      publicKey: anaPublicKey,
      displayName: 'Ana Silva',
      pixKey: '5595280606751',
      recipientKey: '5595280606751',
      sessionId: 'recipient-session',
      userId: 'ana-user',
      vaultSecretId: '',
    });
    jest.spyOn(AnchorService as any, 'upsertRecentContactFromPayment').mockResolvedValue(undefined);

    const result = await AnchorService.submitPixFundedTransferForSession({
      session_id: 'sender-session',
      pin: '1234',
      amount: '100',
      asset_code: 'CETES',
      recipient: 'Ana Silva',
      recipient_key: '5595280606751',
      provider: 'whatsapp',
      provider_user_id: '+5519997624114',
      order_id: 'sandbox-pix-order',
      dedupe_key: 'pix-funded-autopay:page-1',
    } as any);

    expect(result).toMatchObject({
      success: true,
      recipient_name: 'Ana Silva',
      amount: '100',
      asset_code: 'CETES',
      receipt_url: 'https://talktostellar.com/receipt/cetes-pix',
    });
    expect(String(result.message)).toContain('100 CETES');
    expect(receiptSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'payment_sent',
      provider: 'whatsapp',
      providerUserId: '+5519997624114',
      counterpartyLabel: 'Ana Silva',
      sourceAmount: '100',
      sourceAssetCode: 'CETES',
      destinationAmount: '100',
      destinationAssetCode: 'CETES',
      externalDeliveryText: expect.stringContaining('PIX confirmado e transferencia enviada.'),
      dedupeKey: 'pix-funded-autopay:page-1',
    }));
    const receiptInput = receiptSpy.mock.calls[0][0] as any;
    expect(receiptInput.externalDeliveryText).toContain('Valor: 100 CETES');
    expect(receiptInput.externalDeliveryText).toContain('Destino: Ana Silva');
  });

  it('converts the topped-up source asset before sending when recipient should receive another asset', async () => {
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/brl-usdc-pix');
    jest.spyOn(AnchorService as any, 'getRuntimeInfo').mockReturnValue({ sandbox: true });
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'sender-session',
      userId: 'sender-user',
      publicKey: 'GB7L4QQQAMRJQI7GGRH2Y6TSDD2JTFNGEHPKLB3XU43YSOE6GJLMFZWT',
      vaultSecretId: 'sender-vault',
    });
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockImplementation(() => undefined);
    jest.spyOn(AnchorService as any, 'sandboxLedgerSettlementEnabled').mockReturnValue(false);
    jest.spyOn(AnchorService as any, 'resolveTransferRecipient').mockResolvedValue({
      publicKey: anaPublicKey,
      displayName: 'Marina Costa',
      pixKey: 'marina@example.com',
      recipientKey: 'marina@example.com',
      sessionId: '',
      userId: '',
      vaultSecretId: '',
    });
    jest.spyOn(AnchorService as any, 'upsertRecentContactFromPayment').mockResolvedValue(undefined);
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue('SBYFUNDINGSECRET');
    const strictSendSpy = jest.spyOn(StellarService, 'submitStrictSendPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'strict-send-hash',
      destinationAmount: '18.2500000',
      destinationMin: '17.8850000',
    });
    const directSendSpy = jest.spyOn(StellarService, 'submitAssetPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'direct-should-not-run',
    });

    const result = await AnchorService.submitPixFundedTransferForSession({
      session_id: 'sender-session',
      pin: '1234',
      amount: '100',
      asset_code: 'BRL',
      source_asset_code: 'BRL',
      destination_asset_code: 'USDC',
      recipient: 'Marina Costa',
      recipient_key: 'marina@example.com',
      provider: 'whatsapp',
      provider_user_id: '+5519997624114',
      order_id: 'sandbox-pix-order',
    } as any);

    expect(strictSendSpy).toHaveBeenCalledWith(expect.objectContaining({
      sourceAmount: '100.0000000',
      sourceAsset: expect.objectContaining({ code: 'TESOURO' }),
      destinationAsset: expect.objectContaining({ code: 'USDC' }),
      destination: anaPublicKey,
    }));
    expect(directSendSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      recipient_name: 'Marina Costa',
      amount: '18.2500000',
      asset_code: 'USDC',
      source_amount: '100',
      source_asset_code: 'BRL',
      destination_amount: '18.2500000',
      destination_asset_code: 'USDC',
      receipt_url: 'https://talktostellar.com/receipt/brl-usdc-pix',
    });
    expect(String(result.message)).toContain('US$ 18.25');
    expect(receiptSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'payment_sent',
      sourceAmount: '100',
      sourceAssetCode: 'BRL',
      destinationAmount: '18.2500000',
      destinationAssetCode: 'USDC',
      externalDeliveryText: expect.stringContaining('Valor: US$ 18.25'),
    }));
  });

  it('simulates the post-PIX transfer in sandbox ledger mode when no on-chain funding secret is available', async () => {
    process.env.ALLOW_SANDBOX_LEDGER_SETTLEMENT = 'true';
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
    process.env.ALLOW_SANDBOX_LEDGER_SETTLEMENT = 'true';
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
