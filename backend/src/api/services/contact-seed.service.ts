import crypto from 'crypto';
import { supabase } from '../../config/supabase';
import { getAssetIssuer, getStellarNetworkName } from '../../config/assets';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletRepository } from '../../repositories/wallet.repository';
import { ExternalRepository } from '../../repositories/external.repository';
import VaultService from '../../services/vault.service';
import { StellarService } from './stellar.service';
import { TrustlineService } from './trustline.service';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export const STARTER_CONTACTS = [
  { contact_name: 'Ana Silva', pix_prefix: 'ana.silva' },
  { contact_name: 'Carlos Souza', pix_prefix: 'carlos.souza' },
  { contact_name: 'Marina Costa', pix_prefix: 'marina.costa' },
  { contact_name: 'Fernando Oliveira', pix_prefix: 'fernando.oliveira' },
  { contact_name: 'Juliana Lima', pix_prefix: 'juliana.lima' },
];

const CURRENT_STATIC_CONTACT_KEYS: Record<string, string> = {
  'Ana Silva': 'GDRJSYKLLAJB57DCGYAAH4XMFPURAI5VP6FI3VXE5SC2SEKCDGGZUZUP',
  'Carlos Souza': 'GCIWWXXCVYF63AMC7PX3C4SAMNPLHVZRPPGJXM4S3D5IJV4NOCJ32HLV',
  'Marina Costa': 'GCZCBCZE5HJVNN474RRZWAIHOCO334WK3TNBBKBRY764UYEB2NZXAILQ',
  'Fernando Oliveira': 'GC6QATSYXJSOZ57UAB6L7MLLVX3P7IA7SIBWQMNMGIH3SP5WJN5CSEPJ',
  'Juliana Lima': 'GAPPIDQ7WST32W6IEWGYQ2Z5KT4CCWEO7SI2JTD3GX6LCH6Z25EAKA6P',
};

const LEGACY_STATIC_CONTACT_KEYS: Record<string, string> = {
  'Ana Silva': 'GBRPYHIL2CI3FV4BMSXVQQ2C4RFRO6DOUEBLN3EJVL2RNQYWCYPSTJP',
  'Carlos Souza': 'GCZST3XVCDTUJ76ZAV2HA72KYSL4JGLXQRBLWHF23UROVPYM7VEZSMC',
  'Marina Costa': 'GBVJZKQXS2ZUHQW7CQW7QALTOQM2YGSF6BZZJHJ37F7P2EKCTQJRYGP',
  'Fernando Oliveira': 'GCJVKABVKJUWBWVVVZVLMOVQX5SCWRVVVEVVVUPVMLTDNC4ZBZZ2AKS',
  'Juliana Lima': 'GDZSTLYKACSUW6YL3VZ4OHJXSX45XGAJZLKTCN2IXOITCQC7SGRWSXY',
};

function stableHash(value: string, length = 8): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length);
}

function slug(value: string): string {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/@.*/, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32);

  return normalized || 'user';
}

function isLegacyStarterContact(contactName: string, publicKey: string): boolean {
  return CURRENT_STATIC_CONTACT_KEYS[contactName] === publicKey || LEGACY_STATIC_CONTACT_KEYS[contactName] === publicKey;
}

export function repairLegacyStarterContactKey(publicKey: string): string {
  const match = STARTER_CONTACTS.find((contact) => LEGACY_STATIC_CONTACT_KEYS[contact.contact_name] === publicKey);
  return match ? CURRENT_STATIC_CONTACT_KEYS[match.contact_name] : publicKey;
}

export class ContactSeedService {
  static derivePixKey(userId: string, email?: string, name?: string): string {
    const base = slug(email || name || userId);
    return `${base}.${stableHash(`${userId}:${email || ''}:${name || ''}`, 6)}@talktostellar`;
  }

  static deriveStarterPixKey(ownerId: string, pixPrefix: string): string {
    return `${pixPrefix}.${stableHash(ownerId, 8)}@talktostellar`;
  }

