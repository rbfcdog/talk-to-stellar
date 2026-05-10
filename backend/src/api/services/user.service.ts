import { supabase } from '../../config/supabase';
import { StellarService } from './stellar.service';
import { AuthService } from './auth.service';
import { StellarService as StellarBlockchainService } from '../../services/stellar.service';
import { WalletRepository } from '../../repositories/wallet.repository';
import VaultService from '../../services/vault.service';
import { v4 as uuidv4 } from 'uuid';
import { Keypair } from '@stellar/stellar-sdk';
import { ContactSeedService } from './contact-seed.service';

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
      email: input.email,
      phone_number: input.phoneNumber,
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
        pixKey = ContactSeedService.derivePixKey(userId, input.email, input.name);
        const sessionRecord = {
          session_id: sessionId,
          user_id: userId,
          email: input.email || `${userId}@local.test`,
          session_token: dbSessionToken,
          public_key: publicKey,
          phone_number: input.phoneNumber || null,
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
      pixKey = ContactSeedService.derivePixKey(userId, input.email, input.name);
      const sessionRecord = {
        session_id: sessionId,
        user_id: userId,
        email: input.email || `${userId}@local.test`,
        session_token: dbSessionToken,
        public_key: publicKey,
        phone_number: input.phoneNumber || null,
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
      const stellarService = new StellarBlockchainService();
      const accountInfo = await stellarService.getAccount(publicKey);
      const xlmBalance = accountInfo.balances.find((b) => b.asset_type === 'native');
      initialBalance = xlmBalance?.balance || '0';

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

      if (secretKey) {
        await ContactSeedService.createDefaultTrustlines(publicKey, secretKey, userId);
      }
    } catch (walletError) {
      console.warn('Warning: Could not fetch account balance or save wallet info:', walletError);
    }

    try {
      await ContactSeedService.ensureStarterContactsForUser(userId);
    } catch (contactSeedError) {
      console.warn('Warning: Could not seed starter contacts:', contactSeedError);
    }

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

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', userId)
      .order('contact_name', { ascending: true });

    if (contactsError) {
      throw new Error(`Database error: ${contactsError.message}`);
    }

    return contacts || [];
  }

  
}
