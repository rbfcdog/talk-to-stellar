import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../../config/supabase';
import ExternalService from '../services/core/external.service';
import { AgentRepository } from '../repository/core/agent.repository';
import { WalletRepository } from '../repository/core/wallet.repository';
import PasskeyService from '../services/core/passkey.service';
import {
  ExternalRepository,
  externalProviderAliases,
  isPhoneProvider,
  normalizeExternalProvider,
  normalizeExternalProviderUserId,
} from '../repository/core/external.repository';
import { TransferNotificationService } from '../services/transfer-notification.service';
import {
  EmailConfirmationError,
  EmailConfirmationPurpose,
  EmailConfirmationService,
} from '../services/email-confirmation.service';
import { isSessionExpired } from '../../utils/session-expiry';
import { getRequiredJwtSecret } from '../../config/secrets';
import { hashWalletPin, verifyWalletPinAgainstAny } from '../../utils/pin-hash';
import { publicErrorMessage } from '../../utils/public-error';

const externalService = new ExternalService(supabase);
const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);
const externalRepo = new ExternalRepository(supabase);

const IDENTITY_CONFLICT_MESSAGE = 'Não foi possível concluir: já existe uma conta com esses dados. Entre na conta existente ou use outro e-mail, telefone ou CPF.';

function isUniqueViolation(error: any): boolean {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error || '').toLowerCase();
  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    message.includes('violates unique') ||
    message.includes('already exists')
  );
}

function externalAliasData(data: Record<string, unknown> | undefined, keepIdentityFields: boolean): Record<string, unknown> {
  const clone = { ...(data || {}) };
  if (keepIdentityFields) return clone;

  delete clone.email;
  delete clone.phone_number;
  delete clone.phoneNumber;
  delete clone.whatsapp_number;
  delete clone.whatsappNumber;
  delete clone.cpf;
  return clone;
}

async function createExternalMappingWithAliases(payload: {
  provider: string;
  provider_user_id: string;
  session_id: string | null;
  user_id: string | null;
  data?: Record<string, unknown>;
}) {
  const normalizedProvider = normalizeExternalProvider(payload.provider);
  const normalizedProviderUserId = normalizeExternalProviderUserId(normalizedProvider, payload.provider_user_id);
  const providers = externalProviderAliases(normalizedProvider);
  const primaryProvider = providers.includes(normalizedProvider) ? normalizedProvider : providers[0];
  for (const provider of providers) {
    const keepIdentityFields = provider === primaryProvider;
    const baseMapping = {
      provider,
      provider_user_id: normalizedProviderUserId,
      session_id: payload.session_id,
      user_id: payload.user_id,
    };
    try {
      await externalRepo.createMapping({
        ...baseMapping,
        data: externalAliasData(payload.data, keepIdentityFields),
      });
    } catch (error) {
      if (!keepIdentityFields || !isUniqueViolation(error)) {
        throw error;
      }

      // Some legacy WhatsApp/phone alias rows already own the phone identity
      // fields in data. Keep the channel link idempotent and avoid duplicating
      // those identity fields across aliases.
      await externalRepo.createMapping({
        ...baseMapping,
        data: externalAliasData(payload.data, false),
      });
    }
  }
}

function getJwtSecret() {
  return getRequiredJwtSecret();
}

