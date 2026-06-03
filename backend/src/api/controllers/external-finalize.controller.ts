import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from '../../config/supabase';
import { AgentRepository } from '../repository/core/agent.repository';
import { WalletRepository } from '../repository/core/wallet.repository';
import {
  ExternalRepository,
  externalProviderAliases,
  isPhoneProvider,
  normalizeExternalProvider,
  normalizeExternalProviderUserId,
} from '../repository/core/external.repository';
import PasskeyService from '../services/core/passkey.service';
import { ContactRepository } from '../repository/contact.repository';
import { VaultService } from '../services/core/vault.service';
import { StellarService } from '../services/stellar.service';
import { TransferNotificationService } from '../services/transfer-notification.service';
import { PaymentReceiptService } from '../services/payment-receipt.service';
import { ContactSeedService } from '../services/contact-seed.service';
import { ActivityFeedService } from '../services/activity-feed.service';
import { EconomyEngineService } from '../services/economy-engine.service';
import { PlatformFeeService } from '../services/platform-fee.service';
import { GlobalProfileService } from '../services/global-profile.service';
import { logger } from '../../utils/logger';
import { getAssetIssuer, normalizeAssetCode, resolveConfiguredAsset } from '../../config/assets';
import { DEFAULT_NETWORK_FEE_XLM, buildUnifiedFeeDisplay, formatCustomerAssetAmount, formatNetworkFeeForCustomer } from '../../utils/fee-display';
import { Keypair } from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import { isSessionExpired } from '../../utils/session-expiry';
import { getQuoteExpiry, isQuoteExpired, quoteExpiryMessage } from '../services/quote-expiry.service';
import { buildOperationFingerprint } from '../services/core/idempotency.service';
import {
  EmailConfirmationError,
  EmailConfirmationPurpose,
  EmailConfirmationService,
} from '../services/email-confirmation.service';
import { getRequiredJwtSecret } from '../../config/secrets';
import { hashWalletPin, verifyWalletPinAgainstAny } from '../../utils/pin-hash';
import { publicErrorCode, publicErrorMessage, publicErrorPayload } from '../../utils/public-error';

function buildSettlementEconomy(input: {
  sourceAmount: string;
  sourceAssetCode: string;
  feeBrl?: string | null;
  quote?: any;
}) {
  const platformFee = input.quote?.platformFee || {};
  const grossAmountBrl = EconomyEngineService.estimateAmountInBrl({
    amount: input.sourceAmount,
    assetCode: input.sourceAssetCode,
    quote: input.quote,
  });
  const platformFeeBrl = EconomyEngineService.estimateAmountInBrl({
    amount: platformFee.feeAmount,
    assetCode: platformFee.feeAssetCode,
    quote: input.quote,
  });
  const effectiveFeeBrl = EconomyEngineService.effectiveCostFromQuote({
    grossAmountBrl,
    networkFeeBrl: input.feeBrl,
    platformFeeBrl,
    quote: input.quote,
  });
  const savings = EconomyEngineService.calculateForSettledOperation({
    sourceAmount: input.sourceAmount,
    sourceAssetCode: input.sourceAssetCode,
    feeBrl: input.feeBrl,
    platformFeeAmount: platformFee.feeAmount,
    platformFeeAssetCode: platformFee.feeAssetCode,
    quote: input.quote,
    effectiveFeeBrl,
    comparisonMethod: platformFee.comparisonMethod || EconomyEngineService.comparisonMethod(),
  });

  return {
    actual_fee_brl: savings.actualFeeBrl,
    platform_fee_brl: savings.platformFeeBrl,
    gross_amount_brl: savings.grossAmountBrl,
    savings: {
      estimated_traditional_fee: savings.estimatedTraditionalFee,
      actual_fee: savings.actualFee,
      estimated_savings: savings.estimatedSavings,
      savings_percentage: savings.savingsPercentage,
      comparison_method: savings.comparisonMethod,
      gross_amount_brl: savings.grossAmountBrl,
    },
  };
}

