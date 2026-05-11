import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../../config/supabase';
import ExternalService from '../../services/external.service';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletRepository } from '../../repositories/wallet.repository';
import PasskeyService from '../../services/passkey.service';
import { ExternalRepository } from '../../repositories/external.repository';
import { TransferNotificationService } from '../services/transfer-notification.service';
import { isSessionExpired } from '../../utils/session-expiry';

const externalService = new ExternalService(supabase);
const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);
const externalRepo = new ExternalRepository(supabase);

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
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
      const forceNewAccount = Boolean(req.body?.force_new_account || req.body?.forceNewAccount);
      const normalizeExternalId = (prov: string, value: string) => {
        if (String(prov || '').toLowerCase() === 'whatsapp' || String(prov || '').toLowerCase() === 'phone') {
          return String(value || '').replace(/\D+/g, '');
        }
        return String(value || '').trim();
      };
      const provider_user_id = normalizeExternalId(String(provider || ''), String(req.body?.provider_user_id || ''));

      if (!provider || !provider_user_id) {
        return res.status(400).json({ success: false, message: 'provider and provider_user_id required' });
      }

      let existing = null;
      try {
        existing = await externalService.checkExternalAccount(provider, provider_user_id);
        if (!existing && String(provider).toLowerCase() === 'whatsapp') {
          existing = await externalService.checkExternalAccount('phone', provider_user_id);
        }
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

      const { token, url } = externalService.createOnboardUrl(provider, provider_user_id);

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
      const email = String(req.body?.email || '').trim().toLowerCase();
      const pin = String(req.body?.pin || '').trim();

      if (externalToken) {
        let externalPayload: any;
        try {
          externalPayload = jwt.verify(externalToken, getJwtSecret());
        } catch {
          return res.status(400).json({ success: false, message: 'Token externo inválido ou expirado.' });
        }

        if (String(externalPayload?.sub || '') !== 'external_onboard') {
          return res.status(400).json({ success: false, message: 'Token externo inválido.' });
        }

        provider = String(externalPayload?.provider || '').trim().toLowerCase();
        providerUserId = String(externalPayload?.provider_user_id || '').trim();
      }

      const reqTag = `[link-existing provider=${provider || 'n/a'} user=${email || 'n/a'} provider_user_id=${providerUserId ? providerUserId.slice(0, 8) + '***' : 'n/a'}]`;

      if (!provider || !providerUserId || !email || !pin) {
        console.warn(`${reqTag} missing required fields`);
        return res.status(400).json({
          success: false,
          message: 'provider, provider_user_id, email e pin são obrigatórios',
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

      const pinHash = crypto
        .pbkdf2Sync(pin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
        .toString('hex');

      const matched = sessions.find((session: any) => {
        const s1 = String(session?.session_password_hash || '').trim();
        const s2 = String(session?.password_hash || '').trim();
        return (s1 && s1 === pinHash) || (s2 && s2 === pinHash);
      });

      if (!matched?.session_id) {
        const hashPresence = sessions.slice(0, 5).map((session: any) => ({
          session_id: String(session?.session_id || ''),
          has_session_password_hash: Boolean(String(session?.session_password_hash || '').trim()),
          has_password_hash: Boolean(String(session?.password_hash || '').trim()),
          email: String(session?.email || ''),
          user_id: String(session?.user_id || ''),
        }));
        console.warn(`${reqTag} pin mismatch for ${sessions.length} candidate session(s). top_candidates=${JSON.stringify(hashPresence)}`);
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

      await externalRepo.createMapping({
        provider,
        provider_user_id: providerUserId,
        session_id: String(matched.session_id),
        user_id: String(matched.user_id || email),
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

      const provider = String(payload?.provider || '').trim().toLowerCase();
      const providerUserId = String(payload?.provider_user_id || '').trim();
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

      await externalRepo.createMapping({
        provider,
        provider_user_id: providerUserId,
        session_id: sessionId,
        user_id: String(session.user_id),
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
