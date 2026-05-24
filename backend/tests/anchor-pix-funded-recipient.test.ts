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

  afterEach(() => {
    jest.restoreAllMocks();
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
});
