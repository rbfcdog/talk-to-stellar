import { supabase } from '../../config/supabase';
import { StellarService } from './stellar.service';
import { AuthService } from './auth.service';
import { StellarService as StellarBlockchainService } from './core/stellar.service';
import { WalletRepository } from '../repository/core/wallet.repository';
import VaultService from './core/vault.service';
import { v4 as uuidv4 } from 'uuid';
import { Keypair } from '@stellar/stellar-sdk';
import { ContactSeedService, STARTER_CONTACTS } from './contact-seed.service';
import { getStellarNetworkName, isInitialUsdcConversionEnabled } from '../../config/assets';

function normalizeEmail(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value?: string): string {
  return String(value || '').replace(/\D+/g, '');
}

export interface OnboardUserPayload {
  name?: string;
  email?: string;
  phoneNumber?: string;
  publicKey?: string;
  secretKey?: string;
}

export interface AddContactPayload {
  userId: string;
  contact_name: string;
  public_key?: string;
  pix_key?: string;
}

interface LookupContactPayload {
  userId: string;
  contact_name: string;
}

interface ListContactsPayload {
  userId: string;
}

export class UserService {
  private static async assertUniqueIdentity(input: { email?: string; phoneNumber?: string }): Promise<void> {
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phoneNumber);

    if (email) {
      const { data, error } = await supabase
        .from('agent_sessions')
        .select('session_id')
        .eq('email', email)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Database error: ${error.message}`);
      if (data?.session_id) {
        throw new Error('Já existe uma conta com este e-mail.');
      }
    }

    if (phone) {
      const { data, error } = await supabase
        .from('agent_sessions')
        .select('session_id')
        .eq('phone_number', phone)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Database error: ${error.message}`);
      if (data?.session_id) {
        throw new Error('Já existe uma conta com este telefone.');
      }
    }
  }

  private static deriveWalletName(input: OnboardUserPayload): string {
    if (input.name && input.name.trim()) {
      return input.name.trim();
    }

    if (input.email && input.email.includes('@')) {
      return input.email.split('@')[0];
    }

    if (input.phoneNumber && input.phoneNumber.trim()) {
      return `wallet_${input.phoneNumber.replace(/\D/g, '').slice(-6)}`;
    }

    return `wallet_${Date.now()}`;
  }

  private static isMissingTableError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('could not find the table') || message.includes('relation') && message.includes('does not exist');
  }

  private static isMissingColumnError(error: any, column: string): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('column') &&
      message.includes(column.toLowerCase()) &&
      (message.includes('does not exist') || message.includes('could not find'))
    );
  }

  private static async saveAgentSession(sessionRecord: any): Promise<void> {
    const { data: existing, error: selectError } = await supabase
      .from('agent_sessions')
      .select('id')
      .eq('session_id', sessionRecord.session_id)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      throw new Error(`Database error: ${selectError.message}`);
    }

    if (existing) {
      let { error: updateError } = await supabase
        .from('agent_sessions')
        .update(sessionRecord)
        .eq('session_id', sessionRecord.session_id);

      if (updateError && this.isMissingColumnError(updateError, 'pix_key')) {
        const { pix_key, ...sessionRecordWithoutPix } = sessionRecord;
        const retry = await supabase
          .from('agent_sessions')
          .update(sessionRecordWithoutPix)
          .eq('session_id', sessionRecord.session_id);
        updateError = retry.error;
      }

      if (updateError) {
        throw new Error(`Database error: ${updateError.message}`);
      }
      return;
    }

    let { error: insertError } = await supabase
      .from('agent_sessions')
      .insert(sessionRecord);

    if (insertError && this.isMissingColumnError(insertError, 'pix_key')) {
      const { pix_key, ...sessionRecordWithoutPix } = sessionRecord;
      const retry = await supabase
        .from('agent_sessions')
        .insert(sessionRecordWithoutPix);
      insertError = retry.error;
    }

    if (insertError) {
      throw new Error(`Database error: ${insertError.message}`);
    }
  }

  static async onboardUser(input: OnboardUserPayload): Promise<{ 
    userId: string; 
    publicKey: string; 
    sessionToken: string; 
    vaultSecretId?: string;
    initialBalance?: string;
  }> {
    let publicKey: string;
    let secretKey: string | undefined;
    let vaultSecretId: string | undefined;
    const normalizedEmail = normalizeEmail(input.email);
    const normalizedPhone = normalizePhone(input.phoneNumber);

    await this.assertUniqueIdentity({
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
    });

    if (input.secretKey) {
      try {
        const keypair = Keypair.fromSecret(input.secretKey);
        publicKey = keypair.publicKey();
        secretKey = input.secretKey;
      } catch (error) {
        throw new Error('Invalid Stellar private key (secret key).');
      }
    } else if (input.publicKey) {
      publicKey = input.publicKey;
      secretKey = undefined;
    } else {
      const { publicKey: newPublicKey, secret } = await StellarService.createTestAccount();
      publicKey = newPublicKey;
      secretKey = secret;
    }

    const userToCreate = {
      email: normalizedEmail || null,
      phone_number: normalizedPhone || null,
      stellar_public_key: publicKey,
    };

    let userId: string;
    let sessionId: string;
    let pixKey = '';

    const { data, error } = await supabase
      .from('users')
      .insert(userToCreate)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('User with this email or public key already exists.');
      }

      // Fallback for schema setups that only have agent_sessions/wallets tables
      if (this.isMissingTableError(error)) {
        userId = uuidv4();
        sessionId = uuidv4();

        const sessionToken = AuthService.generateTokenForUser(userId);
        const dbSessionToken = uuidv4();
        pixKey = ContactSeedService.derivePixKey(userId, {
          email: normalizedEmail || undefined,
          phoneNumber: normalizedPhone || undefined,
          name: input.name,
        });
        const sessionRecord = {
          session_id: sessionId,
          user_id: userId,
          email: normalizedEmail || '',
          session_token: dbSessionToken,
          public_key: publicKey,
          phone_number: normalizedPhone || null,
          pix_key: pixKey,
          created_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await this.saveAgentSession(sessionRecord);
      } else {
        throw new Error(`Database error: ${error.message}`);
      }
    } else {
      userId = data.id;
      sessionId = uuidv4();

      const sessionToken = AuthService.generateTokenForUser(userId);
      const dbSessionToken = uuidv4();
      pixKey = ContactSeedService.derivePixKey(userId, {
        email: normalizedEmail || undefined,
        phoneNumber: normalizedPhone || undefined,
        name: input.name,
      });
      const sessionRecord = {
        session_id: sessionId,
        user_id: userId,
        email: normalizedEmail || '',
        session_token: dbSessionToken,
        public_key: publicKey,
        phone_number: normalizedPhone || null,
        pix_key: pixKey,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await this.saveAgentSession(sessionRecord);
    }

    // Fetch initial balance from Stellar and save wallet info
    let initialBalance = '0';
    try {
      // Save wallet information to database using session_id schema
      const walletRepository = new WalletRepository(supabase);
      if (secretKey) {
        const vaultService = new VaultService(supabase);
        vaultSecretId = await vaultService.storeSecret(
          secretKey,
          `wallet:${userId}:private-key`,
          `Stellar private key for wallet ${publicKey}`
        );
      }

      if (secretKey) {
        const initialAssetSetup = await ContactSeedService.createDefaultTrustlines(publicKey, secretKey, userId, sessionId);
        if (isInitialUsdcConversionEnabled() && getStellarNetworkName() === 'TESTNET' && !initialAssetSetup.conversion?.completed) {
          console.warn(`[onboarding-usdc] initial funding conversion incomplete for ${publicKey}: ${initialAssetSetup.conversion?.error || 'sem detalhe retornado'}`);
          throw new Error('O saldo inicial em US$ ainda não ficou pronto. Tente novamente em alguns segundos.');
        }
      }

      const stellarService = new StellarBlockchainService();
      const accountInfo = await stellarService.getAccount(publicKey);
      const xlmBalance = accountInfo.balances.find((b) => b.asset_type === 'native');
      initialBalance = xlmBalance?.balance || '0';

      await walletRepository.saveWallet({
        session_id: sessionId,
        public_key: publicKey,
        vault_secret_id: vaultSecretId,
        name: this.deriveWalletName(input),
        pix_key: pixKey || undefined,
        balance: accountInfo.balances,
        sequence: accountInfo.sequence,
        account_data: accountInfo,
      });
    } catch (walletError) {
      const message = walletError instanceof Error ? walletError.message : String(walletError);
      if (message.includes('O saldo inicial em US$ ainda não ficou pronto')) {
        throw walletError;
      }
      console.warn('Warning: Could not fetch account balance or save wallet info:', walletError);
    }

    void ContactSeedService.ensureStarterContactsForUser(userId).catch((contactSeedError) => {
      console.warn('Warning: Could not seed starter contacts:', contactSeedError);
    });

    const sessionToken = AuthService.generateTokenForUser(userId);

    return {
      userId,
      publicKey,
      sessionToken,
      initialBalance,
      ...(vaultSecretId && { vaultSecretId }),
    };
  }

  static async addContact(payload: AddContactPayload): Promise<any> {
    const { userId, contact_name, pix_key } = payload;
    let public_key = payload.public_key;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    if (!public_key && pix_key) {
      const { data: walletByPix, error: walletPixError } = await supabase
        .from('wallets')
        .select('public_key')
        .ilike('pix_key', pix_key.trim().toLowerCase())
        .limit(1)
        .maybeSingle();

      if (walletPixError) {
        throw new Error(`Database error: ${walletPixError.message}`);
      }

      public_key = walletByPix?.public_key;
    }

    if (!public_key) {
      throw new Error('A Stellar public key or an existing TalkToStellar transfer key is required.');
    }

    const { data: newContact, error: insertError } = await supabase
      .from('contacts')
      .insert({
        owner_id: userId,
        contact_name: contact_name,
        stellar_public_key: public_key,
        pix_key: pix_key || null,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        throw new Error(`A contact with the name "${contact_name}" already exists.`);
      }
      throw new Error(`Database insert error: ${insertError.message}`);
    }

    return newContact;
  }

  static async lookupContactByNameAndUserId(payload: LookupContactPayload): Promise<any> {
    const { userId, contact_name } = payload;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', userId)
      .eq('contact_name', contact_name)
      .single();

    if (contactError || !contact) {
      throw new Error(`Contact with name "${contact_name}" not found for this user.`);
    }

    return contact;
  }

  static async listContacts(payload: ListContactsPayload): Promise<any[]> {
    const { userId } = payload;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error(`User with ID ${userId} not found.`);
    }

    const loadContacts = async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('owner_id', userId)
        .order('contact_name', { ascending: true });

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      return data || [];
    };

    let contacts = await loadContacts();
    if (contacts.length < STARTER_CONTACTS.length) {
      try {
        await ContactSeedService.ensureStarterContactsForUser(userId);
        contacts = await loadContacts();
      } catch (contactSeedError) {
        console.warn('Warning: Could not ensure starter contacts before listing:', contactSeedError);
      }
    }

    return contacts;
  }
}