function verifyPinAgainstSession(pin: string, session: any) {
  return verifyWalletPinAgainstAny(pin, [
    session?.session_password_hash,
    session?.password_hash,
  ]);
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

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
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

function getOnboardingProcessingTtlSeconds(): number {
  const parsed = Number(String(process.env.ONBOARDING_PROCESSING_TTL_SECONDS || '180').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 180;
  return Math.trunc(parsed);
}

function isOnboardingProcessingStale(state: any): boolean {
  const ttlMs = getOnboardingProcessingTtlSeconds() * 1000;
  const lockAtRaw = String(state?.updated_at || state?.created_at || '').trim();
  const lockAtMs = Date.parse(lockAtRaw);
  if (!Number.isFinite(lockAtMs)) return false;
  return Date.now() - lockAtMs > ttlMs;
}

type ExternalIdentityLock = {
  sessionId?: string;
  userId?: string;
  canonicalLogin?: string;
};

async function readOnboardingLinkState(hash: string) {
  const { data, error } = await supabase
    .from('onboarding_finalizations')
    .select('used, used_at, status, created_at, updated_at')
    .eq('token_hash', hash)
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('onboarding_finalizations') || message.includes('schema cache')) return null;
    throw error;
  }
  return data;
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
  const mappedData = mapped?.data && typeof mapped.data === 'object' ? mapped.data as Record<string, unknown> : {};
  const mappedEmail = normalizeEmailForCompare(String(mappedData.email || mappedData.user_id || mappedData.userId || ''));

  if (mappedSessionId || mappedUserId || mappedEmail) {
    let canonicalLogin = looksLikeEmail(mappedUserId) ? mappedUserId : looksLikeEmail(mappedEmail) ? mappedEmail : '';
    if (mappedSessionId) {
      const linkedSession = await agentRepo.getSession(mappedSessionId);
      if (linkedSession) {
        canonicalLogin = resolveCanonicalSessionLogin(linkedSession) || canonicalLogin;
      }
    }
    return {
      sessionId: mappedSessionId || undefined,
      userId: mappedUserId || mappedEmail || undefined,
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

async function assertOnboardingLinkReusable(rawToken: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const state = await readOnboardingLinkState(tokenHash(rawToken));
  if (state?.used || String(state?.status || '').toLowerCase() === 'completed') {
    return { ok: false, status: 409, message: 'Este link já foi utilizado.' };
  }
  if (String(state?.status || '').toLowerCase() === 'processing') {
    if (isOnboardingProcessingStale(state)) {
      return { ok: true };
    }
    return { ok: false, status: 409, message: 'Este link já está em processamento. Aguarde a conclusão.' };
  }
  return { ok: true };
}

function externalDataFromPayload(payload: any): Record<string, unknown> {
  const provider = String(payload?.provider || '').trim().toLowerCase();
  const chatId = String(
    payload?.telegram_chat_id ||
    payload?.chat_id ||
    payload?.telegramChatId ||
    ''
  ).trim();
  const username = String(payload?.username || payload?.telegram_username || '').trim();
  const rawLanguage = payload?.language || payload?.lang || payload?.locale;
  const language = rawLanguage ? normalizeLanguage(rawLanguage) : '';
  const data: Record<string, unknown> = {};
  if (language) {
    data.language = language;
  }
  if (provider === 'telegram' && chatId) {
    data.telegram_chat_id = chatId;
    data.chat_id = chatId;
  }
  if (provider === 'telegram' && username) {
    data.telegram_username = username;
    data.username = username;
  }
  if (['whatsapp', 'phone', 'evolution', 'whatsapp_evolution'].includes(provider)) {
    const phoneNumber = String(
      payload?.phone_number ||
      payload?.phoneNumber ||
      payload?.whatsapp_number ||
      payload?.whatsappNumber ||
      payload?.number ||
      payload?.provider_user_id ||
      ''
    ).replace(/\D+/g, '');
    const remoteJid = String(payload?.remote_jid || payload?.remoteJid || payload?.jid || '').trim();
    const instance = String(
      payload?.instance ||
      payload?.instanceName ||
      payload?.instance_name ||
      payload?.evolution_instance ||
      payload?.evolutionInstance ||
      ''
    ).trim();
    const instanceId = String(
      payload?.instance_id ||
      payload?.instanceId ||
      payload?.evolution_instance_id ||
      payload?.evolutionInstanceId ||
      ''
    ).trim();
    const messageId = String(payload?.message_id || payload?.messageId || '').trim();
    if (phoneNumber) {
      data.phone_number = phoneNumber;
      data.whatsapp_number = phoneNumber;
    }
    if (remoteJid) {
      data.remote_jid = remoteJid;
      data.jid = remoteJid;
    }
    if (instance) {
      data.instance = instance;
      data.evolution_instance = instance;
    }
    if (instanceId) {
      data.instance_id = instanceId;
      data.evolution_instance_id = instanceId;
    }
    if (messageId) {
      data.last_message_id = messageId;
    }
  }
  return data;
}

async function hasOnboardingCredentials(sessionId: string, userId: string, options: { allowExpiredSession?: boolean } = {}): Promise<boolean> {
  const session = await agentRepo.getSession(sessionId);
  if (!session) {
    return false;
  }

  if (!options.allowExpiredSession && isSessionExpired(session)) {
    return false;
  }

  if (String((session as any).password_hash || '').trim()) {
    return true;
  }

  try {
    const passkeys = await PasskeyService.getUserPasskeys(userId);
    return passkeys.length > 0;
  } catch {
    return false;
  }
}

function getTokenSessionId(payload: any): string {
  return String(payload?.session_id || payload?.sessionId || '').trim();
}

function getTokenUserId(payload: any): string {
  return normalizeEmailForCompare(String(payload?.user_id || payload?.userId || payload?.owner_id || payload?.ownerId || ''));
}

async function resolveTokenIdentityLock(payload: any): Promise<ExternalIdentityLock | null> {
  const tokenSessionId = getTokenSessionId(payload);
  const tokenUserId = getTokenUserId(payload);
  let canonicalLogin = looksLikeEmail(tokenUserId) ? tokenUserId : '';

  if (tokenSessionId) {
    const tokenSession = await agentRepo.getSession(tokenSessionId);
    if (tokenSession) {
      canonicalLogin = resolveCanonicalSessionLogin(tokenSession) || canonicalLogin;
      return {
        sessionId: String((tokenSession as any)?.session_id || tokenSessionId),
        userId: normalizeEmailForCompare(String((tokenSession as any)?.user_id || tokenUserId || '')) || undefined,
        canonicalLogin: canonicalLogin || undefined,
      };
    }
  }

  if (!tokenUserId && !canonicalLogin) return null;
  return {
    userId: tokenUserId || undefined,
    canonicalLogin: canonicalLogin || undefined,
  };
}

export class ExternalController {
  // POST /api/external/check-account
  static async checkAccount(req: Request, res: Response) {
    try {
      const { provider } = req.body;
      const externalData = externalDataFromPayload(req.body);
      const forceNewAccount = Boolean(req.body?.force_new_account || req.body?.forceNewAccount);
      const lookupOnly = Boolean(
        req.body?.lookup_only ||
        req.body?.lookupOnly ||
        req.body?.skip_onboarding_link ||
        req.body?.skipOnboardingLink
      );
      const normalizedProvider = normalizeExternalProvider(String(provider || ''));
      const provider_user_id = normalizeExternalProviderUserId(normalizedProvider, String(req.body?.provider_user_id || ''));

      if (!normalizedProvider || !provider_user_id) {
        return res.status(400).json({ success: false, message: 'provider and provider_user_id required' });
      }

      let existing = null;
      try {
        existing = await externalService.checkExternalAccount(normalizedProvider, provider_user_id);
      } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        const isMissingExternalTable =
          message.includes("could not find the table 'public.external_accounts' in the schema cache") ||
          message.includes('relation "external_accounts" does not exist') ||
          message.includes('relation public.external_accounts does not exist');

        if (!isMissingExternalTable) {
          throw error;
        }
      }

      if (isBrowserExternalProvider(normalizedProvider) && !lookupOnly) {
        existing = null;
      }

      if (existing && !forceNewAccount) {
        if (Object.keys(externalData).length > 0) {
          await createExternalMappingWithAliases({
            provider: normalizedProvider,
            provider_user_id,
            session_id: existing.session_id || null,
            user_id: existing.user_id || null,
            data: {
              ...((existing as any).data || {}),
              ...externalData,
            },
          });
        }

        const hasLinkedSession = Boolean(existing.session_id);
        const hasLinkedUser = Boolean(existing.user_id);
        let linkedWallet = null;
        let linkedSession = null;
        let hasCredentials = false;
        const canReuseLinkedChannelSession = !isBrowserExternalProvider(normalizedProvider);

        if (hasLinkedSession) {
          try {
            linkedSession = await agentRepo.getSession(String(existing.session_id));
            linkedWallet = await walletRepo.getWalletBySession(String(existing.session_id));
            if (linkedWallet && hasLinkedUser) {
              hasCredentials = await hasOnboardingCredentials(String(existing.session_id), String(existing.user_id), {
                allowExpiredSession: canReuseLinkedChannelSession,
              });
            }
          } catch (error: any) {
            const message = String(error?.message || '').toLowerCase();
            if (!message.includes("could not find the table 'public.wallets' in the schema cache") &&
                !message.includes('relation "wallets" does not exist') &&
                !message.includes('relation public.wallets does not exist')) {
              throw error;
            }
          }
        }

        if (hasLinkedSession && hasLinkedUser && linkedWallet && hasCredentials) {
          if (canReuseLinkedChannelSession && linkedSession && isSessionExpired(linkedSession)) {
            await agentRepo.saveSession(String(existing.session_id), linkedSession as any);
          }
          return res.status(200).json({
            success: true,
            exists: true,
            sessionId: existing.session_id,
            userId: existing.user_id,
            data: existing.data || {},
          });
        }
      }

      if (lookupOnly) {
        return res.status(200).json({
          success: true,
          exists: false,
          onboardingRequired: false,
          reason: 'not_linked',
        });
      }

      const shouldUseLoginOnlyLink = !isBrowserExternalProvider(normalizedProvider);
      const { token, url } = shouldUseLoginOnlyLink
        ? await externalService.createLoginUrlWithShortLink(normalizedProvider, provider_user_id, {
            ...externalData,
            source: normalizedProvider,
            language: req.body?.language,
          })
        : await externalService.createOnboardUrlWithShortLink(normalizedProvider, provider_user_id, externalData);

      return res.status(200).json({
        success: true,
        exists: false,
        onboardingRequired: true,
        reason: 'missing_credentials',
        creationUrl: url,
        loginOnly: shouldUseLoginOnlyLink,
        token,
      });
    } catch (error: any) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ success: false, message: IDENTITY_CONFLICT_MESSAGE });
      }
      return res.status(500).json({
        success: false,
        message: publicErrorMessage(error, 'Não consegui concluir agora. Tente novamente em alguns segundos.'),
      });
    }
  }

  // POST /api/external/link-existing
  // body: { provider, provider_user_id, email, pin }
  static async linkExistingAccount(req: Request, res: Response) {
    try {
      let provider = String(req.body?.provider || '').trim().toLowerCase();
      let providerUserId = String(req.body?.provider_user_id || '').trim();
      const externalToken = String(req.body?.token || '').trim();
      let language = normalizeLanguage(req.body?.language || req.body?.lang || req.body?.locale);
      let email = normalizeEmailForCompare(req.body?.email);
      const pin = String(req.body?.pin || '').trim();
      let externalPayload: any = null;

      if (externalToken) {
        try {
          externalPayload = jwt.verify(externalToken, getJwtSecret());
        } catch {
          return res.status(400).json({ success: false, message: 'Token externo inválido ou expirado.' });
        }

        if (String(externalPayload?.sub || '') !== 'external_onboard') {
          return res.status(400).json({ success: false, message: 'Token externo inválido.' });
        }

        const tokenState = await assertOnboardingLinkReusable(externalToken);
        if (!tokenState.ok) {
          return res.status(tokenState.status).json({ success: false, message: tokenState.message, used: true });
        }

        provider = String(externalPayload?.provider || '').trim().toLowerCase();
        providerUserId = String(externalPayload?.provider_user_id || '').trim();
        language = normalizeLanguage(req.body?.language || externalPayload?.language || externalPayload?.lang || externalPayload?.locale);
      }
      provider = normalizeExternalProvider(provider);
      providerUserId = normalizeExternalProviderUserId(provider, providerUserId);
      const externalData = externalDataFromPayload({
        ...req.body,
        ...(externalPayload || {}),
        provider,
      });

      const reqTag = `[link-existing provider=${provider || 'n/a'} user=${email || 'n/a'} provider_user_id=${providerUserId ? providerUserId.slice(0, 8) + '***' : 'n/a'}]`;

      if (!provider || !providerUserId || !pin) {
        console.warn(`${reqTag} missing required fields`);
        return res.status(400).json({
          success: false,
          message: 'provider, provider_user_id e pin são obrigatórios',
        });
      }

      const providerLabel = isPhoneProvider(provider) ? 'WhatsApp' : provider === 'telegram' ? 'Telegram' : 'canal externo';
      const isBrowserProvider = isBrowserExternalProvider(provider);
      const tokenIdentity = externalPayload
        ? await resolveTokenIdentityLock(externalPayload).catch(() => null)
        : null;
      if (!email && tokenIdentity?.canonicalLogin) {
        email = tokenIdentity.canonicalLogin;
      }
      const identityLock = isBrowserProvider ? null : await resolveExternalIdentityLock(provider, providerUserId);
      if (!email && identityLock?.canonicalLogin) {
        email = identityLock.canonicalLogin;
      }
      if (identityLock?.canonicalLogin && email && email !== identityLock.canonicalLogin) {
        return res.status(409).json({
          success: false,
          notAssociated: true,
          message: `A conta informada não está associada a este ${providerLabel}. Use exatamente o e-mail vinculado originalmente.`,
        });
      }

      let matched: any = null;
      const existingMapping = isBrowserProvider ? null : await externalRepo.findByProviderAndId(provider, providerUserId);
      const mappedSessionId = String(existingMapping?.session_id || '').trim();
      const mappedUserId = String(existingMapping?.user_id || '').trim();
      const mappedData = existingMapping?.data && typeof existingMapping.data === 'object' ? existingMapping.data as Record<string, unknown> : {};
      const mappedEmail = normalizeEmailForCompare(String(mappedData.email || mappedData.user_id || mappedData.userId || ''));
      if (!email && mappedEmail) {
        email = mappedEmail;
      }

      if (mappedSessionId && mappedUserId) {
        const linkedSession = await agentRepo.getSession(mappedSessionId);
        if (!linkedSession) {
          return res.status(409).json({
            success: false,
            notAssociated: true,
            message: `Este ${providerLabel} já está vinculado a outra conta.`,
          });
        }

        if (linkedSession) {
          const linkedEmail = normalizeEmailForCompare((linkedSession as any)?.email);
          const linkedUserId = normalizeEmailForCompare((linkedSession as any)?.user_id);
          const canonicalExternalLogin = linkedEmail || (looksLikeEmail(linkedUserId) ? linkedUserId : '');
          const emailMatchesMappedAccount = canonicalExternalLogin
            ? !email || email === canonicalExternalLogin
            : !email || email === linkedEmail || email === linkedUserId;
          const pinMatchesMappedAccount = verifyPinAgainstSession(pin, linkedSession).valid;

          if (!emailMatchesMappedAccount || !pinMatchesMappedAccount) {
            return res.status(409).json({
              success: false,
              notAssociated: true,
              message: `A conta informada não está associada a este ${providerLabel}. Faça login com a conta já vinculada.`,
            });
          }

          matched = {
            session_id: mappedSessionId,
            user_id: String((linkedSession as any)?.user_id || mappedUserId),
            email: String((linkedSession as any)?.email || ''),
            session_token: String((linkedSession as any)?.session_token || ''),
            password_hash: String((linkedSession as any)?.password_hash || ''),
            session_password_hash: String((linkedSession as any)?.session_password_hash || ''),
            updated_at: String((linkedSession as any)?.updated_at || ''),
            created_at: String((linkedSession as any)?.created_at || ''),
          };
        }
      }

      if (!matched && identityLock?.sessionId) {
        const lockedSession = await agentRepo.getSession(identityLock.sessionId);
        if (lockedSession) {
          const lockedLogin = resolveCanonicalSessionLogin(lockedSession);
          const lockedPinMatches = verifyPinAgainstSession(pin, lockedSession).valid;
          if (lockedLogin && email && email !== lockedLogin) {
            return res.status(409).json({
              success: false,
              notAssociated: true,
              message: `A conta informada não está associada a este ${providerLabel}. Use exatamente o e-mail vinculado originalmente.`,
            });
          }
          if (!lockedPinMatches) {
            return res.status(401).json({
              success: false,
              message: 'PIN inválido para a conta já vinculada a este canal.',
            });
          }
          matched = {
            session_id: String((lockedSession as any)?.session_id || identityLock.sessionId),
            user_id: String((lockedSession as any)?.user_id || identityLock.userId || ''),
            email: String((lockedSession as any)?.email || ''),
            session_token: String((lockedSession as any)?.session_token || ''),
            password_hash: String((lockedSession as any)?.password_hash || ''),
            session_password_hash: String((lockedSession as any)?.session_password_hash || ''),
            updated_at: String((lockedSession as any)?.updated_at || ''),
            created_at: String((lockedSession as any)?.created_at || ''),
          };
        }
      }

      if (!matched && !isBrowserProvider && externalPayload) {
        const tokenSessionId = getTokenSessionId(externalPayload);
        const tokenUserId = getTokenUserId(externalPayload);
        if (tokenSessionId) {
          const tokenSession = await agentRepo.getSession(tokenSessionId);
          if (tokenSession && !isSessionExpired(tokenSession)) {
            const sessionUserId = normalizeEmailForCompare(String((tokenSession as any)?.user_id || ''));
            const sessionEmail = normalizeEmailForCompare(String((tokenSession as any)?.email || ''));
            const tokenMatchesSession = !tokenUserId || tokenUserId === sessionUserId || tokenUserId === sessionEmail;
            if (!tokenMatchesSession) {
              return res.status(409).json({
                success: false,
                notAssociated: true,
                message: `Este link do ${providerLabel} não pertence à conta vinculada.`,
              });
            }

            const tokenPinMatches = verifyPinAgainstSession(pin, tokenSession).valid;
            if (!tokenPinMatches) {
              return res.status(401).json({
                success: false,
                message: 'PIN inválido para esta conta.',
              });
            }

            email = resolveCanonicalSessionLogin(tokenSession) || email;
            matched = {
              session_id: String((tokenSession as any)?.session_id || tokenSessionId),
              user_id: String((tokenSession as any)?.user_id || tokenUserId || ''),
              email: String((tokenSession as any)?.email || ''),
              session_token: String((tokenSession as any)?.session_token || ''),
              password_hash: String((tokenSession as any)?.password_hash || ''),
              session_password_hash: String((tokenSession as any)?.session_password_hash || ''),
              updated_at: String((tokenSession as any)?.updated_at || ''),
              created_at: String((tokenSession as any)?.created_at || ''),
            };
          }
        }
      }

      if (!matched) {
        if (!email) {
          console.warn(`${reqTag} no mapped session and no email fallback.`);
          return res.status(401).json({
            success: false,
            message: provider === 'telegram'
              ? 'Este Telegram ainda não está vinculado a uma conta. Abra o cadastro enviado no chat para vincular primeiro.'
              : 'E-mail ou PIN inválido.',
          });
        }
        const [sessionsByEmailResp, sessionsByUserIdResp] = await Promise.all([
          supabase
            .from('agent_sessions')
            .select('session_id, user_id, email, session_token, password_hash, session_password_hash, updated_at, created_at')
            .eq('email', email)
            .order('updated_at', { ascending: false })
            .limit(20),
          supabase
            .from('agent_sessions')
            .select('session_id, user_id, email, session_token, password_hash, session_password_hash, updated_at, created_at')
            .eq('user_id', email)
            .order('updated_at', { ascending: false })
            .limit(20),
        ]);

        if (sessionsByEmailResp.error) {
          console.error(`${reqTag} sessionsByEmail query error: ${sessionsByEmailResp.error.message}`);
          return res.status(500).json({ success: false, message: publicErrorMessage(sessionsByEmailResp.error) });
        }
        if (sessionsByUserIdResp.error) {
          console.error(`${reqTag} sessionsByUserId query error: ${sessionsByUserIdResp.error.message}`);
          return res.status(500).json({ success: false, message: publicErrorMessage(sessionsByUserIdResp.error) });
        }

        const dedupeBySessionId = new Map<string, any>();
        for (const row of [...(sessionsByEmailResp.data || []), ...(sessionsByUserIdResp.data || [])]) {
          if (row?.session_id) {
            dedupeBySessionId.set(String(row.session_id), row);
          }
        }

        // Fallback: recover sessions from existing external mappings by user_id/email
        const { data: mappedRows } = await supabase
          .from('external_accounts')
          .select('session_id, user_id')
          .eq('user_id', email)
          .limit(20);

        const mappedSessionIds = (mappedRows || [])
          .map((row: any) => String(row?.session_id || '').trim())
          .filter(Boolean);

        if (mappedSessionIds.length > 0) {
          const { data: mappedSessions } = await supabase
            .from('agent_sessions')
            .select('session_id, user_id, email, session_token, password_hash, session_password_hash, updated_at, created_at')
            .in('session_id', mappedSessionIds)
            .order('updated_at', { ascending: false })
            .limit(20);

          for (const row of mappedSessions || []) {
            if (row?.session_id) {
              dedupeBySessionId.set(String(row.session_id), row);
            }
          }
        }

        const sessions = Array.from(dedupeBySessionId.values()).sort((a: any, b: any) => {
          const aTime = new Date(a?.updated_at || a?.created_at || 0).getTime();
          const bTime = new Date(b?.updated_at || b?.created_at || 0).getTime();
          return bTime - aTime;
        });
        console.info(`${reqTag} candidates resolved: email=${(sessionsByEmailResp.data || []).length}, user_id=${(sessionsByUserIdResp.data || []).length}, mapped=${mappedSessionIds.length}, merged=${sessions.length}`);

        matched = sessions.find((session: any) => {
          return verifyPinAgainstSession(pin, session).valid;
        });
      }

      if (!matched?.session_id) {
        console.warn(`${reqTag} pin mismatch or account not found for provided email.`);
        return res.status(401).json({
          success: false,
          message: 'E-mail ou PIN inválido.',
        });
      }
      console.info(`${reqTag} matched session_id=${String(matched.session_id)} user_id=${String(matched.user_id || email)}`);
      await rehashSessionPinIfNeeded(String(matched.session_id), pin, matched).catch((error) => {
        console.warn(`${reqTag} could not migrate PIN hash: ${error instanceof Error ? error.message : String(error)}`);
      });

      const targetSessionId = String(matched.session_id);
      const targetUserId = String(matched.user_id || email || providerUserId);
      const targetEmail = String(matched.email || email || '');
      if (identityLock?.sessionId && identityLock.sessionId !== targetSessionId) {
        return res.status(409).json({
          success: false,
          notAssociated: true,
          message: `A conta informada não está associada a este ${providerLabel}.`,
        });
      }
      if (identityLock?.userId && normalizeEmailForCompare(identityLock.userId) !== normalizeEmailForCompare(targetUserId)) {
        return res.status(409).json({
          success: false,
          notAssociated: true,
          message: `A conta informada não está associada a este ${providerLabel}.`,
        });
      }
      const confirmedMapping = isBrowserProvider ? null : await externalRepo.findByProviderAndId(provider, providerUserId);
      const ownerSessionId = String(confirmedMapping?.session_id || '').trim();
      const ownerUserId = String(confirmedMapping?.user_id || '').trim();
      if ((ownerSessionId && ownerSessionId !== targetSessionId) || (ownerUserId && ownerUserId !== targetUserId)) {
        return res.status(409).json({
          success: false,
          message: `Este ${providerLabel} já está vinculado a outra conta.`,
        });
      }

      const confirmationEmail = normalizeEmailForCompare(targetEmail)
        || (looksLikeEmail(targetUserId) ? normalizeEmailForCompare(targetUserId) : '');
      const emailConfirmed = await ensureEmailConfirmation(req, res, {
        email: confirmationEmail,
        purpose: 'login',
        language,
        metadata: {
          provider,
          provider_user_id: providerUserId,
          session_id: targetSessionId,
          user_id: targetUserId,
        },
      });
      if (!emailConfirmed) return;

      const wallet = await walletRepo.getWalletBySession(targetSessionId);
      await agentRepo.saveSession(targetSessionId, {
        ...matched,
        user_id: targetUserId,
        email: targetEmail,
        public_key: wallet?.public_key || undefined,
      } as any);

      await supabase
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
        .eq('session_id', targetSessionId);

      await createExternalMappingWithAliases({
        provider,
        provider_user_id: providerUserId,
        session_id: targetSessionId,
        user_id: targetUserId,
        data: externalData,
      });

      const displayName = String(targetEmail || targetUserId || providerUserId);
      void TransferNotificationService.notifySessionWelcome({
        sessionId: String(matched.session_id),
        userId: targetUserId,
        name: displayName,
        provider,
        providerUserId,
        language,
      }).catch((welcomeError) => {
        console.warn('[external-link-existing] welcome notification failed:', welcomeError instanceof Error ? welcomeError.message : String(welcomeError));
      });

      return res.status(200).json({
        success: true,
        linked: true,
        exists: true,
        sessionId: String(matched.session_id),
        sessionToken: String(matched.session_token || ''),
        userId: targetUserId,
        email: targetEmail,
        provider,
        providerUserId,
        publicKey: wallet?.public_key || undefined,
      });
    } catch (error: any) {
      const message = error?.message || String(error);
      return res.status(500).json({ success: false, message });
    }
  }

  // POST /api/external/link-session
  // body: { token, session_id, session_token }
  static async linkSessionToExternalAccount(req: Request, res: Response) {
    try {
      const token = String(req.body?.token || '').trim();
      const sessionId = String(req.body?.session_id || '').trim();
      const sessionToken = String(req.body?.session_token || '').trim();
      const language = normalizeLanguage(req.body?.language || req.body?.lang || req.body?.locale);

      if (!token || !sessionId || !sessionToken) {
        return res.status(400).json({
          success: false,
          message: 'token, session_id e session_token são obrigatórios',
        });
      }

      let payload: any;
      try {
        payload = jwt.verify(token, getJwtSecret());
      } catch {
        return res.status(400).json({ success: false, message: 'Token externo inválido ou expirado.' });
      }

      if (String(payload?.sub || '') !== 'external_onboard') {
        return res.status(400).json({ success: false, message: 'Token externo inválido.' });
      }

      const tokenState = await assertOnboardingLinkReusable(token);
      if (!tokenState.ok) {
        return res.status(tokenState.status).json({ success: false, message: tokenState.message, used: true });
      }

      const provider = String(payload?.provider || '').trim().toLowerCase();
      const providerUserId = normalizeExternalProviderUserId(provider, String(payload?.provider_user_id || '').trim());
      const externalData = externalDataFromPayload(payload);
      if (!provider || !providerUserId) {
        return res.status(400).json({ success: false, message: 'Token externo sem provider.' });
      }

      const session = await agentRepo.getSession(sessionId);
      if (!session?.user_id) {
        return res.status(401).json({ success: false, message: 'Sessão não encontrada.' });
      }

      if (String(session.session_token || '').trim() !== sessionToken) {
        return res.status(401).json({ success: false, message: 'Sessão inválida.' });
      }

      if (isSessionExpired(session)) {
        return res.status(401).json({ success: false, message: 'Sessão expirada. Entre novamente.' });
      }

      await agentRepo.saveSession(sessionId, session as any);
      const providerLabel = isPhoneProvider(provider) ? 'WhatsApp' : provider === 'telegram' ? 'Telegram' : 'canal externo';
      const isBrowserProvider = isBrowserExternalProvider(provider);
      const identityLock = isBrowserProvider ? null : await resolveExternalIdentityLock(provider, providerUserId);
      const sessionLogin = resolveCanonicalSessionLogin(session);
      const sessionUserId = normalizeEmailForCompare(String(session.user_id || ''));
      if (identityLock?.canonicalLogin && sessionLogin && identityLock.canonicalLogin !== sessionLogin) {
        return res.status(409).json({
          success: false,
          notAssociated: true,
          message: `A conta informada não está associada a este ${providerLabel}. Use exatamente o e-mail vinculado originalmente.`,
        });
      }
      if (identityLock?.sessionId && identityLock.sessionId !== sessionId) {
        return res.status(409).json({
          success: false,
          notAssociated: true,
          message: `Este ${providerLabel} já está vinculado a outra conta.`,
        });
      }
      if (identityLock?.userId && normalizeEmailForCompare(identityLock.userId) !== sessionUserId) {
        return res.status(409).json({
          success: false,
          notAssociated: true,
          message: `Este ${providerLabel} já está vinculado a outra conta.`,
        });
      }

      const existingMapping = isBrowserProvider ? null : await externalRepo.findByProviderAndId(provider, providerUserId);
      const ownerSessionId = String(existingMapping?.session_id || '').trim();
      const ownerUserId = String(existingMapping?.user_id || '').trim();
      if ((ownerSessionId && ownerSessionId !== sessionId) || (ownerUserId && ownerUserId !== String(session.user_id || ''))) {
        return res.status(409).json({
          success: false,
          message: `Este ${providerLabel} já está vinculado a outra conta.`,
        });
      }

      await createExternalMappingWithAliases({
        provider,
        provider_user_id: providerUserId,
        session_id: sessionId,
        user_id: String(session.user_id),
        data: externalData,
      });

      await supabase
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
        .eq('session_id', sessionId);

      void TransferNotificationService.notifySessionWelcome({
        sessionId,
        userId: String(session.user_id),
        name: String(session.email || session.user_id),
        provider,
        providerUserId,
        language,
      }).catch((welcomeError) => {
        console.warn('[external-link-session] welcome notification failed:', welcomeError instanceof Error ? welcomeError.message : String(welcomeError));
      });

      return res.status(200).json({
        success: true,
        linked: true,
        exists: true,
        provider,
        sessionId,
        userId: String(session.user_id),
      });
    } catch (error: any) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ success: false, message: IDENTITY_CONFLICT_MESSAGE });
      }
      return res.status(500).json({
        success: false,
        message: publicErrorMessage(error, 'Não consegui concluir agora. Tente novamente em alguns segundos.'),
      });
    }
  }
}

export default ExternalController;
