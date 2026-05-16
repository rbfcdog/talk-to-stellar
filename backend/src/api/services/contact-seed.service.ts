import crypto from 'crypto';
import { supabase } from '../../config/supabase';
import { getAssetIssuer, getDefaultTrustedAssets, getStellarNetworkName, TESTNET_USDC_ISSUER } from '../../config/assets';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletRepository } from '../../repositories/wallet.repository';
import { ExternalRepository } from '../../repositories/external.repository';
import VaultService from '../../services/vault.service';
import { StellarService } from './stellar.service';
import { TrustlineService } from './trustline.service';
import { logger } from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const INITIAL_USDC_MIN_SOURCE_XLM = 0.01;
const INITIAL_USDC_FEE_BUFFER_XLM = 0.05;
const STELLAR_BASE_RESERVE_XLM = 0.5;

export type InitialUsdcConversionResult = {
  attempted: boolean;
  completed: boolean;
  sourceAmount?: string;
  destinationAmount?: string;
  keepXlm?: number;
  error?: string;
};

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

function stableNumericHash(value: string, length = 8): string {
  const hex = crypto.createHash('sha256').update(value).digest('hex');
  const digits = hex.replace(/[a-f]/g, (char) => String(char.charCodeAt(0) % 10));
  return digits.slice(0, length);
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
  static derivePixKey(userId: string, input?: {
    email?: string;
    phoneNumber?: string;
    cpf?: string;
    name?: string;
  }): string {
    const email = String(input?.email || '').trim().toLowerCase();
    const phone = String(input?.phoneNumber || '').replace(/\D+/g, '');
    const cpf = String(input?.cpf || '').replace(/\D+/g, '');
    const name = String(input?.name || '').trim();

    if (email) return email;
    if (phone && phone.length >= 10) return phone;
    if (cpf && cpf.length === 11) return cpf;

    const base = slug(name || userId);
    return `${base}-${stableHash(`${userId}:${name}`, 10)}`;
  }

  static deriveStarterPixKey(ownerId: string, pixPrefix: string): string {
    const seed = `${ownerId}:${pixPrefix}`;
    return `55${stableNumericHash(seed, 11)}`;
  }

  private static getHardcodedUsdcIssuer(): string {
    return getStellarNetworkName() === 'TESTNET'
      ? TESTNET_USDC_ISSUER
      : (getAssetIssuer('USDC') || '');
  }

  private static plannedDefaultSubentryCount(): number {
    return getDefaultTrustedAssets().filter((asset) => Boolean(asset.issuer)).length;
  }

  private static minimumXlmToKeep(account: any): number {
    const currentSubentries = Number((account as any)?.subentry_count || 0);
    const plannedSubentries = Math.max(currentSubentries, this.plannedDefaultSubentryCount());
    return ((2 + plannedSubentries) * STELLAR_BASE_RESERVE_XLM) + INITIAL_USDC_FEE_BUFFER_XLM;
  }

  private static balanceAmount(account: any, predicate: (balance: any) => boolean): number {
    const balance = account.balances.find(predicate);
    const amount = Number(balance?.balance || '0');
    return Number.isFinite(amount) ? amount : 0;
  }

  static async createDefaultTrustlines(publicKey: string, secretKey: string, userId: string, sessionId?: string | null) {
    let conversion: InitialUsdcConversionResult = { attempted: false, completed: false };
    const usdcIssuer = this.getHardcodedUsdcIssuer();

    if (getStellarNetworkName() === 'TESTNET' && usdcIssuer) {
      const usdcTrustline = await TrustlineService.createTrustline(publicKey, secretKey, userId, {
        code: 'USDC',
        issuer: usdcIssuer,
      });
      if (!usdcTrustline.success && usdcTrustline.error) {
        logger.warn(`[contact-seed] USDC trustline failed before initial conversion for ${publicKey}: ${usdcTrustline.error}`);
      }
      conversion = await this.convertSpendableFundingToUsdc(publicKey, secretKey, userId, sessionId);
    }

    const result = await TrustlineService.createDefaultTrustlines(publicKey, secretKey, userId);
    if (!result.success) {
      logger.warn(`[contact-seed] default trustlines partially failed for ${publicKey}: ${result.errors.join(' | ')}`);
    }
    return { ...result, conversion };
  }

  static async convertSpendableFundingToUsdc(publicKey: string, secretKey: string, userId: string, sessionId?: string | null): Promise<InitialUsdcConversionResult> {
    if (getStellarNetworkName() !== 'TESTNET') return { attempted: false, completed: false };

    const usdcIssuer = this.getHardcodedUsdcIssuer();
    if (!usdcIssuer) return { attempted: false, completed: false, error: 'USDC issuer unavailable' };

    try {
      const account = await StellarService.loadAccount(publicKey);
      const existingUsdcAmount = this.balanceAmount(account, (balance: any) => (
        balance.asset_type !== 'native' &&
        String(balance.asset_code || '').toUpperCase() === 'USDC' &&
        String(balance.asset_issuer || '') === usdcIssuer
      ));
      const xlmBalance = this.balanceAmount(account, (balance: any) => balance.asset_type === 'native');
      const keepXlm = this.minimumXlmToKeep(account);
      const sourceAmountNumber = Math.floor((xlmBalance - keepXlm) * 1e7) / 1e7;

      if (!Number.isFinite(sourceAmountNumber) || sourceAmountNumber <= INITIAL_USDC_MIN_SOURCE_XLM) {
        if (existingUsdcAmount > 0.0000001) {
          return {
            attempted: false,
            completed: true,
            destinationAmount: existingUsdcAmount.toFixed(7),
            keepXlm,
          };
        }
        return {
          attempted: false,
          completed: false,
          keepXlm,
          error: `Saldo XLM insuficiente para conversão inicial. Disponível: ${xlmBalance}, reserva necessária: ${keepXlm}.`,
        };
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
        source_session_id: sessionId || undefined,
        destination_session_id: sessionId || undefined,
      });

      if (!result.success) {
        logger.warn(`[contact-seed] funding XLM->USDC sweep failed for ${publicKey}: ${result.error || 'unknown error'}`);
        return {
          attempted: true,
          completed: false,
          sourceAmount,
          keepXlm,
          error: result.error || 'unknown conversion failure',
        };
      } else {
        const freshAccount = await StellarService.loadAccount(publicKey);
        const finalUsdcAmount = this.balanceAmount(freshAccount, (balance: any) => (
          balance.asset_type !== 'native' &&
          String(balance.asset_code || '').toUpperCase() === 'USDC' &&
          String(balance.asset_issuer || '') === usdcIssuer
        ));
        const finalXlmBalance = this.balanceAmount(freshAccount, (balance: any) => balance.asset_type === 'native');
        const finalKeepXlm = this.minimumXlmToKeep(freshAccount);
        const remainingSpendableXlm = Math.floor((finalXlmBalance - finalKeepXlm) * 1e7) / 1e7;
        const completed = finalUsdcAmount > existingUsdcAmount + 0.0000001 &&
          remainingSpendableXlm <= INITIAL_USDC_MIN_SOURCE_XLM;

        if (!completed) {
          const error = `Conversão submetida, mas ainda restam ${remainingSpendableXlm.toFixed(7)} XLM disponíveis para varrer.`;
          logger.warn(`[contact-seed] funding XLM->USDC sweep incomplete for ${publicKey}: ${error}`);
          return {
            attempted: true,
            completed: false,
            sourceAmount,
            destinationAmount: finalUsdcAmount.toFixed(7),
            keepXlm: finalKeepXlm,
            error,
          };
        }

        logger.info(`[contact-seed] funding XLM->USDC sweep succeeded for ${publicKey}: ${sourceAmount} XLM -> ${quote.destinationAmount} USDC`);
        return {
          attempted: true,
          completed: true,
          sourceAmount,
          destinationAmount: finalUsdcAmount.toFixed(7),
          keepXlm: finalKeepXlm,
        };
      }
    } catch (error) {
      logger.warn(`[contact-seed] funding XLM->USDC sweep skipped for ${publicKey}: ${error instanceof Error ? error.message : String(error)}`);
      return {
        attempted: true,
        completed: false,
        error: error instanceof Error ? error.message : String(error),
      };
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
