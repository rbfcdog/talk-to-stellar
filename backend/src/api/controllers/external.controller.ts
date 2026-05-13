import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../../config/supabase';
import ExternalService from '../../services/external.service';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletRepository } from '../../repositories/wallet.repository';
import PasskeyService from '../../services/passkey.service';
import {
  ExternalRepository,
  externalProviderAliases,
  isPhoneProvider,
  normalizeExternalProvider,
  normalizeExternalProviderUserId,
} from '../../repositories/external.repository';
import { TransferNotificationService } from '../services/transfer-notification.service';
import { isSessionExpired } from '../../utils/session-expiry';

const externalService = new ExternalService(supabase);
const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);
const externalRepo = new ExternalRepository(supabase);

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
  for (const provider of providers) {
    await externalRepo.createMapping({
      provider,
      provider_user_id: normalizedProviderUserId,
      session_id: payload.session_id,
      user_id: payload.user_id,
      data: payload.data || {},
    });
  }
}

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function normalizeEmailForCompare(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function looksLikeEmail(value?: string): boolean {
  const normalized = normalizeEmailForCompare(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

type ExternalIdentityLock = {
  sessionId?: string;
  userId?: string;
  canonicalLogin?: string;
};

async function readOnboardingLinkState(hash: string) {
  const { data, error } = await supabase
    .from('onboarding_finalizations')
    .select('used, used_at, status')
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

async function resolveExternalIdentityLock(provider: string, providerUserId: string): Promise<ExternalIdentityLock | null> {
  const normalizedProvider = normalizeExternalProvider(provider);
  const normalizedProviderUserId = normalizeExternalProviderUserId(normalizedProvider, providerUserId);
  if (!normalizedProvider || !normalizedProviderUserId) return null;

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
    .limit(1)
    .maybeSingle();

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('onboarding_finalizations') || message.includes('schema cache') || message.includes('does not exist')) {
      return null;
    }
    throw error;
  }

  const status = String((data as any)?.status || '').trim().toLowerCase();
  const used = Boolean((data as any)?.used);
  if (!used && status !== 'completed') return null;

  const fallbackSessionId = String((data as any)?.session_id || (data as any)?.result?.sessionId || '').trim();
  const fallbackUserId = normalizeEmailForCompare(String((data as any)?.user_id || (data as any)?.result?.userId || ''));

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
  const data: Record<string, unknown> = {};
  if (provider === 'telegram' && chatId) {
    data.telegram_chat_id = chatId;
    data.chat_id = chatId;
  }
  if (provider === 'telegram' && username) {
    data.telegram_username = username;
    data.username = username;
  }
  return data;
}

async function hasOnboardingCredentials(sessionId: string, userId: string): Promise<boolean> {
  const session = await agentRepo.getSession(sessionId);
  if (!session) {
    return false;
  }

  if (isSessionExpired(session)) {
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

export class ExternalController {
  // POST /api/external/check-account
  static async checkAccount(req: Request, res: Response) {
    try {
      const { provider } = req.body;
      const externalData = externalDataFromPayload(req.body);
      const forceNewAccount = Boolean(req.body?.force_new_account || req.body?.forceNewAccount);
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
        let hasCredentials = false;

        if (hasLinkedSession) {
          try {
            linkedWallet = await walletRepo.getWalletBySession(String(existing.session_id));
            if (linkedWallet && hasLinkedUser) {
              hasCredentials = await hasOnboardingCredentials(String(existing.session_id), String(existing.user_id));
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
          return res.status(200).json({
            success: true,
            exists: true,
            sessionId: existing.session_id,
            userId: existing.user_id,
            data: existing.data || {},
          });
        }
      }

      const { token, url } = await externalService.createOnboardUrlWithShortLink(normalizedProvider, provider_user_id, externalData);

      return res.status(200).json({
        success: true,
        exists: false,
        onboardingRequired: true,
        reason: 'missing_credentials',
        creationUrl: url,
        token,
      });
    } catch (error: any) {
      const message = error?.message || String(error);
      return res.status(500).json({ success: false, message });
    }
  }

  // POST /api/external/link-existing
  // body: { provider, provider_user_id, email, pin }
  static async linkExistingAccount(req: Request, res: Response) {
    try {
      let provider = String(req.body?.provider || '').trim().toLowerCase();
      let providerUserId = String(req.body?.provider_user_id || '').trim();
      const externalToken = String(req.body?.token || '').trim();
      const email = normalizeEmailForCompare(req.body?.email);
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
      }
      provider = normalizeExternalProvider(provider);
      providerUserId = normalizeExternalProviderUserId(provider, providerUserId);
      const externalData = externalDataFromPayload({
        ...req.body,
        ...(externalPayload || {}),
        provider,
      });

      const reqTag = `[link-existing provider=${provider || 'n/a'} user=${email || 'n/a'} provider_user_id=${providerUserId ? providerUserId.slice(0, 8) + '***' : 'n/a'}]`;

      if (!provider || !providerUserId || !email || !pin) {
        console.warn(`${reqTag} missing required fields`);
        return res.status(400).json({
          success: false,
          message: 'provider, provider_user_id, email e pin são obrigatórios',
        });
      }

      const pinHash = crypto
        .pbkdf2Sync(pin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
        .toString('hex');
      const providerLabel = isPhoneProvider(provider) ? 'WhatsApp' : provider === 'telegram' ? 'Telegram' : 'canal externo';
      const identityLock = await resolveExternalIdentityLock(provider, providerUserId);
      if (identityLock?.canonicalLogin && email !== identityLock.canonicalLogin) {
        return res.status(409).json({
          success: false,
          notAssociated: true,
          message: `A conta informada não está associada a este ${providerLabel}. Use exatamente o e-mail vinculado originalmente.`,
        });
      }

      let matched: any = null;
      const existingMapping = await externalRepo.findByProviderAndId(provider, providerUserId);
      const mappedSessionId = String(existingMapping?.session_id || '').trim();
      const mappedUserId = String(existingMapping?.user_id || '').trim();

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
            ? email === canonicalExternalLogin
            : email === linkedEmail || email === linkedUserId;
          const linkedHash1 = String((linkedSession as any)?.session_password_hash || '').trim();
          const linkedHash2 = String((linkedSession as any)?.password_hash || '').trim();
          const pinMatchesMappedAccount = (linkedHash1 && linkedHash1 === pinHash) || (linkedHash2 && linkedHash2 === pinHash);

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
          const lockedHash1 = String((lockedSession as any)?.session_password_hash || '').trim();
          const lockedHash2 = String((lockedSession as any)?.password_hash || '').trim();
          const lockedPinMatches = (lockedHash1 && lockedHash1 === pinHash) || (lockedHash2 && lockedHash2 === pinHash);
          if (lockedLogin && email !== lockedLogin) {
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

      if (!matched) {
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
          return res.status(500).json({ success: false, message: sessionsByEmailResp.error.message });
        }
        if (sessionsByUserIdResp.error) {
          console.error(`${reqTag} sessionsByUserId query error: ${sessionsByUserIdResp.error.message}`);
          return res.status(500).json({ success: false, message: sessionsByUserIdResp.error.message });
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
          const s1 = String(session?.session_password_hash || '').trim();
          const s2 = String(session?.password_hash || '').trim();
          return (s1 && s1 === pinHash) || (s2 && s2 === pinHash);
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

      const wallet = await walletRepo.getWalletBySession(String(matched.session_id));
      await agentRepo.saveSession(String(matched.session_id), {
        ...matched,
        user_id: String(matched.user_id || email),
        email: String(matched.email || email),
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
        .eq('session_id', String(matched.session_id));

      const targetSessionId = String(matched.session_id);
      const targetUserId = String(matched.user_id || email);
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
      const confirmedMapping = await externalRepo.findByProviderAndId(provider, providerUserId);
      const ownerSessionId = String(confirmedMapping?.session_id || '').trim();
      const ownerUserId = String(confirmedMapping?.user_id || '').trim();
      if ((ownerSessionId && ownerSessionId !== targetSessionId) || (ownerUserId && ownerUserId !== targetUserId)) {
        return res.status(409).json({
          success: false,
          message: `Este ${providerLabel} já está vinculado a outra conta.`,
        });
      }

      await createExternalMappingWithAliases({
        provider,
        provider_user_id: providerUserId,
        session_id: targetSessionId,
        user_id: targetUserId,
        data: externalData,
      });

      const shouldAwaitWelcome = provider === 'telegram';
      const welcomePromise = TransferNotificationService.notifySessionWelcome({
        sessionId: String(matched.session_id),
        userId: String(matched.user_id || email),
        name: String(matched.email || email),
        provider,
        providerUserId,
      });
      if (shouldAwaitWelcome) {
        await welcomePromise;
      } else {
        void welcomePromise;
      }

      return res.status(200).json({
        success: true,
        linked: true,
        exists: true,
        sessionId: String(matched.session_id),
        sessionToken: String(matched.session_token || ''),
        userId: String(matched.user_id || email),
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
      const identityLock = await resolveExternalIdentityLock(provider, providerUserId);
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

      const existingMapping = await externalRepo.findByProviderAndId(provider, providerUserId);
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

      const shouldAwaitWelcome = provider === 'telegram';
      const welcomePromise = TransferNotificationService.notifySessionWelcome({
        sessionId,
        userId: String(session.user_id),
        name: String(session.email || session.user_id),
        provider,
        providerUserId,
      });
      if (shouldAwaitWelcome) {
        await welcomePromise;
      } else {
        void welcomePromise;
      }

      return res.status(200).json({
        success: true,
        linked: true,
        exists: true,
        provider,
        sessionId,
        userId: String(session.user_id),
      });
    } catch (error: any) {
      const message = error?.message || String(error);
      return res.status(500).json({ success: false, message });
    }
  }
}

export default ExternalController;