function getAccountAssetBalance(account: any, asset: { code: string; issuer?: string }): number {
  const code = normalizeAssetCode(asset.code);
  const issuer = String(asset.issuer || '').trim();
  const balance = (account?.balances || []).find((item: any) => {
    if (code === 'XLM') return String(item?.asset_type || '').toLowerCase() === 'native';
    return (
      String(item?.asset_type || '').toLowerCase() !== 'native' &&
      String(item?.asset_code || '').toUpperCase() === code &&
      String(item?.asset_issuer || '').trim() === issuer
    );
  });
  const parsed = Number(String(balance?.balance || '0').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatBalanceNumber(value: number): string {
  return value.toFixed(7).replace(/\.?0+$/, '');
}

function sameAsset(left: { code: string; issuer?: string }, right: { code: string; issuer?: string }): boolean {
  const leftCode = normalizeAssetCode(left.code);
  const rightCode = normalizeAssetCode(right.code);
  if (leftCode !== rightCode) return false;
  if (leftCode === 'XLM') return true;
  return String(left.issuer || '').trim() === String(right.issuer || '').trim();
}

function getSpendableAssetBalance(account: any, asset: { code: string; issuer?: string }, minimumReserve = 1.5): number {
  const balance = getAccountAssetBalance(account, asset);
  return normalizeAssetCode(asset.code) === 'XLM'
    ? Math.max(0, balance - minimumReserve)
    : balance;
}

function getTrustedSpendableAssets(account: any, destinationAsset: { code: string; issuer?: string }): Array<{ code: string; issuer?: string }> {
  const trustedOrder = ['USDC', 'BRL', 'XLM'];
  const byKey = new Map<string, { code: string; issuer?: string; balance: number }>();

  for (const balance of account?.balances || []) {
    const code = normalizeAssetCode(balance?.asset_type === 'native' ? 'XLM' : balance?.asset_code);
    if (code !== 'XLM' && !trustedOrder.includes(code)) continue;

    const asset = {
      code,
      issuer: code === 'XLM' ? undefined : String(balance?.asset_issuer || '').trim() || resolveAssetIssuer(code),
    };
    if (code !== 'XLM' && !asset.issuer) continue;

    const parsedBalance = Number(String(balance?.balance || '0').replace(',', '.'));
    if (!Number.isFinite(parsedBalance) || parsedBalance <= 0) continue;

    const key = `${asset.code}:${asset.issuer || ''}`;
    byKey.set(key, { ...asset, balance: parsedBalance });
  }

  return Array.from(byKey.values())
    .sort((a, b) => {
      if (sameAsset(a, destinationAsset)) return -1;
      if (sameAsset(b, destinationAsset)) return 1;
      return trustedOrder.indexOf(a.code) - trustedOrder.indexOf(b.code);
    })
    .map(({ balance: _balance, ...asset }) => asset);
}

function getJwtSecret() {
  return getRequiredJwtSecret();
}

const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);
const externalRepo = new ExternalRepository(supabase);
const vaultService = new VaultService(supabase);

const IDENTITY_CONFLICT_MESSAGE = 'Não foi possível concluir: já existe uma conta com os mesmos dados (email, telefone ou CPF).';

function requestIdFromReq(req: Request): string {
  return String(req?.headers?.['x-request-id'] || req?.headers?.['x-correlation-id'] || '').trim();
}

function maskLogValue(value: unknown, start = 6, end = 4): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (text.length <= start + end + 3) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function verifyPinAgainstSession(pin: string, session: any) {
  return verifyWalletPinAgainstAny(pin, [
    session?.session_password_hash,
    session?.password_hash,
  ]);
}

function resolveCompletionChannel(payload: any, body: any): { provider: string; providerUserId: string } {
  const rawProviderUserId = String(
    payload?.provider_user_id ||
    body?.provider_user_id ||
    body?.providerUserId ||
    body?.external_provider_user_id ||
    body?.externalProviderUserId ||
    ''
  );
  const explicitProvider = normalizeExternalProvider(
    String(payload?.provider || body?.provider || body?.external_provider || '')
  );
  const sourceProvider = normalizeExternalProvider(String(payload?.source || body?.source || ''));
  const deliveryProvider = (provider: string) => (
    ['telegram', 'whatsapp', 'phone', 'evolution', 'whatsapp_evolution'].includes(provider) ? provider : ''
  );
  const phoneDigits = rawProviderUserId.replace(/\D+/g, '');
  const inferredProvider = phoneDigits.length >= 10 && phoneDigits.length <= 15 ? 'whatsapp' : '';
  const provider = deliveryProvider(explicitProvider) || deliveryProvider(sourceProvider) || inferredProvider;
  const providerUserId = provider ? normalizeExternalProviderUserId(provider, rawProviderUserId) : '';
  return { provider, providerUserId };
}

function externalChannelMetadata(payload: any, body: any, fallbackPhoneNumber?: string): Record<string, unknown> {
  const provider = normalizeExternalProvider(String(payload?.provider || body?.provider || body?.external_provider || ''));
  if (!['whatsapp', 'phone', 'evolution', 'whatsapp_evolution'].includes(provider)) return {};

  const phoneNumber = String(
    fallbackPhoneNumber ||
    body?.phone_number ||
    body?.phoneNumber ||
    payload?.phone_number ||
    payload?.phoneNumber ||
    body?.whatsapp_number ||
    body?.whatsappNumber ||
    payload?.whatsapp_number ||
    payload?.whatsappNumber ||
    body?.provider_user_id ||
    payload?.provider_user_id ||
    ''
  ).replace(/\D+/g, '');
  const remoteJid = String(
    body?.remote_jid ||
    body?.remoteJid ||
    payload?.remote_jid ||
    payload?.remoteJid ||
    body?.jid ||
    payload?.jid ||
    ''
  ).trim();
  const instance = String(
    body?.instance ||
    body?.instanceName ||
    body?.instance_name ||
    body?.evolution_instance ||
    body?.evolutionInstance ||
    payload?.instance ||
    payload?.instanceName ||
    payload?.instance_name ||
    payload?.evolution_instance ||
    payload?.evolutionInstance ||
    ''
  ).trim();
  const instanceId = String(
    body?.instance_id ||
    body?.instanceId ||
    body?.evolution_instance_id ||
    body?.evolutionInstanceId ||
    payload?.instance_id ||
    payload?.instanceId ||
    payload?.evolution_instance_id ||
    payload?.evolutionInstanceId ||
    ''
  ).trim();
  const messageId = String(body?.message_id || body?.messageId || payload?.message_id || payload?.messageId || '').trim();
  const metadata: Record<string, unknown> = {};
  if (phoneNumber) {
    metadata.phone_number = phoneNumber;
    metadata.whatsapp_number = phoneNumber;
  }
  if (remoteJid) {
    metadata.remote_jid = remoteJid;
    metadata.jid = remoteJid;
  }
  if (instance) {
    metadata.instance = instance;
    metadata.evolution_instance = instance;
  }
  if (instanceId) {
    metadata.instance_id = instanceId;
    metadata.evolution_instance_id = instanceId;
  }
  if (messageId) {
    metadata.last_message_id = messageId;
  }
  return metadata;
}

async function rehashSessionPinIfNeeded(sessionId: string, pin: string, session: any): Promise<void> {
  const verification = verifyPinAgainstSession(pin, session);
  if (!verification.valid || !verification.needsRehash) return;
  const migratedHash = hashWalletPin(pin);
  await supabase
    .from('agent_sessions')
    .update({
      password_hash: migratedHash,
      session_password_hash: migratedHash,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId);
}

async function createExternalMappingsWithAliases(payload: {
  provider: string;
  provider_user_id: string;
  session_id: string;
  user_id: string;
  data?: Record<string, unknown> | null;
}) {
  const normalizedProvider = normalizeExternalProvider(payload.provider);
  const normalizedProviderUserId = normalizeExternalProviderUserId(normalizedProvider, payload.provider_user_id);
  const providers = externalProviderAliases(normalizedProvider);
  const primaryProvider = providers.includes(normalizedProvider) ? normalizedProvider : providers[0];

  for (const provider of providers) {
    await externalRepo.createMapping({
      provider,
      provider_user_id: normalizedProviderUserId,
      session_id: payload.session_id,
      user_id: payload.user_id,
      data: externalAliasData(payload.data || undefined, provider === primaryProvider),
    });
  }
}

function externalAliasData(data: Record<string, unknown> | undefined, keepIdentityFields: boolean): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const clone = { ...data };
  if (keepIdentityFields) return clone;

  delete clone.email;
  delete clone.phone_number;
  delete clone.phoneNumber;
  delete clone.whatsapp_number;
  delete clone.whatsappNumber;
  delete clone.cpf;
  return clone;
}

type IdentityCollision = {
  field: 'email' | 'phone_number' | 'cpf';
  value: string;
  sessionId?: string;
  userId?: string;
};

type ExternalIdentityLock = {
  sessionId?: string;
  userId?: string;
  canonicalLogin?: string;
};

function normalizePhoneForCompare(value?: string): string {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeEmailForCompare(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function looksLikeEmail(value?: string): boolean {
  const normalized = normalizeEmailForCompare(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function normalizeLanguage(value: unknown): 'pt-BR' | 'en' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english')) return 'en';
  return 'pt-BR';
}

function isBrowserExternalProvider(provider: string): boolean {
  const normalized = normalizeExternalProvider(provider);
  return normalized === 'web' || normalized === 'browser';
}

function readEmailConfirmationCode(req: Request): string {
  return String(
    req.body?.email_confirmation_code ||
    req.body?.emailConfirmationCode ||
    req.body?.email_code ||
    req.body?.emailCode ||
    ''
  ).trim();
}

async function ensureEmailConfirmation(req: Request, res: Response, input: {
  email?: string | null;
  purpose: EmailConfirmationPurpose;
  language: 'pt-BR' | 'en';
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const email = normalizeEmailForCompare(input.email || '');
  if (!email) return true;
  const sessionId = String(input.metadata?.session_id || '').trim();
  const userId = normalizeEmailForCompare(String(input.metadata?.user_id || ''));

  const alreadyVerified = await EmailConfirmationService.isAccountEmailVerified({
    email,
    sessionId,
    userId,
  });
  if (alreadyVerified) return true;

  try {
    const confirmation = await EmailConfirmationService.requireVerified({
      email,
      purpose: input.purpose,
      code: readEmailConfirmationCode(req),
      language: input.language,
      metadata: input.metadata,
    });

    if (!confirmation.verified) {
      res.status(202).json({
        success: false,
        emailConfirmationRequired: true,
        email: confirmation.maskedEmail,
        expiresAt: confirmation.expiresAt,
        devCode: confirmation.devCode,
        message: confirmation.message,
      });
      return false;
    }

    await EmailConfirmationService.markAccountEmailVerified({
      email,
      sessionId,
      userId,
      source: input.purpose === 'login' ? 'email_confirmation_login' : 'email_confirmation_create_account',
    });
    return true;
  } catch (error: any) {
    if (error instanceof EmailConfirmationError) {
      const isServerError = error.statusCode >= 500;
      res.status(error.statusCode).json({
        success: false,
        ...(isServerError ? {} : {
          emailConfirmationRequired: true,
          email: EmailConfirmationService.maskEmail(email),
        }),
        message: error.message,
        error: error.code,
      });
      return false;
    }
    throw error;
  }
}

function resolveCanonicalSessionLogin(session: any): string {
  const sessionEmail = normalizeEmailForCompare(session?.email);
  if (sessionEmail) return sessionEmail;
  const sessionUserId = normalizeEmailForCompare(session?.user_id);
  return looksLikeEmail(sessionUserId) ? sessionUserId : '';
}

function getFinalizationSessionId(row: any): string {
  return String(row?.session_id || row?.result?.sessionId || row?.result?.session_id || '').trim();
}

function getFinalizationUserId(row: any): string {
  return normalizeEmailForCompare(String(row?.user_id || row?.result?.userId || row?.result?.user_id || ''));
}

function isCompletedFinalization(row: any): boolean {
  const status = String(row?.status || '').trim().toLowerCase();
  return Boolean(row?.used) || status === 'completed';
}

function selectCompletedFinalization(rows: any[]): any | null {
  return (rows || []).find((row) => {
    if (!isCompletedFinalization(row)) return false;
    return Boolean(getFinalizationSessionId(row) || getFinalizationUserId(row));
  }) || null;
}

async function resolveExternalIdentityLock(provider: string, providerUserId: string): Promise<ExternalIdentityLock | null> {
  const normalizedProvider = normalizeExternalProvider(provider);
  const normalizedProviderUserId = normalizeExternalProviderUserId(normalizedProvider, providerUserId);
  if (!normalizedProvider || !normalizedProviderUserId) return null;
  if (isBrowserExternalProvider(normalizedProvider)) return null;

  const mapped = await externalRepo.findByProviderAndId(normalizedProvider, normalizedProviderUserId);
  const mappedSessionId = String(mapped?.session_id || '').trim();
  const mappedUserId = normalizeEmailForCompare(String(mapped?.user_id || ''));

  if (mappedSessionId || mappedUserId) {
    let canonicalLogin = looksLikeEmail(mappedUserId) ? mappedUserId : '';
    if (mappedSessionId) {
      const linkedSession = await agentRepo.getSession(mappedSessionId);
      if (linkedSession) {
        canonicalLogin = resolveCanonicalSessionLogin(linkedSession) || canonicalLogin;
      }
    }
    return {
      sessionId: mappedSessionId || undefined,
      userId: mappedUserId || undefined,
      canonicalLogin: canonicalLogin || undefined,
    };
  }

  const { data, error } = await supabase
    .from('onboarding_finalizations')
    .select('session_id, user_id, used, status, result')
    .eq('provider', normalizedProvider)
    .eq('provider_user_id', normalizedProviderUserId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('onboarding_finalizations') || message.includes('schema cache') || message.includes('does not exist')) {
      return null;
    }
    throw error;
  }

  const completedFinalization = selectCompletedFinalization((data || []) as any[]);
  if (!completedFinalization) return null;

  const fallbackSessionId = getFinalizationSessionId(completedFinalization);
  const fallbackUserId = getFinalizationUserId(completedFinalization);
  let canonicalLogin = looksLikeEmail(fallbackUserId) ? fallbackUserId : '';
  if (fallbackSessionId) {
    const linkedSession = await agentRepo.getSession(fallbackSessionId);
    if (linkedSession) {
      canonicalLogin = resolveCanonicalSessionLogin(linkedSession) || canonicalLogin;
    }
  }

  if (!fallbackSessionId && !fallbackUserId && !canonicalLogin) return null;
  return {
    sessionId: fallbackSessionId || undefined,
    userId: fallbackUserId || undefined,
    canonicalLogin: canonicalLogin || undefined,
  };
}

function isUniqueViolation(error: any): boolean {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    message.includes('already exists')
  );
}

async function detectIdentityCollision(input: {
  email?: string;
  phoneNumber?: string;
  cpf?: string;
  allowedSessionIds?: string[];
  allowedUserIds?: string[];
}): Promise<IdentityCollision | null> {
  const normalizedEmail = normalizeEmailForCompare(input.email);
  const normalizedPhone = normalizePhoneForCompare(input.phoneNumber);
  const normalizedCpf = String(input.cpf || '').replace(/\D+/g, '');
  const allowedSessionIds = new Set((input.allowedSessionIds || []).map((value) => String(value || '').trim()).filter(Boolean));
  const allowedUserIds = new Set((input.allowedUserIds || []).map((value) => String(value || '').trim()).filter(Boolean));

  const isAllowed = (sessionId?: string, userId?: string) => {
    const sid = String(sessionId || '').trim();
    const uid = String(userId || '').trim();
    return (sid && allowedSessionIds.has(sid)) || (uid && allowedUserIds.has(uid));
  };

  if (normalizedEmail) {
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, email')
      .eq('email', normalizedEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const sessionId = String((data as any)?.session_id || '').trim();
    const userId = String((data as any)?.user_id || '').trim();
    if ((sessionId || userId) && !isAllowed(sessionId, userId)) {
      return { field: 'email', value: normalizedEmail, sessionId, userId };
    }
  }

  if (normalizedPhone) {
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, phone_number')
      .eq('phone_number', normalizedPhone)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const sessionId = String((data as any)?.session_id || '').trim();
    const userId = String((data as any)?.user_id || '').trim();
    if ((sessionId || userId) && !isAllowed(sessionId, userId)) {
      return { field: 'phone_number', value: normalizedPhone, sessionId, userId };
    }
  }

  if (normalizedCpf) {
    const { data, error } = await supabase
      .from('external_accounts')
      .select('session_id, user_id, data')
      .not('data', 'is', null)
      .order('id', { ascending: false })
      .limit(200);

    if (error) throw error;

    for (const row of data || []) {
      const rowCpf = String((row as any)?.data?.cpf || '').replace(/\D+/g, '');
      if (!rowCpf || rowCpf !== normalizedCpf) continue;
      const sessionId = String((row as any)?.session_id || '').trim();
      const userId = String((row as any)?.user_id || '').trim();
      if (!isAllowed(sessionId, userId)) {
        return { field: 'cpf', value: normalizedCpf, sessionId, userId };
      }
    }
  }

  return null;
}

function isValidStellarPublicKey(value?: string) {
  if (!value) return false;
  try {
    Keypair.fromPublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}

function pickContactTransferKey(contact?: any): string {
  if (!contact || typeof contact !== 'object') return '';
  const email = String(contact.email || contact.contact_profile?.email || '').trim().toLowerCase();
  const phone = String(contact.phone_number || contact.phone || contact.contact_profile?.phone_number || contact.contact_profile?.phone || '').replace(/\D+/g, '');
  const cpf = String(contact.cpf || contact.contact_profile?.cpf || '').replace(/\D+/g, '');
  const pixKey = String(contact.pix_key || contact.contact_profile?.pix_key || '').trim();
  const candidate = email || phone || cpf || pixKey;
  return isValidStellarPublicKey(candidate) ? '' : candidate;
}

function resolveAssetIssuer(assetCode: string, provided?: string): string | undefined {
  const asset = resolveConfiguredAsset(assetCode, provided);
  if (asset.code === 'XLM') return undefined;
  return asset.issuer || getAssetIssuer(asset.code, provided);
}

async function configureWalletAssetsAndContacts(input: {
  userId: string;
  publicKey: string;
  vaultSecretId?: string | null;
  sessionId?: string | null;
}) {
  if (input.vaultSecretId) {
    try {
      const secretKey = await vaultService.getSecret(String(input.vaultSecretId));
      await ContactSeedService.createDefaultTrustlines(input.publicKey, secretKey, input.userId, input.sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[external-finalize] default trustline setup failed for ${input.userId}: ${message}`);
    }
  }

  try {
    await ContactSeedService.ensureStarterContactsForUser(input.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[external-finalize] starter contact setup failed for ${input.userId}: ${message}`);
  }

  try {
    await GlobalProfileService.ensureForUser({
      userId: input.userId,
      displayName: input.userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[external-finalize] global profile setup failed for ${input.userId}: ${message}`);
  }
}

async function ensureOnboardingAccountReady(input: {
  userId: string;
  publicKey: string;
}) {
  try {
    await StellarService.ensureTestnetAccountFunded(input.publicKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[external-finalize] testnet funding still pending for ${input.userId}: ${message}`);
  }
}

function runPostOnboardingTasks(input: {
  userId: string;
  publicKey: string;
  vaultSecretId?: string | null;
  sessionId?: string | null;
  walletName?: string | null;
  pixKey?: string | null;
  provider?: string | null;
  providerUserId?: string | null;
  name?: string | null;
  language?: string;
}) {
  void (async () => {
    await ensureOnboardingAccountReady({
      userId: input.userId,
      publicKey: input.publicKey,
    });

    await configureWalletAssetsAndContacts({
      userId: input.userId,
      publicKey: input.publicKey,
      vaultSecretId: input.vaultSecretId,
      sessionId: input.sessionId,
    });

    if (input.sessionId) {
      try {
        const freshAccount = await StellarService.loadAccount(input.publicKey);
        await walletRepo.saveWallet({
          session_id: input.sessionId,
          public_key: input.publicKey,
          vault_secret_id: input.vaultSecretId || null,
          name: input.walletName || `Wallet for ${input.userId}`,
          pix_key: input.pixKey || undefined,
          balance: freshAccount.balances,
          sequence: freshAccount.sequence,
          account_data: freshAccount,
        } as any);
      } catch (walletSyncError) {
        logger.warn(`[external-finalize] wallet sync after onboarding failed for ${input.userId}: ${walletSyncError instanceof Error ? walletSyncError.message : String(walletSyncError)}`);
      }
    }

    try {
      await TransferNotificationService.notifySessionWelcome({
        sessionId: input.sessionId || '',
        userId: input.userId,
        name: input.name || null,
        provider: input.provider || undefined,
        providerUserId: input.providerUserId || undefined,
        language: input.language,
      });
    } catch (welcomeError) {
      logger.warn(`[external-finalize] welcome notification failed for ${input.userId}: ${welcomeError instanceof Error ? welcomeError.message : String(welcomeError)}`);
    }
  })().catch((error) => {
    logger.warn(`[external-finalize] post-onboarding tasks failed for ${input.userId}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function clearAgentLoginState(sessionId: string) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return;

  const { error } = await supabase
    .from('agent_states')
    .update({
      action_params: {
        force_logged_out: false,
        waiting_for_wallet_input: false,
        pending_payment: null,
        pending_conversion: null,
      },
      pending_payment: null,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', normalizedSessionId);

  if (error) {
    logger.warn(`[external-finalize] failed to clear login state for ${normalizedSessionId}: ${error.message || JSON.stringify(error)}`);
  }
}

async function upsertRecentContactFromPayment(input: {
  ownerId: string;
  sourcePublicKey: string;
  destinationPublicKey: string;
  destinationName?: string;
  destinationContact?: any;
  destinationKey?: string | null;
}) {
  const ownerId = String(input.ownerId || '').trim();
  const destinationPublicKey = String(input.destinationPublicKey || '').trim();
  const sourcePublicKey = String(input.sourcePublicKey || '').trim();
  if (!ownerId || !destinationPublicKey || !isValidStellarPublicKey(destinationPublicKey)) return;
  if (sourcePublicKey && destinationPublicKey === sourcePublicKey) return;

  const explicitNameRaw = String(input.destinationContact?.contact_name || input.destinationName || '').trim();
  const explicitName = isValidStellarPublicKey(explicitNameRaw) ? '' : explicitNameRaw;
  const contactName = explicitName || `Contato ${destinationPublicKey.slice(0, 6)}`;
  const explicitKey = String(input.destinationContact?.pix_key || input.destinationKey || '').trim().toLowerCase();
  const pixKey = explicitKey && !isValidStellarPublicKey(explicitKey) ? explicitKey : null;

  const { data: existingContact, error: existingContactError } = await supabase
    .from('contacts')
    .select('id, contact_name, pix_key')
    .eq('owner_id', ownerId)
    .eq('stellar_public_key', destinationPublicKey)
    .limit(1)
    .maybeSingle();

  if (existingContactError) {
    logger.warn(`[external-finalize] contact lookup failed for owner=${ownerId}: ${existingContactError.message}`);
    return;
  }

  if (existingContact?.id) {
    const nextName = String(existingContact.contact_name || '').trim() || contactName;
    const nextPixKey = String(existingContact.pix_key || '').trim() || pixKey;
    const shouldUpdate =
      nextName !== String(existingContact.contact_name || '').trim() ||
      String(nextPixKey || '') !== String(existingContact.pix_key || '').trim();

    if (shouldUpdate) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          contact_name: nextName,
          pix_key: nextPixKey,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingContact.id);

      if (updateError) {
        logger.warn(`[external-finalize] contact update failed for owner=${ownerId}: ${updateError.message}`);
      }
    }
    return;
  }

  const { error: insertError } = await supabase
    .from('contacts')
    .insert({
      owner_id: ownerId,
      contact_name: contactName,
      stellar_public_key: destinationPublicKey,
      pix_key: pixKey,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (insertError) {
    logger.warn(`[external-finalize] contact insert failed for owner=${ownerId}: ${insertError.message}`);
  }
}

async function sendTelegramPaymentNotification(input: {
  sessionId: string;
  userId: string;
  provider?: string | null;
  providerUserId?: string | null;
  amount: string;
  assetCode: string;
  sourceAmount?: string;
  sourceAssetCode?: string;
  feeXlm?: string;
  destinationName?: string;
  destinationKey?: string;
  destination: string;
  hash?: string;
  quote?: any;
  settlementMs?: number;
  savings?: any;
  contextMessage?: string | null;
}): Promise<string> {
  const destinationLabel = input.destinationName || input.destination;
  const readableDestination = destinationLabel && /^G[A-Z2-7]{55}$/i.test(destinationLabel)
    ? 'destinatário'
    : destinationLabel;

  try {
    const feeDisplay = input.feeXlm ? await formatNetworkFeeForCustomer(input.feeXlm) : null;
    const amountLabel = formatCustomerAssetAmount(input.amount, input.assetCode);
    const sourceLabel = input.sourceAmount && input.sourceAssetCode && input.sourceAssetCode !== input.assetCode
      ? formatCustomerAssetAmount(input.sourceAmount, input.sourceAssetCode)
      : '';
    const externalDeliveryText = [
      'Pagamento concluido.',
      sourceLabel ? `Origem: ${sourceLabel}` : '',
      `Valor: ${amountLabel}`,
      `Destino: ${readableDestination || 'destinatario'}`,
    ].filter(Boolean).join('\n');

    return await PaymentReceiptService.sendReceipt({
      type: 'payment_sent',
      sessionId: input.sessionId,
      userId: input.userId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      counterpartyLabel: readableDestination || 'destinatário',
      counterpartyKey: input.destinationKey || null,
      sourceAmount: input.sourceAmount || input.amount,
      sourceAssetCode: input.sourceAssetCode || input.assetCode,
      destinationAmount: input.amount,
      destinationAssetCode: input.assetCode,
      feeXlm: input.feeXlm,
      feeDisplay: feeDisplay?.display || null,
      feeBrl: feeDisplay?.fee_brl || null,
      feeUsdc: feeDisplay?.fee_usdc || null,
      hash: input.hash,
      quote: input.quote,
      savings: input.savings,
      settlementMs: input.settlementMs,
      contextMessage: input.contextMessage || null,
      externalDeliveryText,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[receipt] failed to send payment receipt: ${message}`);
    return '';
  }
}

async function sendTelegramConversionNotification(input: {
  sessionId: string;
  userId: string;
  provider?: string | null;
  providerUserId?: string | null;
  sourceAmount: string;
  sourceAssetCode: string;
  destinationAmount: string;
  destinationAssetCode: string;
  feeXlm?: string;
  hash?: string;
  quote?: any;
  settlementMs?: number;
  savings?: any;
}): Promise<string> {
  try {
    const feeDisplay = input.feeXlm ? await formatNetworkFeeForCustomer(input.feeXlm) : null;
    const externalDeliveryText = [
      'Conversao concluida.',
      `De: ${formatCustomerAssetAmount(input.sourceAmount, input.sourceAssetCode)}`,
      `Para: ${formatCustomerAssetAmount(input.destinationAmount, input.destinationAssetCode)}`,
    ].filter(Boolean).join('\n');

    return await PaymentReceiptService.sendReceipt({
      type: 'conversion',
      sessionId: input.sessionId,
      userId: input.userId,
      provider: input.provider,
      providerUserId: input.providerUserId,
      sourceAmount: input.sourceAmount,
      sourceAssetCode: input.sourceAssetCode,
      destinationAmount: input.destinationAmount,
      destinationAssetCode: input.destinationAssetCode,
      feeXlm: input.feeXlm,
      feeDisplay: feeDisplay?.display || null,
      feeBrl: feeDisplay?.fee_brl || null,
      feeUsdc: feeDisplay?.fee_usdc || null,
      hash: input.hash,
      quote: input.quote,
      savings: input.savings,
      settlementMs: input.settlementMs,
      externalDeliveryText,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[receipt] failed to send conversion receipt: ${message}`);
    return '';
  }
}

async function ensureDestinationCanReceiveAsset(input: {
  destination: string;
  destinationWallet: any;
  assetCode: string;
  assetIssuer?: string;
  userId: string;
}) {
  if (input.assetCode === 'XLM') return;
  if (!input.assetIssuer) {
    throw new Error(`${input.assetCode}_ISSUER não está configurado no backend.`);
  }

  const balances = await StellarService.getAccountBalance(input.destination);
  const hasTrustline = balances.some((balance: any) =>
    String(balance.asset_code || '').toUpperCase() === input.assetCode &&
    String(balance.asset_issuer || '') === input.assetIssuer
  );

  if (hasTrustline) return;

  if (!input.destinationWallet?.vault_secret_id) {
    throw new Error(`O destinatário ainda não pode receber ${input.assetCode}. Ele precisa ativar recebimento em ${input.assetCode} antes dessa transferência.`);
  }

  const destinationSecret = await vaultService.getSecret(String(input.destinationWallet.vault_secret_id));
  const trustlineXdr = await StellarService.buildTrustlineXdr({
    sourcePublicKey: input.destination,
    assetCode: input.assetCode,
    assetIssuer: input.assetIssuer,
  });
  const trustlineResult = await StellarService.signAndSubmitXdr(
    input.userId,
    destinationSecret,
    trustlineXdr,
    {
      user_id: input.userId,
      type: 'TRUSTLINE',
      asset_code: input.assetCode,
      source_public_key: input.destination,
      context: `Auto trustline before incoming ${input.assetCode} payment`,
    }
  );

  if (!trustlineResult.success) {
    throw new Error(`Não consegui ativar recebimento em ${input.assetCode} para o destinatário: ${trustlineResult.error || 'erro desconhecido'}`);
  }
}

function recipientAssetNotReadyMessage(input: {
  rawError?: unknown;
  assetCode: string;
  destinationName?: string;
}) {
  const assetCode = String(input.assetCode || 'ativo').trim().toUpperCase();
  const destinationName = String(input.destinationName || '').trim();
  const recipient = destinationName && !isValidStellarPublicKey(destinationName)
    ? destinationName
    : 'O destinatário';
  return `${recipient} ainda não pode receber ${assetCode}. Peça para a pessoa entrar na conta TalkToStellar e ativar esse ativo; depois gere um novo link de pagamento.`;
}

function paymentSubmissionFailedMessage(input: {
  rawError?: unknown;
  assetCode: string;
  amount: string;
  destinationName?: string;
}) {
  const raw = input.rawError instanceof Error
    ? input.rawError.message
    : String(input.rawError || '').trim();
  if (raw) return raw;
  const destinationName = String(input.destinationName || '').trim();
  const destination = destinationName && !isValidStellarPublicKey(destinationName)
    ? ` para ${destinationName}`
    : '';
  return `Falha ao enviar a transação Stellar${destination}. Nenhum valor saiu da conta. Gere uma nova confirmação e tente novamente.`;
}

async function hashPaymentToken(token: string): Promise<string> {
  return crypto.createHash('sha256').update(token).digest('hex');
}

type PaymentTokenReservation =
  | { ok: true; row: any }
  | { ok: false; status: number; body: Record<string, any> };

type OnboardingReservation =
  | { ok: true; row: any }
  | { ok: false; status: number; body: Record<string, any> };

function getOnboardingProcessingTtlSeconds(): number {
  const parsed = Number(String(process.env.ONBOARDING_PROCESSING_TTL_SECONDS || '180').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 180;
  return Math.trunc(parsed);
}

function isOnboardingProcessingStale(row: any): boolean {
  const ttlMs = getOnboardingProcessingTtlSeconds() * 1000;
  const lockAtRaw = String(row?.updated_at || row?.created_at || '').trim();
  const lockAtMs = Date.parse(lockAtRaw);
  if (!Number.isFinite(lockAtMs)) return false;
  return Date.now() - lockAtMs > ttlMs;
}

async function reservePaymentTokenForExecution(tokenHash: string): Promise<PaymentTokenReservation> {
  try {
    const { data: existing, error: selectError } = await supabase
      .from('payment_confirmations')
      .select('id, used, used_at, status')
      .eq('token_hash', tokenHash)
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;
    if (!existing) {
      return { ok: false, status: 404, body: { success: false, error: 'Link de pagamento inválido' } };
    }
    if (existing.used) {
      return {
        ok: false,
        status: 409,
        body: { success: false, error: 'Este link já foi utilizado', used_at: existing.used_at || null },
      };
    }
    if (String(existing.status || '').toLowerCase() === 'processing') {
      return {
        ok: false,
        status: 409,
        body: { success: false, error: 'Este link já está em processamento' },
      };
    }

    const { data: reserved, error: reserveError } = await supabase
      .from('payment_confirmations')
      .update({ status: 'processing' })
      .eq('token_hash', tokenHash)
      .eq('used', false)
      .in('status', ['pending', 'failed'])
      .select('id, used, used_at, status')
      .limit(1)
      .maybeSingle();

    if (reserveError) throw reserveError;
    if (!reserved) {
      const { data: latest } = await supabase
        .from('payment_confirmations')
        .select('used, used_at, status')
        .eq('token_hash', tokenHash)
        .limit(1)
        .maybeSingle();
      return {
        ok: false,
        status: 409,
        body: latest?.used
          ? { success: false, error: 'Este link já foi utilizado', used_at: latest.used_at || null }
          : { success: false, error: 'Este link já está em processamento' },
      };
    }

    return { ok: true, row: reserved };
  } catch (err: any) {
    logger.warn(`[payment-idempotency] error reserving token: ${err?.message || String(err)}`);
    throw err;
  }
}

async function findOnboardingFinalization(tokenHash: string, provider: string, providerUserId: string): Promise<any | null> {
  const byToken = await supabase
    .from('onboarding_finalizations')
    .select('*')
    .eq('token_hash', tokenHash)
    .limit(1)
    .maybeSingle();

  if (byToken.error) throw byToken.error;
  if (byToken.data) return byToken.data;

  const byProvider = await supabase
    .from('onboarding_finalizations')
    .select('*')
    .eq('provider', provider)
    .eq('provider_user_id', providerUserId)
    .limit(1)
    .maybeSingle();

  if (byProvider.error) throw byProvider.error;
  return byProvider.data || null;
}

async function reserveOnboardingFinalization(input: {
  tokenHash: string;
  provider: string;
  providerUserId: string;
  data?: any;
}): Promise<OnboardingReservation> {
  const now = new Date().toISOString();
  const insert = await supabase
    .from('onboarding_finalizations')
    .insert({
      token_hash: input.tokenHash,
      provider: input.provider,
      provider_user_id: input.providerUserId,
      status: 'processing',
      used: false,
      used_at: null,
      data: input.data || null,
      created_at: now,
      updated_at: now,
    })
    .select('*')
    .single();

  if (!insert.error) return { ok: true, row: insert.data };
  if (String((insert.error as any)?.code || '') !== '23505') throw insert.error;

  const existing = await findOnboardingFinalization(input.tokenHash, input.provider, input.providerUserId);
  if (!existing) {
    return {
      ok: false,
      status: 409,
      body: { success: false, message: 'Este link de criação já está em processamento.' },
    };
  }

  const existingTokenHash = String(existing.token_hash || '').trim();
  const existingCompleted = String(existing.status || '').toLowerCase() === 'completed' || Boolean(existing.used);
  if (existingCompleted && existingTokenHash && existingTokenHash !== input.tokenHash) {
    const recycle = await supabase
      .from('onboarding_finalizations')
      .update({
        token_hash: input.tokenHash,
        status: 'processing',
        used: false,
        used_at: null,
        data: input.data || null,
        error: null,
        result: null,
        response_status: null,
        session_id: null,
        user_id: null,
        updated_at: now,
      })
      .eq('id', existing.id)
      .eq('token_hash', existingTokenHash)
      .select('*')
      .single();

    if (recycle.error) throw recycle.error;
    return { ok: true, row: recycle.data };
  }

  if (existingCompleted) {
    return {
      ok: false,
      status: 409,
      body: {
        success: false,
        used: true,
        alreadyCompleted: true,
        message: 'Este link já foi utilizado.',
      },
    };
  }

  if (String(existing.status || '').toLowerCase() === 'processing') {
    if (isOnboardingProcessingStale(existing)) {
      const staleErrorMessage = 'Processamento anterior interrompido. Link liberado para nova tentativa.';
      const release = await supabase
        .from('onboarding_finalizations')
        .update({
          status: 'failed',
          used: false,
          used_at: null,
          error: staleErrorMessage,
          updated_at: now,
        })
        .eq('id', existing.id)
        .eq('status', 'processing')
        .eq('updated_at', existing.updated_at || null)
        .select('id')
        .limit(1)
        .maybeSingle();

      if (release.error) throw release.error;
      if (release.data) {
        return reserveOnboardingFinalization(input);
      }
    }

    return {
      ok: false,
      status: 409,
      body: { success: false, message: 'Este link de criação já está em processamento.' },
    };
  }

  const retry = await supabase
    .from('onboarding_finalizations')
    .update({
      token_hash: input.tokenHash,
      status: 'processing',
      used: false,
      used_at: null,
      data: input.data || existing.data || null,
      error: null,
      updated_at: now,
    })
    .eq('id', existing.id)
    .eq('status', 'failed')
    .select('*')
    .single();

  if (retry.error) throw retry.error;
  return { ok: true, row: retry.data };
}

async function completeOnboardingFinalization(tokenHash: string, result: Record<string, any>, statusCode: number) {
  const { error } = await supabase
    .from('onboarding_finalizations')
    .update({
      status: 'completed',
      used: true,
      used_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      response_status: statusCode,
      result,
      session_id: result.sessionId || null,
      user_id: result.userId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('token_hash', tokenHash)
    .eq('status', 'processing');

  if (error) {
    logger.warn(`[onboarding-idempotency] could not complete finalization: ${error.message}`);
  }
}

async function failOnboardingFinalization(tokenHash: string, errorMessage: string) {
  const { error } = await supabase
    .from('onboarding_finalizations')
    .update({
      status: 'failed',
      used: false,
      used_at: null,
      error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('token_hash', tokenHash)
    .eq('status', 'processing');

  if (error) {
    logger.warn(`[onboarding-idempotency] could not mark finalization failed: ${error.message}`);
  }
}

async function claimPaymentToken(
  tokenHash: string,
  sessionId: string,
  userId: string,
  destination: string,
  amount: string,
  assetCode: string,
  details?: any
): Promise<boolean> {
  try {
    const operationFingerprint = buildOperationFingerprint({
      sourceSessionId: sessionId,
      sourceUserId: userId,
      destination,
      amount,
      assetCode,
      tokenHash,
      operationType: String(details?.type || details?.operationType || 'PAYMENT_CONFIRMATION'),
    });
    const { data, error } = await supabase
      .from('payment_confirmations')
      .update({
        session_id: sessionId,
        user_id: userId,
        destination,
        amount,
        asset_code: assetCode,
        status: 'processing',
        completed_at: null,
        operation_fingerprint: operationFingerprint,
        details,
      })
      .eq('token_hash', tokenHash)
      .eq('used', false)
      .eq('status', 'processing')
      .select('id')
      .limit(1);

    if (error) {
      logger.warn(`[payment-idempotency] error claiming token: ${error?.message || String(error)}`);
      return false;
    }
    if (Array.isArray(data) && data.length > 0) return true;

    const { error: insertError } = await supabase
      .from('payment_confirmations')
      .insert({
        token_hash: tokenHash,
        session_id: sessionId,
        user_id: userId,
        destination,
        amount,
        asset_code: assetCode,
        status: 'processing',
        completed_at: null,
        used: false,
        used_at: null,
        operation_fingerprint: operationFingerprint,
        details,
      });

    if (insertError) {
      if (String(insertError.code || '') === '23505') return false;
      logger.warn(`[payment-idempotency] error inserting token claim: ${insertError?.message || String(insertError)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    logger.warn(`[payment-idempotency] error in claimPaymentToken: ${err?.message || String(err)}`);
    return false;
  }
}

async function updatePaymentTokenStatus(
  tokenHash: string,
  paymentHash: string | undefined,
  status: 'completed' | 'failed',
  details?: any
): Promise<boolean> {
  try {
    const nextDetails = {
      ...(details || {}),
      used: status === 'completed',
    };
    const { data, error } = await supabase
      .from('payment_confirmations')
      .update({
        payment_hash: paymentHash,
        status,
        completed_at: new Date().toISOString(),
        used: status === 'completed' ? true : false,
        used_at: status === 'completed' ? new Date().toISOString() : null,
        details: nextDetails,
      })
      .eq('token_hash', tokenHash)
      .eq('used', false)
      .select('id');

    if (error) {
      logger.warn(`[payment-idempotency] error updating token status: ${error?.message || String(error)}`);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err: any) {
    logger.warn(`[payment-idempotency] error in updatePaymentTokenStatus: ${err?.message || String(err)}`);
    return false;
  }
}

async function logPaymentDetails(
  sessionId: string,
  userId: string,
  sourcePublicKey: string,
  destinationPublicKey: string,
  sourceAmount: string,
  sourceAssetCode: string,
  sourceAssetIssuer: string | undefined,
  destinationAmount: string,
  destinationAssetCode: string,
  destinationAssetIssuer: string | undefined,
  feeXlm: string,
  paymentHash: string | undefined,
  operationType: string,
  status: 'pending' | 'success' | 'failed',
  errorMessage?: string,
  routePath?: any,
  metadata?: any
): Promise<void> {
  try {
    const operationFingerprint = buildOperationFingerprint({
      sourceSessionId: sessionId,
      sourceUserId: userId,
      destination: destinationPublicKey,
      amount: destinationAmount,
      assetCode: destinationAssetCode,
      tokenHash: metadata?.token_hash,
      operationType,
      quoteId: metadata?.quote?.quote_issued_at || metadata?.quote?.quote_expires_at,
      invoiceId: metadata?.invoice_id,
    });
    const { error } = await supabase
      .from('payment_logs')
      .upsert({
        session_id: sessionId,
        user_id: userId,
        source_public_key: sourcePublicKey,
        destination_public_key: destinationPublicKey,
        source_amount: sourceAmount,
        source_asset_code: sourceAssetCode,
        source_asset_issuer: sourceAssetIssuer,
        destination_amount: destinationAmount,
        destination_asset_code: destinationAssetCode,
        destination_asset_issuer: destinationAssetIssuer,
        fee_xlm: feeXlm,
        fee_brl: metadata?.transferDetails?.feeBrl ?? metadata?.fee_brl ?? metadata?.actual_fee_brl ?? metadata?.savings?.actual_fee ?? null,
        fee_usdc: metadata?.transferDetails?.feeUsdc ?? metadata?.fee_usdc ?? null,
        payment_hash: paymentHash,
        operation_fingerprint: operationFingerprint,
        operation_type: operationType,
        status,
        error_message: errorMessage,
        memo: metadata?.transaction_nickname || metadata?.memo || null,
        route_path: routePath,
        metadata,
        actual_fee: metadata?.savings?.actual_fee ?? metadata?.actual_fee_brl ?? null,
        estimated_savings: metadata?.savings?.estimated_savings ?? null,
        savings_percentage: metadata?.savings?.savings_percentage ?? null,
        comparison_method: metadata?.savings?.comparison_method ?? metadata?.comparison_method ?? null,
        created_at: new Date().toISOString(),
        completed_at: status === 'success' ? new Date().toISOString() : null,
      }, { onConflict: 'operation_fingerprint' });

    if (error) {
      logger.warn(`[payment-logging] error logging payment details: ${error?.message || String(error)}`);
    } else {
      logger.info(`[payment-logging] Payment logged: ${paymentHash || 'pending'} - ${status}`);
    }
  } catch (err: any) {
    logger.error(`[payment-logging] error in logPaymentDetails: ${err?.message || String(err)}`);
  }
}

export default class ExternalFinalizeController {
  // POST /api/external/finalize
  // body: { token, name?, email? }
  static async finalize(req: Request, res: Response) {
    let onboardingReservationTokenHash: string | null = null;
    const requestId = requestIdFromReq(req);
    try {
      const { token, name, email, pin } = req.body;
      const rawPhoneNumber = String(req.body?.phone_number || req.body?.phoneNumber || '').trim();
      const rawCpf = String(req.body?.cpf || '').trim();
      let normalizedPhoneNumber = rawPhoneNumber ? rawPhoneNumber.replace(/\D+/g, '') : '';
      const normalizedCpf = rawCpf ? rawCpf.replace(/\D+/g, '') : '';
      const browserId = String(req.body?.browser_id || '').trim();
      // Accept public_key coming from POST body or URL query (confirm link may include it)
      const publicKeyFromBody = String(req.body?.public_key || req.query?.public_key || '').trim() || undefined;
      if (!token) return res.status(400).json({ success: false, error: 'Token é obrigatório', message: 'Token é obrigatório' });

      let payload: any;
      try {
        payload = jwt.verify(token, getJwtSecret());
      } catch (err: any) {
        if (String(err?.name || '') === 'TokenExpiredError') {
          return res.status(410).json({
            success: false,
            expired: true,
            expired_at: err?.expiredAt ? new Date(err.expiredAt).toISOString() : null,
            error: 'Este link expirou. Solicite um novo link.',
            message: 'Este link expirou. Solicite um novo link.',
          });
        }
        return res.status(400).json({ success: false, error: 'Link inválido ou expirado', message: 'Link inválido ou expirado' });
      }

      const tokenHash = await hashPaymentToken(token);
      const tokenSub = String((payload as any)?.sub || '');

      if (
        ['external_payment_confirm', 'external_conversion_confirm'].includes(tokenSub) &&
        getQuoteExpiry(payload) &&
        isQuoteExpired(payload)
      ) {
        return res.status(400).json({
          success: false,
          expiredQuote: true,
          message: quoteExpiryMessage(),
        });
      }

      if (tokenSub === 'external_conversion_confirm') {
        const {
          session_id,
          owner_id,
          source_amount,
          source_asset_code,
          source_asset_issuer,
          dest_amount,
          dest_asset_code,
          dest_asset_issuer,
          quote: tokenQuote,
        } = payload as any;

        if (!session_id || !dest_amount || !source_asset_code || !dest_asset_code) {
          return res.status(400).json({ success: false, message: 'token missing conversion data' });
        }

        const sourceAsset = resolveConfiguredAsset(source_asset_code, source_asset_issuer);
        const destAsset = resolveConfiguredAsset(dest_asset_code, dest_asset_issuer);
        const sourceAssetCode = sourceAsset.code;
        const destAssetCode = destAsset.code;
        const sourceAssetIssuer = sourceAsset.issuer;
        const destAssetIssuer = destAsset.issuer;

        if (sourceAssetCode !== 'XLM' && !sourceAssetIssuer) {
          return res.status(400).json({
            success: false,
            message: publicErrorMessage(`${sourceAssetCode}_ISSUER não está configurado no backend.`, 'Não consegui preparar essa conversão agora. Tente novamente em alguns segundos.'),
          });
        }
        if (destAssetCode !== 'XLM' && !destAssetIssuer) {
          return res.status(400).json({
            success: false,
            message: publicErrorMessage(`${destAssetCode}_ISSUER não está configurado no backend.`, 'Não consegui preparar essa conversão agora. Tente novamente em alguns segundos.'),
          });
        }

        const wallet = await walletRepo.getWalletBySession(String(session_id));
        if (!wallet?.public_key || !wallet?.vault_secret_id) {
          return res.status(400).json({ success: false, message: 'wallet not found for conversion confirmation' });
        }

        const session = await agentRepo.getSession(String(session_id));
        if (!session?.user_id) {
          return res.status(400).json({ success: false, message: 'session not found for conversion confirmation' });
        }
        if (isSessionExpired(session)) {
          await agentRepo.clearSession(String(session_id));
          return res.status(401).json({
            success: false,
            message: 'Sua sessão expirou. Entre novamente antes de confirmar a conversão.',
          });
        }

        const providedPin = String(req.body?.pin || '').trim();
        if (!providedPin) {
          return res.status(400).json({
            success: false,
            message: 'PIN é obrigatório para confirmar a conversão.',
          });
        }

        if (!verifyPinAgainstSession(providedPin, session).valid) {
          return res.status(401).json({
            success: false,
            message: 'PIN inválido. Tente novamente.',
          });
        }
        await rehashSessionPinIfNeeded(String(session_id), providedPin, session).catch((error) => {
          logger.warn(`[external-finalize] could not migrate PIN hash for ${session_id}: ${error instanceof Error ? error.message : String(error)}`);
        });

        await ensureDestinationCanReceiveAsset({
          destination: wallet.public_key,
          destinationWallet: wallet,
          assetCode: destAssetCode,
          assetIssuer: destAssetIssuer,
          userId: String(session.user_id),
        });

        const usesStrictSend = Boolean(String(source_amount || '').trim());
        let quote: any = null;
        let unsignedXdr = '';
        try {
          logger.info(`[external-finalize] event=conversion_prepare_start ${JSON.stringify({
            request_id: requestId || undefined,
            token_hash: maskLogValue(tokenHash, 10, 6),
            session_id: maskLogValue(session_id),
            source_asset_code: sourceAssetCode,
            dest_asset_code: destAssetCode,
            source_amount: String(source_amount || ''),
            dest_amount: String(dest_amount || ''),
            mode: usesStrictSend ? 'strict_send' : 'strict_receive',
          })}`);

          quote = usesStrictSend
            ? await StellarService.quoteStrictSendConversion({
                sourcePublicKey: wallet.public_key,
                destination: wallet.public_key,
                sourceAmount: String(source_amount).trim(),
                sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
                destAsset: { code: destAssetCode, issuer: destAssetIssuer },
              })
            : await StellarService.quotePathPayment({
                sourcePublicKey: wallet.public_key,
                destination: wallet.public_key,
                destAmount: String(dest_amount).trim(),
                sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
                destAsset: { code: destAssetCode, issuer: destAssetIssuer },
              });

          unsignedXdr = usesStrictSend
            ? await StellarService.buildStrictSendConversionXdr({
                sourcePublicKey: wallet.public_key,
                destination: wallet.public_key,
                sourceAmount: String(source_amount).trim(),
                sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
                destAsset: { code: destAssetCode, issuer: destAssetIssuer },
                quote,
              })
            : await StellarService.buildPathPaymentXdr({
                sourcePublicKey: wallet.public_key,
                destination: wallet.public_key,
                destAmount: String(dest_amount).trim(),
                sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
                destAsset: { code: destAssetCode, issuer: destAssetIssuer },
              });

          logger.info(`[external-finalize] event=conversion_prepare_success ${JSON.stringify({
            request_id: requestId || undefined,
            token_hash: maskLogValue(tokenHash, 10, 6),
            session_id: maskLogValue(session_id),
            source_asset_code: quote?.sourceAsset?.code || sourceAssetCode,
            dest_asset_code: quote?.destinationAsset?.code || destAssetCode,
            source_amount: quote?.sourceAmount,
            destination_amount: quote?.destinationAmount,
            mode: usesStrictSend ? 'strict_send' : 'strict_receive',
          })}`);
        } catch (error: any) {
          logger.warn(`[external-finalize] event=conversion_prepare_failed ${JSON.stringify({
            request_id: requestId || undefined,
            token_hash: maskLogValue(tokenHash, 10, 6),
            session_id: maskLogValue(session_id),
            source_asset_code: sourceAssetCode,
            dest_asset_code: destAssetCode,
            source_amount: String(source_amount || ''),
            dest_amount: String(dest_amount || ''),
            mode: usesStrictSend ? 'strict_send' : 'strict_receive',
            code: publicErrorCode(error),
            error: error?.message || String(error),
          })}`);
          return res.status(400).json({
            ...publicErrorPayload(error, {
              includeSupportCode: true,
              fallback: 'Não consegui preparar essa conversão agora. Gere uma nova confirmação e tente novamente.',
            }),
            ...(requestId ? { request_id: requestId } : {}),
          });
        }

        const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));
        const reservation = await reservePaymentTokenForExecution(tokenHash);
        if (!reservation.ok) {
          logger.warn(`[external-finalize] conversion confirmation token unavailable: ${tokenHash.substring(0, 16)}...`);
          return res.status(reservation.status).json(reservation.body);
        }

        const tokenClaimed = await claimPaymentToken(
          tokenHash,
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          String(dest_amount),
          destAssetCode,
          {
            type: 'conversion',
            owner_id: owner_id || String(session.user_id),
            source_asset_code: sourceAssetCode,
            source_asset_issuer: sourceAssetIssuer || null,
            source_amount: String(source_amount || ''),
            dest_asset_code: destAssetCode,
            dest_asset_issuer: destAssetIssuer || null,
            dest_amount: String(dest_amount),
            token_quote: tokenQuote || null,
            quote,
            browser_id: browserId || null,
          }
        );

        if (!tokenClaimed) {
          await updatePaymentTokenStatus(tokenHash, undefined, 'failed', {
            type: 'conversion',
            error: 'Could not reserve conversion token details',
          });
          return res.status(409).json({
            success: false,
            message: 'Este link de confirmação já foi utilizado. Solicite uma nova confirmação.',
          });
        }

        await logPaymentDetails(
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          wallet.public_key,
          String(quote.sourceAmount),
          String(quote.sourceAsset.code),
          quote.sourceAsset.code === 'XLM' ? undefined : quote.sourceAsset.issuer,
          String(quote.destinationAmount),
          String(quote.destinationAsset.code),
          quote.destinationAsset.code === 'XLM' ? undefined : quote.destinationAsset.issuer,
          String(quote.networkFeeXlm || DEFAULT_NETWORK_FEE_XLM),
          undefined,
          usesStrictSend ? 'CONVERSION_STRICT_SEND' : 'CONVERSION_STRICT_RECEIVE',
          'pending',
          undefined,
          quote.path,
          {
            token_hash: tokenHash,
            token_quote: tokenQuote || null,
            quote,
          }
        );

        const operationType = usesStrictSend ? 'PATH_PAYMENT_STRICT_SEND' : 'PATH_PAYMENT_STRICT_RECEIVE';
        const submitStartedAt = Date.now();
        const result = await StellarService.signAndSubmitXdr(
          String(session.user_id),
          secretKey,
          unsignedXdr,
          {
            user_id: String(session.user_id),
            type: operationType,
            destination_key: wallet.public_key,
            asset_code: destAssetCode,
            amount: Number(quote.destinationAmount),
            context:
              `Conversão interna confirmada: ${quote.sourceAmount} ${quote.sourceAsset.code} ` +
              `para ${quote.destinationAmount} ${quote.destinationAsset.code}.`,
            source_public_key: wallet.public_key,
            source_session_id: wallet.session_id,
            destination_session_id: wallet.session_id,
          }
        );

        if (!result.success) {
          logger.warn(`[external-finalize] event=conversion_submit_failed ${JSON.stringify({
            request_id: requestId || undefined,
            token_hash: maskLogValue(tokenHash, 10, 6),
            session_id: maskLogValue(session_id),
            source_asset_code: quote?.sourceAsset?.code || sourceAssetCode,
            dest_asset_code: quote?.destinationAsset?.code || destAssetCode,
            source_amount: quote?.sourceAmount,
            destination_amount: quote?.destinationAmount,
            code: publicErrorCode(result.error || 'Could not submit conversion'),
            error: result.error || 'Could not submit conversion',
          })}`);
          await updatePaymentTokenStatus(
            tokenHash,
            undefined,
            'failed',
            {
              type: 'conversion',
              quote,
              error: result.error || 'Could not submit conversion',
            }
          );

          await logPaymentDetails(
            String(session_id),
            String(session.user_id),
            wallet.public_key,
            wallet.public_key,
            String(quote.sourceAmount),
            String(quote.sourceAsset.code),
            quote.sourceAsset.code === 'XLM' ? undefined : quote.sourceAsset.issuer,
            String(quote.destinationAmount),
            String(quote.destinationAsset.code),
            quote.destinationAsset.code === 'XLM' ? undefined : quote.destinationAsset.issuer,
            String(quote.networkFeeXlm || DEFAULT_NETWORK_FEE_XLM),
            undefined,
            usesStrictSend ? 'CONVERSION_STRICT_SEND' : 'CONVERSION_STRICT_RECEIVE',
            'failed',
            result.error || 'Could not submit conversion',
            quote.path,
            {
              token_hash: tokenHash,
              type: 'conversion',
              quote,
              error: result.error || 'Could not submit conversion',
            }
          );

          return res.status(400).json({
            ...publicErrorPayload(result.error || 'Could not submit conversion', {
              includeSupportCode: true,
              fallback: 'Não consegui concluir essa conversão agora. Gere uma nova confirmação e tente novamente.',
            }),
            ...(requestId ? { request_id: requestId } : {}),
          });
        }

        const settlementMs = Date.now() - submitStartedAt;
        const submittedDetails = result.hash
          ? await StellarService.getSubmittedPaymentDetails(result.hash)
          : null;

        const transferDetails = submittedDetails
          ? {
              ...submittedDetails,
              exact: true,
            }
          : {
              sourceAmount: String(quote.sourceAmount),
              sourceAssetCode: String(quote.sourceAsset.code),
              sourceAssetIssuer: quote.sourceAsset.issuer,
              destinationAmount: String(quote.destinationAmount),
              destinationAssetCode: String(quote.destinationAsset.code),
              destinationAssetIssuer: quote.destinationAsset.issuer,
              feeXlm: '',
              exact: false,
            };
        const feeDisplay = await formatNetworkFeeForCustomer(String(transferDetails.feeXlm || ''));
        const unifiedFee = buildUnifiedFeeDisplay({
          networkFee: feeDisplay,
          platformFeeAmount: quote?.platformFee?.feeAmount,
          platformFeeAssetCode: quote?.platformFee?.feeAssetCode,
          sourceAssetCode: String(transferDetails.sourceAssetCode || quote?.sourceAsset?.code || ''),
          destinationAssetCode: String(transferDetails.destinationAssetCode || quote?.destinationAsset?.code || ''),
        });
        const sourceAmountWithPlatformFee = quote?.sourceAmount
          ? String(quote.sourceAmount)
          : String(transferDetails.sourceAmount || '');
        const publicTransferDetails = {
          ...transferDetails,
          sourceAmount: sourceAmountWithPlatformFee || transferDetails.sourceAmount,
          feeDisplay: unifiedFee.display,
          feeUsdc: unifiedFee.fee_usdc,
          feeBrl: unifiedFee.fee_brl,
          platformFeeDisplay: null,
          totalFeeDisplay: unifiedFee.display,
        };
        const economy = buildSettlementEconomy({
          sourceAmount: String(publicTransferDetails.sourceAmount || quote.sourceAmount),
          sourceAssetCode: String(publicTransferDetails.sourceAssetCode || quote.sourceAsset.code),
          feeBrl: feeDisplay.fee_brl || null,
          quote,
        });
        const completionChannel = resolveCompletionChannel(payload, req.body);
        logger.info(
          `[external-finalize] conversion completion callback channel provider=${completionChannel.provider || 'none'} provider_user_tail=${String(completionChannel.providerUserId || '').replace(/\D+/g, '').slice(-4) || 'none'} session=${String(session_id)}`
        );

        await sendTelegramConversionNotification({
          sessionId: String(session_id),
          userId: String(session.user_id),
          provider: completionChannel.provider,
          providerUserId: completionChannel.providerUserId,
          sourceAmount: String(publicTransferDetails.sourceAmount || quote.sourceAmount),
          sourceAssetCode: String(publicTransferDetails.sourceAssetCode || quote.sourceAsset.code),
          destinationAmount: String(publicTransferDetails.destinationAmount || quote.destinationAmount),
          destinationAssetCode: String(publicTransferDetails.destinationAssetCode || quote.destinationAsset.code),
          feeXlm: String(publicTransferDetails.feeXlm || ''),
          hash: result.hash,
          quote,
          settlementMs,
          savings: {
            estimatedSavings: economy.savings.estimated_savings,
            savingsPercentage: economy.savings.savings_percentage,
            comparisonMethod: economy.savings.comparison_method,
          },
        });

        await logPaymentDetails(
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          wallet.public_key,
          String(publicTransferDetails.sourceAmount || quote.sourceAmount),
          String(publicTransferDetails.sourceAssetCode || quote.sourceAsset.code),
          String(publicTransferDetails.sourceAssetCode || quote.sourceAsset.code).toUpperCase() === 'XLM'
            ? undefined
            : (publicTransferDetails as any).sourceAssetIssuer || quote.sourceAsset.issuer,
          String(publicTransferDetails.destinationAmount || quote.destinationAmount),
          String(publicTransferDetails.destinationAssetCode || quote.destinationAsset.code),
          String(publicTransferDetails.destinationAssetCode || quote.destinationAsset.code).toUpperCase() === 'XLM'
            ? undefined
            : (publicTransferDetails as any).destinationAssetIssuer || quote.destinationAsset.issuer,
          String(publicTransferDetails.feeXlm || ''),
          result.hash,
          usesStrictSend ? 'CONVERSION_STRICT_SEND' : 'CONVERSION_STRICT_RECEIVE',
          'success',
          undefined,
          quote.path,
          {
            token_hash: tokenHash,
            type: 'conversion',
            token_quote: tokenQuote || null,
            quote,
            transferDetails: publicTransferDetails,
            actual_fee_brl: economy.actual_fee_brl,
            platform_fee_brl: economy.platform_fee_brl,
            gross_amount_brl: economy.gross_amount_brl,
            platform_spread_fee: quote?.platformFee || null,
            savings: economy.savings,
          }
        );

        await updatePaymentTokenStatus(
          tokenHash,
          result.hash,
          'completed',
          {
            type: 'conversion',
            quote,
            transferDetails: publicTransferDetails,
            savings: economy.savings,
          }
        );

        await ActivityFeedService.syncFromPayments({
          sessionId: String(session_id),
          userId: String(session.user_id),
        });

        return res.status(200).json({
          success: true,
          conversionConfirmed: true,
          sessionId: String(session_id),
          userId: String(session.user_id),
          sourceAssetCode,
          destAssetCode,
          hash: result.hash,
          transferDetails: publicTransferDetails,
          savings: economy.savings,
        });
      }

      if (tokenSub === 'external_payment_confirm') {
        const { amount, destination, destination_name, destination_contact, session_id, owner_id } = payload as any;
        const contextMessageRaw = String((payload as any)?.transaction_context_message || (payload as any)?.memo || '').trim();
        const contextMessage = contextMessageRaw ? contextMessageRaw.slice(0, 120) : '';
        const requestedDestinationAsset = resolveConfiguredAsset((payload as any)?.asset_code || 'XLM', (payload as any)?.asset_issuer);
        const assetCode = requestedDestinationAsset.code;
        const assetIssuer = requestedDestinationAsset.issuer;
        const requestedSourceAmount = String((payload as any)?.source_amount || '').trim();
        const requestedSourceAsset = (payload as any)?.source_asset_code
          ? resolveConfiguredAsset((payload as any)?.source_asset_code, (payload as any)?.source_asset_issuer)
          : null;
        const requestedSourceAssetCode = requestedSourceAsset?.code || '';
        const requestedSourceAssetIssuer = requestedSourceAsset?.issuer;
        const isStrictSendPayment = Boolean(
          requestedSourceAmount &&
          requestedSourceAssetCode &&
          requestedSourceAssetCode !== assetCode
        );

        if (!amount || !destination || !session_id) {
          return res.status(400).json({ success: false, message: 'token missing payment data' });
        }
        if (assetCode !== 'XLM' && !assetIssuer) {
          return res.status(400).json({
            success: false,
            message: `${assetCode}_ISSUER não está configurado no backend.`,
          });
        }

        const wallet = await walletRepo.getWalletBySession(String(session_id));
        if (!wallet?.public_key || !wallet?.vault_secret_id) {
          return res.status(400).json({ success: false, message: 'wallet not found for payment confirmation' });
        }

        const session = await agentRepo.getSession(String(session_id));
        if (!session?.user_id) {
          return res.status(400).json({ success: false, message: 'session not found for payment confirmation' });
        }
        if (isSessionExpired(session)) {
          await agentRepo.clearSession(String(session_id));
          return res.status(401).json({
            success: false,
            message: 'Sua sessão expirou. Entre novamente antes de confirmar o pagamento.',
          });
        }

        const normalize = (value: string) =>
          value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const candidateOwnerIds = Array.from(
          new Set(
            [String(owner_id || ''), String(session.user_id || '')]
              .map((value) => value.trim())
              .filter(Boolean)
          )
        );

        const resolveContactFromOwners = async (query: string): Promise<string | null> => {
          const normalizedQuery = normalize(query);

          for (const candidateOwnerId of candidateOwnerIds) {
            const directMatch = await ContactRepository.findByNameForOwner(candidateOwnerId, query);
            if (directMatch?.stellar_public_key) {
              return String(directMatch.stellar_public_key).trim();
            }

            const contacts = await ContactRepository.findByOwnerId(candidateOwnerId);
            const pixMatch = contacts.find((contact) =>
              String((contact as any).pix_key || '').trim().toLowerCase() === normalizedQuery
            );

            if (pixMatch?.stellar_public_key) {
              return String(pixMatch.stellar_public_key).trim();
            }

            const exactMatch = contacts.find((contact) => {
              const contactName = normalize(String(contact.contact_name || ''));
              return contactName === normalizedQuery;
            });

            if (exactMatch?.stellar_public_key) {
              return String(exactMatch.stellar_public_key).trim();
            }
          }

          return null;
        };

        type ContactCandidate = {
          contact_name: string;
          stellar_public_key: string;
          score: number;
        };

        const buildCandidateList = (contacts: Array<{ contact_name?: string; stellar_public_key?: string }>, query: string) => {
          const normalizedQuery = normalize(query);
          const queryTokens = normalizedQuery.split(' ').filter(Boolean);

          return contacts
            .map((contact) => {
              const contactName = String(contact.contact_name || '').trim();
              const normalizedName = normalize(contactName);
              const nameTokens = normalizedName.split(' ').filter(Boolean);
              const overlap = queryTokens.filter((token) => nameTokens.includes(token)).length;
              const startsWith = normalizedName.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedName);
              const contains = normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName);
              const score = overlap * 3 + (startsWith ? 2 : 0) + (contains ? 1 : 0);

              return {
                contact_name: contactName,
                stellar_public_key: String(contact.stellar_public_key || ''),
                score,
              } as ContactCandidate;
            })
            .filter((candidate) => candidate.score > 0)
            .sort((a, b) => b.score - a.score || a.contact_name.localeCompare(b.contact_name))
            .slice(0, 5);
        };

        const contactFromToken = destination_contact && typeof destination_contact === 'object'
          ? destination_contact
          : undefined;

        let resolvedDestination = String(
          contactFromToken?.stellar_public_key ||
          contactFromToken?.public_key ||
          destination || ''
        ).trim();

        // If frontend provided an explicit public key in the URL or POST body, prefer it
        if (publicKeyFromBody && typeof publicKeyFromBody === 'string' && isValidStellarPublicKey(publicKeyFromBody)) {
          resolvedDestination = publicKeyFromBody.trim();
        }

        if (!isValidStellarPublicKey(resolvedDestination)) {
          const lookupValue = String(destination_name || destination || '').trim();
          const resolvedFromOwners = lookupValue ? await resolveContactFromOwners(lookupValue) : null;
          if (resolvedFromOwners) {
            resolvedDestination = resolvedFromOwners;
          }
        }

        const isValidPublicKey = isValidStellarPublicKey(resolvedDestination);

        if (!isValidPublicKey) {
          return res.status(400).json({
            success: false,
            message: 'destination must be a valid Stellar public key (provide `public_key` in the confirm link or token).',
            debug: {
              sessionUserId: String(session.user_id),
              providedDestination: destination_name || destination || null,
              hasDestinationContact: Boolean(contactFromToken),
            },
          });
        }

        if (!isValidStellarPublicKey(resolvedDestination) && contactFromToken) {
          const contactKey = String(contactFromToken.stellar_public_key || contactFromToken.public_key || '').trim();
          if (isValidStellarPublicKey(contactKey)) {
            resolvedDestination = contactKey;
          }
        }

        if (!isValidStellarPublicKey(resolvedDestination)) {
          return res.status(400).json({
            success: false,
            message: `destination is invalid: ${destination_contact?.contact_name || destination_name || destination || 'unknown recipient'}`,
            debug: {
              lookupOwnerIds: candidateOwnerIds,
              sessionUserId: String(session.user_id),
              hasDestinationContact: Boolean(contactFromToken),
            },
          });
        }

        let destinationDisplayContact: any = contactFromToken || null;
        try {
          const { data: displayContact } = await supabase
            .from('contacts')
            .select('contact_name, pix_key, phone_number, stellar_public_key')
            .in('owner_id', candidateOwnerIds)
            .eq('stellar_public_key', resolvedDestination)
            .limit(1)
            .maybeSingle();
          if (displayContact) {
            destinationDisplayContact = {
              ...(destinationDisplayContact || {}),
              ...displayContact,
            };
          }
        } catch (displayContactError) {
          logger.debug(`[external-finalize] could not load destination display contact: ${displayContactError instanceof Error ? displayContactError.message : String(displayContactError)}`);
        }
        const destinationDisplayName = String(destinationDisplayContact?.contact_name || destination_name || '').trim();
        const destinationDisplayKey = pickContactTransferKey(destinationDisplayContact);

        const passkeyChallengeId = String(req.body?.passkey_challenge_id || '').trim();
        const passkeyCredential = req.body?.passkey_credential;
        const hasPasskeyPayload = Boolean(passkeyChallengeId || passkeyCredential);

        if (hasPasskeyPayload) {
          if (!passkeyChallengeId || !passkeyCredential || typeof passkeyCredential !== 'object') {
            return res.status(400).json({
              success: false,
              message: 'Dados de biometria incompletos. Tente novamente.',
            });
          }

          try {
            await PasskeyService.verifyTransactionAuthorization({
              token: String(token),
              publicKey: resolvedDestination,
              challengeId: passkeyChallengeId,
              response: passkeyCredential,
            });
          } catch (passkeyError: any) {
            return res.status(401).json({
              success: false,
              message: passkeyError?.message || 'Falha na validação da biometria.',
            });
          }
        } else {
          const providedPin = String(req.body?.pin || '').trim();
          if (!providedPin) {
            return res.status(400).json({
              success: false,
              message: 'PIN é obrigatório para confirmar o pagamento.',
            });
          }

          if (!verifyPinAgainstSession(providedPin, session).valid) {
            return res.status(401).json({
              success: false,
              message: 'PIN inválido. Tente novamente.',
            });
          }
          await rehashSessionPinIfNeeded(String(session_id), providedPin, session).catch((error) => {
            logger.warn(`[external-finalize] could not migrate PIN hash for ${session_id}: ${error instanceof Error ? error.message : String(error)}`);
          });
        }

        const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));

        // try to lookup destination wallet (if recipient is an existing user in our DB)
        let destinationWallet = null;
        try {
          destinationWallet = await walletRepo.getWalletByPublicKey(resolvedDestination);
        } catch (err) {
          // ignore lookup errors; destination may be external
        }

        try {
          await ensureDestinationCanReceiveAsset({
            destination: resolvedDestination,
            destinationWallet,
            assetCode,
            assetIssuer,
            userId: String(session.user_id),
          });
        } catch (assetReadinessError) {
          const message = recipientAssetNotReadyMessage({
            rawError: assetReadinessError,
            assetCode,
            destinationName: destinationDisplayName || destination_contact?.contact_name || destination_name,
          });
          logger.warn(`[external-finalize] destination asset readiness failed: sessionId=${session_id}, dest=${resolvedDestination}, asset=${assetCode}, error=${assetReadinessError instanceof Error ? assetReadinessError.message : String(assetReadinessError)}`);
          return res.status(409).json({
            success: false,
            code: 'recipient_asset_not_ready',
            error: message,
            message,
          });
        }

        const destinationAsset = { code: assetCode, issuer: assetIssuer };
        const minimumReserve = 1.5;

        // Determine actual source asset automatically. If the sender does not hold
        // the requested destination asset, use a trusted spendable balance and route it
        // through a path payment so the user does not need a separate conversion step.
        let actualSourceAsset: any = isStrictSendPayment
          ? { code: requestedSourceAssetCode, issuer: requestedSourceAssetIssuer }
          : destinationAsset;
        let senderHasDestinationAsset = false;
        let senderAccount: any = null;
        let quote: any;
        let isDirectPayment = false;

        try {
          if (isStrictSendPayment) {
            quote = await StellarService.quoteStrictSendConversion({
              sourcePublicKey: wallet.public_key,
              destination: resolvedDestination,
              sourceAmount: requestedSourceAmount,
              sourceAsset: actualSourceAsset,
              destAsset: destinationAsset,
            });
          } else {
            senderAccount = await StellarService.loadAccount(wallet.public_key);
            const requestedAmount = Number(String(amount).replace(',', '.'));
            const directSpendable = getSpendableAssetBalance(senderAccount, destinationAsset, minimumReserve);

            if (Number.isFinite(requestedAmount) && requestedAmount > 0 && directSpendable >= requestedAmount) {
              senderHasDestinationAsset = true;
              isDirectPayment = true;
              actualSourceAsset = destinationAsset;
              const directPlatformFee = PlatformFeeService.calculateSpread({
                sourceAmount: String(amount),
                sourceAssetCode: assetCode,
                destinationAssetCode: assetCode,
                mode: 'add_on_top',
              });
              const directSourceAmount = directPlatformFee?.enabled
                ? (Number(amount) + Number(directPlatformFee.feeAmount)).toFixed(7).replace(/\.?0+$/, '')
                : String(amount);
              quote = {
                sourceAsset: destinationAsset,
                destinationAsset,
                sourceAmount: directSourceAmount,
                destinationAmount: String(amount),
                platformFee: directPlatformFee,
                networkFeeXlm: DEFAULT_NETWORK_FEE_XLM,
                path: [],
              };
            } else {
              const candidates = getTrustedSpendableAssets(senderAccount, destinationAsset)
                .filter((candidate) => !sameAsset(candidate, destinationAsset));
              const failedRoutes: string[] = [];

              for (const candidate of candidates) {
                try {
                  const candidateQuote = await StellarService.quotePathPayment({
                    sourcePublicKey: wallet.public_key,
                    destination: resolvedDestination,
                    destAsset: destinationAsset,
                    destAmount: String(amount),
                    sourceAsset: candidate,
                  });
                  const required = Number(String(candidateQuote?.sourceMax || candidateQuote?.sourceAmount || '0').replace(',', '.'));
                  const spendable = getSpendableAssetBalance(senderAccount, candidate, minimumReserve);

                  if (Number.isFinite(required) && required > 0 && spendable >= required) {
                    actualSourceAsset = candidate;
                    quote = candidateQuote;
                    break;
                  }

                  failedRoutes.push(
                    `${candidate.code}: disponível ${formatBalanceNumber(spendable)}, necessário até ${formatBalanceNumber(required)}`
                  );
                } catch (candidateError) {
                  failedRoutes.push(`${candidate.code}: ${candidateError instanceof Error ? candidateError.message : String(candidateError)}`);
                }
              }

              if (!quote) {
                return res.status(400).json({
                  success: false,
                  insufficientBalance: true,
                  message:
                    `Não encontrei saldo conversível suficiente para entregar ${formatCustomerAssetAmount(String(amount), assetCode)}. ` +
                    `O backend tentou converter automaticamente antes do envio, mas nenhuma rota teve saldo suficiente` +
                    (failedRoutes.length ? ` (${failedRoutes.join('; ')}).` : '.'),
                });
              }
            }
          }
        } catch (quoteError) {
          const message = quoteError instanceof Error ? quoteError.message : String(quoteError);
          logger.warn(`[external-finalize] payment quote failed before token claim: ${message}`);
          return res.status(400).json({
            success: false,
            message: `Não consegui cotar a conversão automática antes da confirmação: ${message}`,
          });
        }

        // Build XDR using the selected source asset.
        if (!isStrictSendPayment && !isDirectPayment) {
          logger.info(`[external-finalize] auto conversion selected: ${actualSourceAsset.code} -> ${assetCode}, sourceAmount=${quote?.sourceAmount}, destinationAmount=${quote?.destinationAmount}`);
        }

        if (!isStrictSendPayment && !isDirectPayment) {
          try {
            senderAccount = senderAccount || await StellarService.loadAccount(wallet.public_key);
            const available = getSpendableAssetBalance(senderAccount, actualSourceAsset, minimumReserve);
            const required = Number(String(quote?.sourceMax || quote?.sourceAmount || '0').replace(',', '.'));

            if (!Number.isFinite(required) || required <= 0 || available < required) {
              const sourceCode = normalizeAssetCode(actualSourceAsset.code);
              return res.status(400).json({
                success: false,
                insufficientBalance: true,
                message:
                  `Saldo insuficiente para converter automaticamente e entregar ${formatCustomerAssetAmount(String(amount), assetCode)}. ` +
                  `Disponível: ${formatBalanceNumber(available)} ${sourceCode}. ` +
                  `Necessário para a rota: até ${formatBalanceNumber(required)} ${sourceCode}.`,
              });
            }
          } catch (balanceCheckError) {
            logger.warn(`[external-finalize] pre-build balance check failed: ${balanceCheckError instanceof Error ? balanceCheckError.message : String(balanceCheckError)}`);
          }
        }

        if (!quote) {
          return res.status(400).json({
            success: false,
            message: 'Não consegui preparar a cotação do pagamento.',
          });
        }

        const selectedSourceAssetCode = normalizeAssetCode(isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code);
        const selectedSourceAssetIssuer = selectedSourceAssetCode === 'XLM'
          ? undefined
          : String(isStrictSendPayment ? actualSourceAsset.issuer : senderHasDestinationAsset ? assetIssuer : actualSourceAsset.issuer || quote?.sourceAsset?.issuer || '').trim() || undefined;
        const selectedDestinationAssetIssuer = assetCode === 'XLM' ? undefined : assetIssuer;

        let unsignedXdr: string;
        try {
          unsignedXdr = isStrictSendPayment
            ? await StellarService.buildStrictSendConversionXdr({
                sourcePublicKey: wallet.public_key,
                destination: resolvedDestination,
                sourceAmount: requestedSourceAmount,
                sourceAsset: actualSourceAsset,
                destAsset: { code: assetCode, issuer: assetIssuer },
                memoText: contextMessage || `Pagamento para ${destination_contact?.contact_name || destination_name || destination}`,
              })
            : isDirectPayment
            ? await StellarService.buildPaymentXdr({
                sourcePublicKey: wallet.public_key,
                destination: resolvedDestination,
                amount: String(amount),
                assetCode: senderHasDestinationAsset ? assetCode : 'XLM',
                assetIssuer: senderHasDestinationAsset ? assetIssuer : undefined,
                memoText: contextMessage || `Pagamento para ${destination_contact?.contact_name || destination_name || destination}`,
              })
            : await StellarService.buildPathPaymentXdr({
                sourcePublicKey: wallet.public_key,
                destination: resolvedDestination,
                destAsset: { code: assetCode, issuer: assetIssuer },
                destAmount: String(amount),
                sourceAsset: actualSourceAsset,
              });
        } catch (buildError) {
          const message = buildError instanceof Error ? buildError.message : String(buildError);
          logger.warn(`[external-finalize] payment XDR build failed before token claim: ${message}`);
          return res.status(400).json({
            success: false,
            message:
              `Não consegui montar a transação de pagamento: ${message} ` +
              `O link não foi confirmado. Gere uma nova confirmação depois de ajustar saldo/valor.`,
          });
        }

        const reservation = await reservePaymentTokenForExecution(tokenHash);
        if (!reservation.ok) {
          logger.warn(`[external-finalize] payment confirmation token unavailable: ${tokenHash.substring(0, 16)}...`);
          return res.status(reservation.status).json(reservation.body);
        }

        const tokenClaimed = await claimPaymentToken(
          tokenHash,
          String(session_id),
          String(session.user_id),
          resolvedDestination,
          String(amount),
          assetCode,
          {
            destinationName: destinationDisplayName || destination_contact?.contact_name || destination_name,
            destinationContact: destinationDisplayContact || destination_contact || null,
            destinationKey: destinationDisplayKey || null,
            sourcePublicKey: wallet.public_key,
            sourceAsset: isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
            sourceAssetIssuer: isStrictSendPayment ? actualSourceAsset.issuer : senderHasDestinationAsset ? assetIssuer : undefined,
            destAsset: assetCode,
            destAssetIssuer: assetIssuer,
            isDirectPayment,
            browserId: browserId || null,
            publicKeyFromBody: publicKeyFromBody || null,
            quote,
          }
        );

        if (!tokenClaimed) {
          await updatePaymentTokenStatus(tokenHash, undefined, 'failed', {
            error: 'Could not reserve payment token details',
          });
          return res.status(400).json({
            success: false,
            error: 'Este link já foi utilizado',
            message: 'Este link já foi utilizado',
          });
        }

        await logPaymentDetails(
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          resolvedDestination,
          isStrictSendPayment ? requestedSourceAmount : senderHasDestinationAsset ? amount : (quote?.sourceAmount || 'pending'),
          selectedSourceAssetCode,
          selectedSourceAssetIssuer,
          amount,
          assetCode,
          selectedDestinationAssetIssuer,
          quote?.networkFeeXlm || DEFAULT_NETWORK_FEE_XLM,
          undefined,
          isStrictSendPayment ? 'PATH_PAYMENT_STRICT_SEND' : isDirectPayment ? 'DIRECT_PAYMENT' : 'PATH_PAYMENT',
          'pending',
          undefined,
          quote?.path,
          {
            token_hash: tokenHash,
            destination_name: destination_contact?.contact_name || destination_name,
            destination_contact,
            source_public_key: wallet.public_key,
            destination_public_key: resolvedDestination,
            isDirectPayment,
            source_asset: selectedSourceAssetCode,
            source_asset_issuer: selectedSourceAssetIssuer,
            destination_asset: assetCode,
            destination_asset_issuer: selectedDestinationAssetIssuer,
            browser_id: browserId || null,
            public_key_from_body: publicKeyFromBody || null,
            memo: contextMessage || null,
            quote,
          }
        );

        // Log payment attempt with full details
        logger.info(`[external-finalize] Submitting payment: sessionId=${session_id}, userId=${session.user_id}, source=${wallet.public_key}, dest=${resolvedDestination}, destName=${destination_contact?.contact_name || destination_name}, sourceAsset=${selectedSourceAssetCode}, destAsset=${assetCode}, amount=${amount}, isDirectPayment=${isDirectPayment}, isStrictSendPayment=${isStrictSendPayment}`);

        const submitStartedAt = Date.now();
        const result = await StellarService.signAndSubmitXdr(
          String(session.user_id),
          secretKey,
          unsignedXdr,
          {
            user_id: String(session.user_id),
            type: isStrictSendPayment ? 'PATH_PAYMENT_STRICT_SEND' : isDirectPayment ? 'PAYMENT' : 'PATH_PAYMENT_STRICT_RECEIVE',
            destination_key: resolvedDestination,
            asset_code: assetCode,
            amount: parseFloat(String(amount)),
            context: isDirectPayment
              ? `Pagamento para ${destination_contact?.contact_name || destination_name || destination}`
              : isStrictSendPayment
                ? `Pagamento com envio exato em ${actualSourceAsset.code} para ${destination_contact?.contact_name || destination_name || destination}; destino recebe ${assetCode}`
                : `Pagamento em ${assetCode} para ${destination_contact?.contact_name || destination_name || destination}; origem convertida automaticamente de ${actualSourceAsset.code}`,
            source_public_key: wallet.public_key,
            source_session_id: wallet.session_id,
            destination_session_id: destinationWallet?.session_id || undefined,
          }
        );

        if (!result.success) {
          await updatePaymentTokenStatus(
            tokenHash,
            undefined,
            'failed',
            {
              destination_name: destination_contact?.contact_name || destination_name,
              destination_contact,
              source_public_key: wallet.public_key,
              destination_public_key: resolvedDestination,
              isDirectPayment,
              source_asset: selectedSourceAssetCode,
              source_asset_issuer: selectedSourceAssetIssuer,
              destination_asset: assetCode,
              destination_asset_issuer: selectedDestinationAssetIssuer,
              browser_id: browserId || null,
              public_key_from_body: publicKeyFromBody || null,
              memo: contextMessage || null,
              quote,
              error: result.error || 'Could not submit payment',
            }
          );

          await logPaymentDetails(
            String(session_id),
            String(session.user_id),
            wallet.public_key,
            resolvedDestination,
            isStrictSendPayment ? requestedSourceAmount : senderHasDestinationAsset ? amount : (quote?.sourceAmount || 'unknown'),
            selectedSourceAssetCode,
            selectedSourceAssetIssuer,
            amount,
            assetCode,
            selectedDestinationAssetIssuer,
            quote?.networkFeeXlm || DEFAULT_NETWORK_FEE_XLM,
            undefined,
            isStrictSendPayment ? 'PATH_PAYMENT_STRICT_SEND' : isDirectPayment ? 'DIRECT_PAYMENT' : 'PATH_PAYMENT',
            'failed',
            result.error || 'Could not submit payment',
            quote?.path,
            {
              token_hash: tokenHash,
              destination_name: destination_contact?.contact_name || destination_name,
              destination_contact,
              source_public_key: wallet.public_key,
              destination_public_key: resolvedDestination,
              isDirectPayment,
              source_asset: selectedSourceAssetCode,
              source_asset_issuer: selectedSourceAssetIssuer,
              destination_asset: assetCode,
              destination_asset_issuer: selectedDestinationAssetIssuer,
              browser_id: browserId || null,
              public_key_from_body: publicKeyFromBody || null,
              memo: contextMessage || null,
              quote,
              error: result.error || 'Could not submit payment',
            }
          );

          const message = paymentSubmissionFailedMessage({
            rawError: result.error,
            assetCode,
            amount: String(amount),
            destinationName: destinationDisplayName || destination_contact?.contact_name || destination_name,
          });

          logger.error(`[external-finalize] Payment failed: sessionId=${session_id}, error=${message}, dest=${resolvedDestination}`);

          return res.status(400).json({
            success: false,
            code: 'stellar_payment_submit_failed',
            error: message,
            message,
          });
        }

        const settlementMs = Date.now() - submitStartedAt;
        const completedAt = new Date().toISOString();
        const submittedPaymentDetails = result.hash
          ? await StellarService.getSubmittedPaymentDetails(result.hash)
          : null;
        const transferDetails = submittedPaymentDetails
          ? {
              ...submittedPaymentDetails,
              exact: true,
            }
          : {
              sourceAmount: assetCode === 'XLM' ? String(amount) : String(quote?.sourceAmount || ''),
              sourceAssetCode: assetCode === 'XLM' ? 'XLM' : String(quote?.sourceAsset?.code || 'XLM'),
              destinationAmount: assetCode === 'XLM' ? String(amount) : String(quote?.destinationAmount || amount),
              destinationAssetCode: assetCode === 'XLM' ? 'XLM' : String(quote?.destinationAsset?.code || assetCode),
              feeXlm: '',
              exact: false,
            };
        const feeDisplay = await formatNetworkFeeForCustomer(String(transferDetails.feeXlm || ''));
        const unifiedFee = buildUnifiedFeeDisplay({
          networkFee: feeDisplay,
          platformFeeAmount: quote?.platformFee?.feeAmount,
          platformFeeAssetCode: quote?.platformFee?.feeAssetCode,
          sourceAssetCode: String(transferDetails.sourceAssetCode || quote?.sourceAsset?.code || ''),
          destinationAssetCode: String(transferDetails.destinationAssetCode || quote?.destinationAsset?.code || ''),
        });
        const publicTransferDetails = {
          ...transferDetails,
          feeDisplay: unifiedFee.display,
          feeUsdc: unifiedFee.fee_usdc,
          feeBrl: unifiedFee.fee_brl,
          platformFeeDisplay: null,
          totalFeeDisplay: unifiedFee.display,
        };
        const sourceAssetForNotice = normalizeAssetCode(publicTransferDetails.sourceAssetCode || quote?.sourceAsset?.code || actualSourceAsset.code);
        const destinationAssetForNotice = normalizeAssetCode(publicTransferDetails.destinationAssetCode || quote?.destinationAsset?.code || assetCode);
        const autoConversion = sourceAssetForNotice !== destinationAssetForNotice
          ? {
              sourceAmount: String(publicTransferDetails.sourceAmount || quote?.sourceAmount || ''),
              sourceAssetCode: sourceAssetForNotice,
              destinationAmount: String(publicTransferDetails.destinationAmount || quote?.destinationAmount || amount),
              destinationAssetCode: destinationAssetForNotice,
              message:
                sourceAssetForNotice === 'XLM' || destinationAssetForNotice === 'XLM'
                  ? 'Conversão automática concluída com a cotação atual antes do envio.'
                  : `Conversão automática concluída com a cotação atual: ${formatCustomerAssetAmount(String(publicTransferDetails.sourceAmount || quote?.sourceAmount || ''), sourceAssetForNotice)} ` +
                    `viraram ${formatCustomerAssetAmount(String(publicTransferDetails.destinationAmount || quote?.destinationAmount || amount), destinationAssetForNotice)} antes do envio.`,
            }
          : null;
        const sourceIssuerForLog = sourceAssetForNotice === 'XLM'
          ? undefined
          : String(publicTransferDetails.sourceAssetIssuer || quote?.sourceAsset?.issuer || selectedSourceAssetIssuer || '').trim() || undefined;
        const destinationIssuerForLog = destinationAssetForNotice === 'XLM'
          ? undefined
          : String(publicTransferDetails.destinationAssetIssuer || quote?.destinationAsset?.issuer || selectedDestinationAssetIssuer || '').trim() || undefined;
        const economy = buildSettlementEconomy({
          sourceAmount: String(publicTransferDetails.sourceAmount || quote?.sourceAmount || amount),
          sourceAssetCode: String(publicTransferDetails.sourceAssetCode || quote?.sourceAsset?.code || assetCode),
          feeBrl: feeDisplay.fee_brl || null,
          quote,
        });
        const completionChannel = resolveCompletionChannel(payload, req.body);
        logger.info(
          `[external-finalize] payment completion callback channel provider=${completionChannel.provider || 'none'} provider_user_tail=${String(completionChannel.providerUserId || '').replace(/\D+/g, '').slice(-4) || 'none'} session=${String(session_id)}`
        );

        const receiptUrl = await sendTelegramPaymentNotification({
          sessionId: String(session_id),
          userId: String(session.user_id),
          provider: completionChannel.provider,
          providerUserId: completionChannel.providerUserId,
          amount: publicTransferDetails.destinationAmount,
          assetCode: publicTransferDetails.destinationAssetCode,
          sourceAmount: publicTransferDetails.sourceAmount,
          sourceAssetCode: publicTransferDetails.sourceAssetCode,
          feeXlm: publicTransferDetails.feeXlm,
          destinationName: destinationDisplayName || destination_contact?.contact_name || destination_name,
          destinationKey: destinationDisplayKey || undefined,
          destination: resolvedDestination,
          hash: result.hash,
          quote,
          settlementMs,
          savings: {
            estimatedSavings: economy.savings.estimated_savings,
            savingsPercentage: economy.savings.savings_percentage,
            comparisonMethod: economy.savings.comparison_method,
          },
          contextMessage: contextMessage || null,

        });

        const receiptSvg = await PaymentReceiptService.buildReceiptImageSvg({
          type: 'payment_sent',
          sessionId: String(session_id),
          userId: String(session.user_id),
          counterpartyLabel: destinationDisplayName || destination_contact?.contact_name || destination_name || 'destinatário',
          counterpartyKey: destinationDisplayKey || null,
          sourceAmount: publicTransferDetails.sourceAmount,
          sourceAssetCode: publicTransferDetails.sourceAssetCode,
          destinationAmount: publicTransferDetails.destinationAmount,
          destinationAssetCode: publicTransferDetails.destinationAssetCode,
          feeXlm: publicTransferDetails.feeXlm,
          feeDisplay: publicTransferDetails.feeDisplay,
          feeBrl: publicTransferDetails.feeBrl,
          feeUsdc: publicTransferDetails.feeUsdc,
          hash: result.hash,
          quote,
          savings: {
            estimatedSavings: economy.savings.estimated_savings,
            savingsPercentage: economy.savings.savings_percentage,
            comparisonMethod: economy.savings.comparison_method,
          },
          settlementMs,
        });
        const receiptImageDataUrl = `data:image/svg+xml;base64,${Buffer.from(receiptSvg, 'utf-8').toString('base64')}`;

        // Log successful payment
        await logPaymentDetails(
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          resolvedDestination,
          publicTransferDetails.sourceAmount,
          publicTransferDetails.sourceAssetCode,
          sourceIssuerForLog,
          publicTransferDetails.destinationAmount,
          publicTransferDetails.destinationAssetCode,
          destinationIssuerForLog,
          publicTransferDetails.feeXlm,
          result.hash,
          isDirectPayment ? 'DIRECT_PAYMENT' : 'PATH_PAYMENT',
          'success',
          undefined,
          quote?.path,
          {
            token_hash: tokenHash,
            destination_name: destinationDisplayName || destination_contact?.contact_name || destination_name,
            destination_contact: destinationDisplayContact || destination_contact,
            destination_key: destinationDisplayKey || null,
            source_public_key: wallet.public_key,
            destination_public_key: resolvedDestination,
            isDirectPayment,
            source_asset: senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
            source_asset_issuer: sourceIssuerForLog,
            destination_asset: assetCode,
            destination_asset_issuer: destinationIssuerForLog,
            browser_id: browserId || null,
            public_key_from_body: publicKeyFromBody || null,
            memo: contextMessage || null,
            quote,
            transferDetails: publicTransferDetails,
            actual_fee_brl: economy.actual_fee_brl,
            platform_fee_brl: economy.platform_fee_brl,
            gross_amount_brl: economy.gross_amount_brl,
            platform_spread_fee: quote?.platformFee || null,
            savings: economy.savings,
            auto_conversion: autoConversion,
          }
        );

        const tokenMarkedUsed = await updatePaymentTokenStatus(
          tokenHash,
          result.hash,
          'completed',
          {
            destination_name: destinationDisplayName || destination_contact?.contact_name || destination_name,
            destination_contact: destinationDisplayContact || destination_contact,
            destination_key: destinationDisplayKey || null,
            source_public_key: wallet.public_key,
            destination_public_key: resolvedDestination,
            isDirectPayment,
            source_asset: senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
            source_asset_issuer: sourceIssuerForLog,
            destination_asset: assetCode,
            destination_asset_issuer: destinationIssuerForLog,
            browser_id: browserId || null,
            public_key_from_body: publicKeyFromBody || null,
            memo: contextMessage || null,
            quote,
            transferDetails: publicTransferDetails,
            savings: economy.savings,
            auto_conversion: autoConversion,
          }
        );
        if (!tokenMarkedUsed) {
          logger.warn(`[external-finalize] payment completed but token was already marked used: ${tokenHash.substring(0, 16)}...`);
        }

        await upsertRecentContactFromPayment({
          ownerId: String(session.user_id),
          sourcePublicKey: wallet.public_key,
          destinationPublicKey: resolvedDestination,
          destinationName: destinationDisplayName || destination_contact?.contact_name || destination_name || destination,
          destinationContact: destinationDisplayContact || destination_contact,
          destinationKey: destinationDisplayKey || null,
        });

        if (destinationWallet?.session_id && destinationWallet.session_id !== String(session_id)) {
          await PaymentReceiptService.sendReceipt({
            type: 'payment_received',
            sessionId: destinationWallet.session_id,
            userId: '',
            counterpartyLabel: String((session as any).email || session.user_id || 'TalkToStellar'),
            sourceAmount: publicTransferDetails.sourceAmount,
            sourceAssetCode: publicTransferDetails.sourceAssetCode,
            destinationAmount: publicTransferDetails.destinationAmount,
            destinationAssetCode: publicTransferDetails.destinationAssetCode,
            feeXlm: publicTransferDetails.feeXlm,
            feeDisplay: publicTransferDetails.feeDisplay,
            feeBrl: publicTransferDetails.feeBrl,
            feeUsdc: publicTransferDetails.feeUsdc,
            hash: result.hash,
            quote,
            contextMessage: contextMessage || null,
            savings: {
              estimatedSavings: economy.savings.estimated_savings,
              savingsPercentage: economy.savings.savings_percentage,
              comparisonMethod: economy.savings.comparison_method,
            },
            settlementMs,
          });
        }

        await ActivityFeedService.syncFromPayments({
          sessionId: String(session_id),
          userId: String(session.user_id),
        });

        let monthlySavingsSummary: any = null;
        try {
          const monthly = await EconomyEngineService.calculateMonthly({
            sessionId: String(session_id),
            userId: String(session.user_id),
          });
          monthlySavingsSummary = {
            period: 'month_to_date',
            estimated_savings_brl: Number(monthly?.savings?.estimatedSavings || 0).toFixed(8),
            estimated_traditional_fee_brl: Number(monthly?.savings?.estimatedTraditionalFee || 0).toFixed(8),
            actual_fee_brl: Number(monthly?.savings?.actualFee || 0).toFixed(8),
            savings_percentage: Number(monthly?.savings?.savingsPercentage || 0).toFixed(4),
            comparison_method: String(monthly?.savings?.comparisonMethod || ''),
            message: String(monthly?.message || ''),
          };
        } catch (monthlyError: any) {
          logger.warn(`[external-finalize] could not calculate monthly savings summary: ${monthlyError?.message || String(monthlyError)}`);
        }

        logger.info(`[external-finalize] Payment successful: sessionId=${session_id}, hash=${result.hash}, source=${wallet.public_key}, dest=${resolvedDestination}, destinationAmount=${publicTransferDetails.destinationAmount}, destinationAsset=${publicTransferDetails.destinationAssetCode}`);
        return res.status(200).json({
          success: true,
          paymentConfirmed: true,
          tx_hash: result.hash,
          amount: publicTransferDetails.destinationAmount || String(amount),
          asset: publicTransferDetails.destinationAssetCode || assetCode,
          completed_at: completedAt,
          receipt_url: receiptUrl || PaymentReceiptService.buildHostedReceiptUrl(result.hash),
          sessionId: String(session_id),
          userId: String(session.user_id),
          destination: resolvedDestination,
          destinationName: destinationDisplayName || destination_contact?.contact_name || destination_name || 'Destinatário',
          destinationKey: destinationDisplayKey || undefined,
          destination_key: destinationDisplayKey || undefined,
          assetCode,
          hash: result.hash,
          transferDetails: publicTransferDetails,
          savings: economy.savings,
          monthly_savings: monthlySavingsSummary,
          autoConversion,
          context_message: contextMessage || null,
          message: autoConversion
            ? `Pagamento enviado. ${autoConversion.message}`
            : 'Pagamento enviado com sucesso.',
          receiptImageDataUrl,
        });
      }

      const rawProvider = String((payload as any)?.provider || '');
      const rawProviderUserId = String((payload as any)?.provider_user_id || '');
      const language = normalizeLanguage((payload as any)?.language || (payload as any)?.lang || (payload as any)?.locale);
      const provider = normalizeExternalProvider(rawProvider);
      const provider_user_id = normalizeExternalProviderUserId(provider, rawProviderUserId);
      if (!provider || !provider_user_id) {
        return res.status(400).json({ success: false, message: 'token missing provider data' });
      }
      logger.info(`[external-finalize] event=account_finalize_start ${JSON.stringify({
        request_id: requestId || undefined,
        provider,
        provider_user_id: maskLogValue(provider_user_id),
        token_hash: maskLogValue(tokenHash, 10, 6),
        has_email: Boolean(email),
        has_phone: Boolean(rawPhoneNumber),
        has_cpf: Boolean(rawCpf),
        has_browser_id: Boolean(browserId),
      })}`);
      const channelMetadata = externalChannelMetadata(payload, req.body, normalizedPhoneNumber);
      if (isPhoneProvider(provider) && !normalizedPhoneNumber) {
        normalizedPhoneNumber = provider_user_id;
      }

      const providedPin = String(pin || '').trim();
      if (!providedPin) {
        return res.status(400).json({ success: false, message: 'PIN é obrigatório para criar a conta.' });
      }
      if (!/^\d{4,8}$/.test(providedPin)) {
        return res.status(400).json({ success: false, message: 'PIN deve conter de 4 a 8 dígitos numéricos.' });
      }
      if (normalizedPhoneNumber && (normalizedPhoneNumber.length < 10 || normalizedPhoneNumber.length > 15)) {
        return res.status(400).json({ success: false, message: 'Telefone inválido. Informe DDD + número (com ou sem +55).' });
      }
      if (normalizedCpf && normalizedCpf.length !== 11) {
        return res.status(400).json({ success: false, message: 'CPF inválido. Informe 11 dígitos.' });
      }
      const pinHash = hashWalletPin(providedPin);

      const normalizedEmail = normalizeEmailForCompare(email);
      if (email && !looksLikeEmail(normalizedEmail)) {
        return res.status(400).json({ success: false, message: 'Informe um e-mail válido.' });
      }
      // create deterministic user id for external users, or use email if provided
      const userId = normalizedEmail || `external:${provider}:${provider_user_id}`;
      const providerLabel = isPhoneProvider(provider) ? 'WhatsApp' : provider === 'telegram' ? 'Telegram' : 'canal externo';
      const isBrowserProvider = isBrowserExternalProvider(provider);
      const identityLock = isBrowserProvider ? null : await resolveExternalIdentityLock(provider, provider_user_id);

      if (identityLock?.canonicalLogin && normalizedEmail !== identityLock.canonicalLogin) {
        return res.status(409).json({
          success: false,
          notAssociated: true,
          message: `A conta informada não está associada a este ${providerLabel}. Use exatamente o e-mail vinculado originalmente.`,
        });
      }

      const existingAccount = isBrowserProvider ? null : await externalRepo.findByProviderAndId(provider, provider_user_id);
      if (existingAccount?.session_id && existingAccount?.user_id) {
        const existingSession = await agentRepo.getSession(String(existingAccount.session_id));
        const existingWallet = await walletRepo.getWalletBySession(String(existingAccount.session_id));
        if (!existingSession || !existingWallet) {
          return res.status(409).json({
            success: false,
            notAssociated: true,
            message: `Este ${providerLabel} já está vinculado a uma conta existente.`,
          });
        }
        const existingEmail = normalizeEmailForCompare((existingSession as any)?.email);
        const existingUserId = normalizeEmailForCompare((existingSession as any)?.user_id);
        const canonicalExternalLogin = existingEmail || (looksLikeEmail(existingUserId) ? existingUserId : '');
        if (canonicalExternalLogin && normalizedEmail !== canonicalExternalLogin) {
          return res.status(409).json({
            success: false,
            notAssociated: true,
            message: `A conta informada não está associada a este ${providerLabel}. Use exatamente o e-mail vinculado originalmente.`,
          });
        }

        if (!verifyPinAgainstSession(providedPin, existingSession).valid) {
          return res.status(401).json({
            success: false,
            message: 'PIN inválido para a conta já vinculada a este canal.',
          });
        }
        await rehashSessionPinIfNeeded(String(existingAccount.session_id), providedPin, existingSession).catch((error) => {
          logger.warn(`[external-finalize] could not migrate PIN hash for ${existingAccount.session_id}: ${error instanceof Error ? error.message : String(error)}`);
        });

        const collision = await detectIdentityCollision({
          email: normalizedEmail || undefined,
          phoneNumber: normalizedPhoneNumber || undefined,
          cpf: normalizedCpf || undefined,
          allowedSessionIds: [String(existingAccount.session_id)],
          allowedUserIds: [String(existingAccount.user_id)],
        });
        if (collision) {
          const fieldLabel = collision.field === 'phone_number' ? 'telefone' : collision.field.toUpperCase();
          return res.status(409).json({
            success: false,
            message: `Não foi possível concluir: ${fieldLabel} já está vinculado a outra conta.`,
            collision: {
              field: collision.field,
              value: collision.value,
            },
          });
        }

        const emailConfirmed = await ensureEmailConfirmation(req, res, {
          email: normalizedEmail,
          purpose: 'create_account',
          language,
          metadata: {
            provider,
            provider_user_id,
            token_hash: tokenHash,
            session_id: String(existingAccount.session_id),
            user_id: String(existingAccount.user_id),
            browser_id: browserId || null,
          },
        });
        if (!emailConfirmed) return;

        if (existingSession && existingWallet) {
          const existingPhone = normalizePhoneForCompare((existingSession as any)?.phone_number);
          const mergedPhone = existingPhone
            ? (existingSession as any)?.phone_number
            : (normalizedPhoneNumber || (existingSession as any)?.phone_number);
          await agentRepo.saveSession(String(existingAccount.session_id), {
            ...existingSession,
            email: (existingSession as any)?.email || normalizedEmail || '',
            phone_number: mergedPhone,
          } as any);

          void configureWalletAssetsAndContacts({
            userId: String(existingAccount.user_id),
            publicKey: existingWallet.public_key,
            vaultSecretId: existingWallet.vault_secret_id,
          });

          await createExternalMappingsWithAliases({
            provider,
            provider_user_id,
            session_id: String(existingAccount.session_id),
            user_id: String(existingAccount.user_id),
            data: {
              name: name || null,
              email: email || null,
              phone_number: normalizedPhoneNumber || null,
              cpf: normalizedCpf || null,
              ...channelMetadata,
            },
          });

          if (browserId) {
            await externalRepo.createMapping({
              provider: 'web',
              provider_user_id: browserId,
              session_id: String(existingAccount.session_id),
              user_id: String(existingAccount.user_id),
              data: {
                name: name || null,
                email: email || null,
                phone_number: normalizedPhoneNumber || null,
                cpf: normalizedCpf || null,
              },
            });
          }

          await clearAgentLoginState(String(existingAccount.session_id));

          void TransferNotificationService.notifySessionWelcome({
            sessionId: String(existingAccount.session_id),
            userId: String(existingAccount.user_id),
            name: name || email || existingSession.email || null,
            provider,
            providerUserId: provider_user_id,
            language,
          }).catch((welcomeError) => {
            logger.warn(`[external-finalize] welcome notification failed for ${existingAccount.user_id}: ${welcomeError instanceof Error ? welcomeError.message : String(welcomeError)}`);
          });

          return res.status(200).json({
            success: true,
            alreadyCompleted: true,
            message: 'Conta já criada. Reutilizando a conta existente.',
            sessionId: existingAccount.session_id,
            sessionToken: existingSession.session_token,
            userId: existingAccount.user_id,
            publicKey: existingWallet.public_key,
            walletName: existingWallet.name || `Wallet for ${existingAccount.user_id}`,
          });
        }
      }

      if (!existingAccount?.session_id && identityLock?.sessionId) {
        const lockedSession = await agentRepo.getSession(identityLock.sessionId);
        const lockedWallet = lockedSession ? await walletRepo.getWalletBySession(identityLock.sessionId) : null;
        if (lockedSession && lockedWallet) {
          const lockedLogin = resolveCanonicalSessionLogin(lockedSession);
          if (lockedLogin && normalizedEmail !== lockedLogin) {
            return res.status(409).json({
              success: false,
              notAssociated: true,
              message: `A conta informada não está associada a este ${providerLabel}. Use exatamente o e-mail vinculado originalmente.`,
            });
          }

          if (!verifyPinAgainstSession(providedPin, lockedSession).valid) {
            return res.status(401).json({
              success: false,
              message: 'PIN inválido para a conta já vinculada a este canal.',
            });
          }
          await rehashSessionPinIfNeeded(identityLock.sessionId, providedPin, lockedSession).catch((error) => {
            logger.warn(`[external-finalize] could not migrate PIN hash for ${identityLock.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
          });

          const emailConfirmed = await ensureEmailConfirmation(req, res, {
            email: normalizedEmail || lockedLogin,
            purpose: 'create_account',
            language,
            metadata: {
              provider,
              provider_user_id,
              token_hash: tokenHash,
              session_id: String(identityLock.sessionId),
              user_id: String((lockedSession as any)?.user_id || identityLock.userId || ''),
              browser_id: browserId || null,
            },
          });
          if (!emailConfirmed) return;

          await createExternalMappingsWithAliases({
            provider,
            provider_user_id,
            session_id: String(identityLock.sessionId),
            user_id: String((lockedSession as any)?.user_id || identityLock.userId || ''),
            data: {
              name: name || null,
              email: email || null,
              phone_number: normalizedPhoneNumber || null,
              cpf: normalizedCpf || null,
              ...channelMetadata,
            },
          });

          await clearAgentLoginState(String(identityLock.sessionId));

          void TransferNotificationService.notifySessionWelcome({
            sessionId: String(identityLock.sessionId),
            userId: String((lockedSession as any)?.user_id || identityLock.userId || ''),
            name: name || email || (lockedSession as any)?.email || null,
            provider,
            providerUserId: provider_user_id,
            language,
          }).catch((welcomeError) => {
            logger.warn(`[external-finalize] welcome notification failed for ${identityLock.userId || identityLock.sessionId}: ${welcomeError instanceof Error ? welcomeError.message : String(welcomeError)}`);
          });

          return res.status(200).json({
            success: true,
            alreadyCompleted: true,
            message: 'Conta já criada. Reutilizando a conta existente.',
            sessionId: String(identityLock.sessionId),
            sessionToken: String((lockedSession as any)?.session_token || ''),
            userId: String((lockedSession as any)?.user_id || identityLock.userId || ''),
            publicKey: String((lockedWallet as any)?.public_key || ''),
            walletName: String((lockedWallet as any)?.name || `Wallet for ${String((lockedSession as any)?.user_id || identityLock.userId || '')}`),
          });
        }
      }

      const newAccountCollision = await detectIdentityCollision({
        email: normalizedEmail || undefined,
        phoneNumber: normalizedPhoneNumber || undefined,
        cpf: normalizedCpf || undefined,
      });
      if (newAccountCollision) {
        const fieldLabel = newAccountCollision.field === 'phone_number'
          ? 'telefone'
          : newAccountCollision.field.toUpperCase();
        return res.status(409).json({
          success: false,
          message: `Não foi possível concluir: ${fieldLabel} já está vinculado a outra conta.`,
          collision: {
            field: newAccountCollision.field,
            value: newAccountCollision.value,
          },
        });
      }

      const emailConfirmed = await ensureEmailConfirmation(req, res, {
        email: normalizedEmail,
        purpose: 'create_account',
        language,
        metadata: {
          provider,
          provider_user_id,
          token_hash: tokenHash,
          browser_id: browserId || null,
        },
      });
      if (!emailConfirmed) return;

      const onboardingReservation = await reserveOnboardingFinalization({
        tokenHash,
        provider: String(provider),
        providerUserId: String(provider_user_id),
        data: {
          name: name || null,
          email: email || null,
          phone_number: normalizedPhoneNumber || null,
          cpf: normalizedCpf || null,
          browser_id: browserId || null,
          ...channelMetadata,
        },
      });
      if (!onboardingReservation.ok) {
        return res.status(onboardingReservation.status).json(onboardingReservation.body);
      }
      onboardingReservationTokenHash = tokenHash;

      const generated = StellarService.generateStellarKeypair();
      let publicKey = generated.publicKey;
      let secretKey = generated.secret;

      const vaultSecretId = await vaultService.storeSecret(
        secretKey,
        `wallet:${userId}:private-key`,
        `Stellar private key for wallet ${publicKey}`
      );

      const storedSecretKey = await vaultService.getSecret(vaultSecretId);
      const storedKeypair = Keypair.fromSecret(storedSecretKey);
      publicKey = storedKeypair.publicKey();
      secretKey = storedSecretKey;

      const existingWallet = await walletRepo.getWalletByPublicKey(publicKey);
      if (existingWallet) {
        const existingSession = await agentRepo.getSession(existingWallet.session_id);

        if (existingSession) {
          await agentRepo.saveSession(existingWallet.session_id, {
            ...existingSession,
            email: normalizedEmail || existingSession.email || '',
            phone_number: normalizedPhoneNumber || existingSession.phone_number,
            email_verified: Boolean(normalizedEmail) || (existingSession as any)?.email_verified,
            email_verified_at: normalizedEmail ? new Date().toISOString() : (existingSession as any)?.email_verified_at,
            email_verification_source: normalizedEmail ? 'email_confirmation_create_account' : (existingSession as any)?.email_verification_source,
          } as any);

          void configureWalletAssetsAndContacts({
            userId,
            publicKey,
            vaultSecretId: existingWallet.vault_secret_id,
          });

          await createExternalMappingsWithAliases({
            provider,
            provider_user_id,
            session_id: existingWallet.session_id,
            user_id: userId,
            data: {
              name: name || null,
              email: email || null,
              phone_number: normalizedPhoneNumber || null,
              cpf: normalizedCpf || null,
              ...channelMetadata,
            },
          });

          const responseBody = {
            success: true,
            sessionId: existingWallet.session_id,
            sessionToken: existingSession.session_token,
            userId,
            publicKey,
            walletName: existingWallet.name || `Wallet for ${userId}`,
          };
          await completeOnboardingFinalization(tokenHash, responseBody, 200);
          onboardingReservationTokenHash = null;
          await clearAgentLoginState(existingWallet.session_id);

          void TransferNotificationService.notifySessionWelcome({
            sessionId: existingWallet.session_id,
            userId,
            name: name || email || existingSession.email || null,
            provider,
            providerUserId: provider_user_id,
            language,
          }).catch((welcomeError) => {
            logger.warn(`[external-finalize] welcome notification failed for ${userId}: ${welcomeError instanceof Error ? welcomeError.message : String(welcomeError)}`);
          });

          return res.status(200).json(responseBody);
        }
      }

      // create session and session token
      const sessionId = uuidv4();
      const sessionToken = uuidv4();
      const pixKey = ContactSeedService.derivePixKey(userId, {
        email: email || undefined,
        phoneNumber: normalizedPhoneNumber || undefined,
        cpf: normalizedCpf || undefined,
        name: name || undefined,
      });

      const now = new Date().toISOString();
      await agentRepo.saveSession(sessionId, {
        user_id: userId,
        email: normalizedEmail || '',
        session_token: sessionToken,
        public_key: publicKey,
        phone_number: normalizedPhoneNumber || undefined,
        pix_key: pixKey,
        password_hash: pinHash,
        session_password_hash: pinHash,
        email_verified: Boolean(normalizedEmail),
        email_verified_at: normalizedEmail ? now : undefined,
        email_verification_source: normalizedEmail ? 'email_confirmation_create_account' : undefined,
        created_at: now,
        last_activity: now,
      });

      await walletRepo.saveWallet({
        session_id: sessionId,
        public_key: publicKey,
        vault_secret_id: vaultSecretId,
        name: name || `Wallet for ${userId}`,
        pix_key: pixKey,
      } as any);

      // link external_accounts mapping
      await createExternalMappingsWithAliases({
        provider,
        provider_user_id,
        session_id: sessionId,
        user_id: userId,
        data: {
          name: name || null,
          email: email || null,
          phone_number: normalizedPhoneNumber || null,
          cpf: normalizedCpf || null,
          ...channelMetadata,
        },
      });

      if (browserId) {
        await externalRepo.createMapping({
          provider: 'web',
          provider_user_id: browserId,
          session_id: sessionId,
          user_id: userId,
          data: {
            name: name || null,
            email: email || null,
            phone_number: normalizedPhoneNumber || null,
            cpf: normalizedCpf || null,
          },
        });
      }

      const responseBody = {
        success: true,
        sessionId,
        sessionToken,
        userId,
        publicKey,
        walletName: name || `Wallet for ${userId}`,
        transferKey: pixKey,
        pixKey,
        assetSetupPending: true,
      };
      await completeOnboardingFinalization(tokenHash, responseBody, 201);
      onboardingReservationTokenHash = null;
      await clearAgentLoginState(sessionId);

      runPostOnboardingTasks({
        sessionId,
        userId,
        publicKey,
        vaultSecretId,
        walletName: name || `Wallet for ${userId}`,
        pixKey,
        name: name || email || null,
        provider,
        providerUserId: provider_user_id,
        language,
      });

      return res.status(201).json(responseBody);
    } catch (error: any) {
      const message = error?.message || String(error);
      if (onboardingReservationTokenHash) {
        await failOnboardingFinalization(onboardingReservationTokenHash, message);
      }
      logger.error(`[external-finalize] event=account_finalize_failed ${JSON.stringify({
        request_id: requestId || undefined,
        token_hash: maskLogValue(onboardingReservationTokenHash, 10, 6),
        code: publicErrorCode(error),
        error: message,
      })}`);
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          success: false,
          message: IDENTITY_CONFLICT_MESSAGE,
          ...(requestId ? { request_id: requestId } : {}),
        });
      }
      return res.status(500).json({
        ...publicErrorPayload(error, {
          includeSupportCode: true,
          fallback: 'Não consegui concluir agora. Tente novamente em alguns segundos.',
        }),
        ...(requestId ? { request_id: requestId } : {}),
      });
    }
  }
}