  static async createDefaultTrustlines(publicKey: string, secretKey: string, userId: string) {
    const result = await TrustlineService.createDefaultTrustlines(publicKey, secretKey, userId);
    if (!result.success) {
      logger.warn(`[contact-seed] default trustlines partially failed for ${publicKey}: ${result.errors.join(' | ')}`);
    }
    await this.convertSpendableFundingToUsdc(publicKey, secretKey, userId);
    return result;
  }

  static async convertSpendableFundingToUsdc(publicKey: string, secretKey: string, userId: string, sessionId?: string) {
    const enabledFlag = String(process.env.ONBOARDING_AUTO_CONVERT_TO_USDC || 'true').trim().toLowerCase();
    const enabled = enabledFlag !== 'false' && enabledFlag !== '0' && enabledFlag !== 'no';
    if (!enabled || getStellarNetworkName() !== 'TESTNET') return;

    const usdcIssuer = getAssetIssuer('USDC');
    if (!usdcIssuer) return;

    try {
      const account = await StellarService.loadAccount(publicKey);
      const nativeBalance = account.balances.find((balance: any) => balance.asset_type === 'native');
      const xlmBalance = Number(nativeBalance?.balance || '0');
      const keepXlm = Number(String(process.env.ONBOARDING_KEEP_XLM || '1.5').trim());
      const reserve = Number.isFinite(keepXlm) && keepXlm > 0 ? keepXlm : 1.5;
      const sourceAmountNumber = Math.floor((xlmBalance - reserve) * 1e7) / 1e7;

      if (!Number.isFinite(sourceAmountNumber) || sourceAmountNumber <= 0.01) {
        return;
      }

      const sourceAmount = sourceAmountNumber.toFixed(7);
      const quote = await StellarService.quoteStrictSendConversion({
        sourcePublicKey: publicKey,
        destination: publicKey,
        sourceAmount,
        sourceAsset: { code: 'XLM' },
        destAsset: { code: 'USDC', issuer: usdcIssuer },
      });
      const xdr = await StellarService.buildStrictSendConversionXdr({
        sourcePublicKey: publicKey,
        destination: publicKey,
        sourceAmount,
        sourceAsset: { code: 'XLM' },
        destAsset: { code: 'USDC', issuer: usdcIssuer },
      });

      const result = await StellarService.signAndSubmitXdr(userId, secretKey, xdr, {
        user_id: userId,
        type: 'PATH_PAYMENT_STRICT_SEND',
        destination_key: publicKey,
        asset_code: 'USDC',
        amount: Number(quote.destinationAmount),
        context: `Friendbot funding sweep: ${sourceAmount} XLM -> ${quote.destinationAmount} USDC`,
        source_public_key: publicKey,
        source_session_id: sessionId,
        destination_session_id: sessionId,
      });

      if (!result.success) {
        logger.warn(`[contact-seed] funding XLM->USDC sweep failed for ${publicKey}: ${result.error || 'unknown error'}`);
      } else {
        logger.info(`[contact-seed] funding XLM->USDC sweep succeeded for ${publicKey}: ${sourceAmount} XLM -> ${quote.destinationAmount} USDC`);
      }
    } catch (error) {
      logger.warn(`[contact-seed] funding XLM->USDC sweep skipped for ${publicKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static async createInternalContactWallet(ownerId: string, contactName: string, pixKey: string) {
    const agentRepo = new AgentRepository(supabase);
    const walletRepo = new WalletRepository(supabase);
    const externalRepo = new ExternalRepository(supabase);
    const vaultService = new VaultService(supabase);
    const sessionId = uuidv4();
    const sessionToken = uuidv4();
    const now = new Date().toISOString();
    const generated = await StellarService.createTestAccount();
    const contactUserId = `starter:${stableHash(`${ownerId}:${contactName}`, 24)}`;
    const vaultSecretId = await vaultService.storeSecret(
      generated.secret,
      `wallet:${contactUserId}:private-key`,
      `Stellar private key for wallet ${generated.publicKey}`
    );

    await agentRepo.saveSession(sessionId, {
      user_id: contactUserId,
      email: pixKey,
      session_token: sessionToken,
      public_key: generated.publicKey,
      phone_number: undefined,
      pix_key: pixKey,
      password_hash: undefined,
      session_password_hash: undefined,
      created_at: now,
      last_activity: now,
    });

    await walletRepo.saveWallet({
      session_id: sessionId,
      public_key: generated.publicKey,
      vault_secret_id: vaultSecretId,
      name: contactName,
      pix_key: pixKey,
    });

    await externalRepo.createMapping({
      provider: 'starter_contact',
      provider_user_id: pixKey,
      session_id: sessionId,
      user_id: contactUserId,
    });

    await this.createDefaultTrustlines(generated.publicKey, generated.secret, contactUserId);

    return {
      userId: contactUserId,
      sessionId,
      publicKey: generated.publicKey,
      vaultSecretId,
      pixKey,
    };
  }

  static async ensureStarterContactsForUser(ownerId: string): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const result = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
    if (!ownerId) return result;

    if (getStellarNetworkName() === 'PUBLIC' && String(process.env.ENABLE_PUBLIC_STARTER_CONTACTS || '').toLowerCase() !== 'true') {
      result.skipped = STARTER_CONTACTS.length;
      return result;
    }

    const walletRepo = new WalletRepository(supabase);

    for (const contact of STARTER_CONTACTS) {
      const pixKey = this.deriveStarterPixKey(ownerId, contact.pix_prefix);

      try {
        const { data: existing, error: existingError } = await supabase
          .from('contacts')
          .select('*')
          .eq('owner_id', ownerId)
          .eq('contact_name', contact.contact_name)
          .limit(1)
          .maybeSingle();

        if (existingError) {
          throw new Error(existingError.message || 'failed to load contact');
        }

        const existingPublicKey = String(existing?.stellar_public_key || '').trim();
        const existingWallet = existingPublicKey
          ? await walletRepo.getWalletByPublicKey(existingPublicKey).catch(() => null)
          : null;

        if (existing && existingPublicKey && existingWallet?.vault_secret_id && !isLegacyStarterContact(contact.contact_name, existingPublicKey)) {
          if (existing.pix_key !== pixKey) {
            const { error: updatePixError } = await supabase
              .from('contacts')
              .update({ pix_key: pixKey, updated_at: new Date().toISOString() })
              .eq('id', existing.id);
            if (updatePixError) throw new Error(updatePixError.message || 'failed to update contact pix key');
            result.updated += 1;
          } else {
            result.skipped += 1;
          }
          continue;
        }

        if (existing && existingPublicKey && !isLegacyStarterContact(contact.contact_name, existingPublicKey) && existing.pix_key && existing.pix_key !== pixKey) {
          result.skipped += 1;
          continue;
        }

        const contactWallet = await this.createInternalContactWallet(ownerId, contact.contact_name, pixKey);

        if (existing?.id) {
          const { error: updateError } = await supabase
            .from('contacts')
            .update({
              stellar_public_key: contactWallet.publicKey,
              pix_key: pixKey,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updateError) throw new Error(updateError.message || 'failed to update starter contact');
          result.updated += 1;
        } else {
          const { error: insertError } = await supabase
            .from('contacts')
            .insert({
              owner_id: ownerId,
              contact_name: contact.contact_name,
              stellar_public_key: contactWallet.publicKey,
              pix_key: pixKey,
            });

          if (insertError) throw new Error(insertError.message || 'failed to insert starter contact');
          result.created += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[contact-seed] failed for ${ownerId}/${contact.contact_name}: ${message}`);
        result.errors.push(`${contact.contact_name}: ${message}`);
      }
    }

    return result;
  }
}
