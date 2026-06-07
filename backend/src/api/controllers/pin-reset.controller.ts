import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PinResetService } from '../services/core/pin-reset.service';
import { logger } from '../../utils/logger';
import { supabase } from '../../config/supabase';
import { isSessionExpired } from '../../utils/session-expiry';
import { hashWalletPin } from '../../utils/pin-hash';
import { getRequiredJwtSecret } from '../../config/secrets';
import {
  ExternalRepository,
  normalizeExternalProvider,
  normalizeExternalProviderUserId,
} from '../repository/core/external.repository';

const externalRepo = new ExternalRepository(supabase as any);

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerToken(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function isInternalRequest(req: Request): boolean {
  const expected = String(process.env.INTERNAL_API_SECRET || '').trim();
  if (!expected) return false;
  const provided = String(req.headers['x-internal-api-secret'] || '').trim() || readBearerToken(req);
  return Boolean(provided) && timingSafeEqualString(provided, expected);
}

function readSessionToken(req: Request): string {
  return String(
    req.body?.session_token ||
    req.body?.sessionToken ||
    req.headers['x-session-token'] ||
    req.headers['x-talktostellar-session-token'] ||
    ''
  ).trim();
}

function normalizeIdentity(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function looksLikeEmail(value: unknown): boolean {
  const normalized = normalizeIdentity(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function missingTableError(error: any, tableName: string): boolean {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes(`relation "${tableName}" does not exist`) ||
    message.includes(`relation public.${tableName} does not exist`) ||
    message.includes(`could not find the table 'public.${tableName}'`) ||
    (message.includes(tableName) && message.includes('schema cache'))
  );
}

function normalizeLanguage(value: unknown): 'pt-BR' | 'en' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english')) return 'en';
  return 'pt-BR';
}

async function loadSession(sessionId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('session_id, user_id, email, session_token, last_activity, created_at')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load session: ${error.message}`);
  }
  return data || null;
}

function withRecoveryEmail(session: any | null, email: string): any | null {
  if (!session?.session_id) return session;
  const normalizedEmail = normalizeIdentity(email);
  if (!looksLikeEmail(normalizedEmail)) return session;
  return {
    ...session,
    recovery_email: normalizedEmail,
  };
}

function resetEmailForSession(session: any, fallbackIdentity?: string): string | undefined {
  const candidates = [
    session?.recovery_email,
    session?.reset_email,
    session?.email,
    session?.user_id,
    fallbackIdentity,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIdentity(candidate);
    if (looksLikeEmail(normalized)) return normalized;
  }
  return undefined;
}

async function loadLatestSessionByUserId(userId: string, recoveryEmail?: string): Promise<any | null> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;

  const { data, error } = await supabase
    .from('agent_sessions')
    .select('session_id, user_id, email, session_token, last_activity, created_at, updated_at')
    .eq('user_id', normalizedUserId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load recoverable session by user_id: ${error.message}`);
  }
  if (!data?.session_id) return null;
  return withRecoveryEmail(data, recoveryEmail || '');
}

async function loadLatestSessionFromExternalEmail(identity: string): Promise<any | null> {
  const normalizedIdentity = normalizeIdentity(identity);
  if (!looksLikeEmail(normalizedIdentity)) return null;

  const { data, error } = await supabase
    .from('external_accounts')
    .select('session_id, user_id, data')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    if (missingTableError(error, 'external_accounts')) return null;
    throw new Error(`Failed to load recoverable external identity: ${error.message}`);
  }

  for (const row of data || []) {
    const rowData = (row as any)?.data && typeof (row as any).data === 'object' ? (row as any).data : {};
    const rowEmail = normalizeIdentity(rowData.email || rowData.user_id || rowData.userId || (row as any)?.user_id || '');
    if (rowEmail !== normalizedIdentity) continue;

    const sessionId = String((row as any)?.session_id || '').trim();
    if (sessionId) {
      const session = await loadSession(sessionId);
      if (session?.session_id) return withRecoveryEmail(session, normalizedIdentity);
    }

    const userSession = await loadLatestSessionByUserId(String((row as any)?.user_id || '').trim(), normalizedIdentity);
    if (userSession?.session_id) return userSession;
  }

  return null;
}

async function loadLatestSessionFromUserEmail(identity: string): Promise<any | null> {
  const normalizedIdentity = normalizeIdentity(identity);
  if (!looksLikeEmail(normalizedIdentity)) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', normalizedIdentity)
    .maybeSingle();

  if (error) {
    if (missingTableError(error, 'users')) return null;
    throw new Error(`Failed to load recoverable user identity: ${error.message}`);
  }

  const userId = String((data as any)?.id || '').trim();
  const userEmail = normalizeIdentity((data as any)?.email || normalizedIdentity);
  if (!userId) return null;

  return await loadLatestSessionByUserId(userId, userEmail);
}

async function loadLatestSessionByIdentity(identity: string): Promise<any | null> {
  const normalizedIdentity = normalizeIdentity(identity);
  if (!normalizedIdentity) return null;

  const columns = looksLikeEmail(normalizedIdentity) ? ['email', 'user_id'] : ['user_id', 'email'];
  for (const column of columns) {
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, email, session_token, last_activity, created_at, updated_at')
      .eq(column, normalizedIdentity)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load recoverable session: ${error.message}`);
    }
    if (data?.session_id) return withRecoveryEmail(data, looksLikeEmail(normalizedIdentity) ? normalizedIdentity : '');
  }

  const externalSession = await loadLatestSessionFromExternalEmail(normalizedIdentity);
  if (externalSession?.session_id) return externalSession;

  const userEmailSession = await loadLatestSessionFromUserEmail(normalizedIdentity);
  if (userEmailSession?.session_id) return userEmailSession;

  return null;
}

function readExternalPayload(req: Request): any | null {
  const token = String(req.body?.token || req.body?.external_token || '').trim();
  if (!token) return null;

  const payload = jwt.verify(token, getRequiredJwtSecret()) as any;
  if (String(payload?.sub || '') !== 'external_onboard') {
    throw new Error('Invalid external login token.');
  }
  return payload;
}

async function resolveLoginRecoverySession(req: Request): Promise<any | null> {
  let payload: any | null = null;
  try {
    payload = readExternalPayload(req);
  } catch {
    throw new Error('Invalid or expired recovery link. Request a new login link and try again.');
  }

  const provider = normalizeExternalProvider(String(req.body?.provider || payload?.provider || '').trim());
  const providerUserId = normalizeExternalProviderUserId(
    provider,
    String(req.body?.provider_user_id || payload?.provider_user_id || '').trim()
  );
  const requestedEmail = normalizeIdentity(
    req.body?.email ||
      req.body?.user_id ||
      payload?.email ||
      payload?.user_id ||
      payload?.userId ||
      payload?.owner_id ||
      payload?.ownerId ||
      ''
  );

  const tokenSessionId = String(payload?.session_id || payload?.sessionId || '').trim();
  if (tokenSessionId) {
    const tokenSession = await loadSession(tokenSessionId);
    if (tokenSession?.session_id) {
      const sessionEmail = normalizeIdentity(tokenSession.email);
      const sessionUserId = normalizeIdentity(tokenSession.user_id);
      if (!requestedEmail || requestedEmail === sessionEmail || requestedEmail === sessionUserId) {
        return withRecoveryEmail(tokenSession, requestedEmail);
      }
    }
  }

  const useExternalMapping = provider && providerUserId && provider !== 'web' && provider !== 'browser';
  if (useExternalMapping) {
    const mapping = await externalRepo.findByProviderAndId(provider, providerUserId);
    const mappingData = mapping?.data && typeof mapping.data === 'object' ? mapping.data as Record<string, unknown> : {};
    const mappingEmail = normalizeIdentity(mappingData.email || mappingData.user_id || mappingData.userId || mapping?.user_id || '');
    if (mapping?.session_id) {
      const mappedSession = await loadSession(String(mapping.session_id));
      if (mappedSession?.session_id) {
        const sessionEmail = normalizeIdentity(mappedSession.email);
        const sessionUserId = normalizeIdentity(mappedSession.user_id);
        if (!requestedEmail || requestedEmail === sessionEmail || requestedEmail === sessionUserId || requestedEmail === mappingEmail) {
          return withRecoveryEmail(mappedSession, mappingEmail || requestedEmail);
        }
      }
    }
    const mappedIdentity = normalizeIdentity(mapping?.user_id || mappingEmail);
    if (mappedIdentity) {
      const mappedSession = await loadLatestSessionByIdentity(mappedIdentity);
      if (mappedSession?.session_id) return mappedSession;
    }
  }

  if (requestedEmail) {
    return await loadLatestSessionByIdentity(requestedEmail);
  }

  return null;
}

function wantsLoginRecovery(req: Request): boolean {
  return Boolean(
    req.body?.forgot_pin ||
      req.body?.login_recovery ||
      req.body?.recovery ||
      req.body?.token ||
      req.body?.external_token ||
      req.body?.email ||
      req.body?.provider_user_id
  );
}

function genericRecoveryMessage(language: 'pt-BR' | 'en', maskedEmail?: string): string {
  if (language === 'en') {
    return maskedEmail
      ? `If this account exists, we sent the PIN setup link to ${maskedEmail}.`
      : 'If this account exists, we sent the PIN setup link by email.';
  }
  return maskedEmail
    ? `Se esta conta existir, enviamos o link de configuração do PIN para ${maskedEmail}.`
    : 'Se esta conta existir, enviamos o link de configuração do PIN por e-mail.';
}

export class PinResetController {
  /**
   * Initiate PIN reset - Generate temporary reset token
   * POST /api/security/reset-pin-init
   */
  static async initiatePinReset(req: Request, res: Response) {
    try {
      const { user_id, session_id } = req.body;
      const language = normalizeLanguage(req.body?.language || req.headers['accept-language']);
      const loginRecovery = wantsLoginRecovery(req);

      if (!session_id && !loginRecovery) {
        return res.status(400).json({
          success: false,
          message: 'session_id is required',
        });
      }

      const session = session_id ? await loadSession(String(session_id)) : null;
      if (!session && !loginRecovery) {
        return res.status(404).json({
          success: false,
          message: 'Session not found',
        });
      }
      if (session && isSessionExpired(session) && !loginRecovery) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Sign in again before resetting your PIN.',
        });
      }

      const providedSessionToken = readSessionToken(req);
      const storedSessionToken = String(session?.session_token || '').trim();
      const authorizedBySession =
        Boolean(providedSessionToken && storedSessionToken) &&
        timingSafeEqualString(providedSessionToken, storedSessionToken);

      if (session && !isSessionExpired(session) && (authorizedBySession || isInternalRequest(req))) {
        const requestedUserId = normalizeIdentity(user_id);
        const sessionUserId = normalizeIdentity(session.user_id);
        const sessionEmail = normalizeIdentity(session.email);
        const resolvedUserId = String(user_id || session.user_id || session.email || '').trim();

        if (!resolvedUserId) {
          return res.status(409).json({
            success: false,
            message: 'Session does not have a recoverable user identity.',
          });
        }

        if (requestedUserId && requestedUserId !== sessionUserId && requestedUserId !== sessionEmail) {
          return res.status(403).json({
            success: false,
            message: 'Requested user_id does not match the authenticated session.',
          });
        }

        const resetData = await PinResetService.generateResetToken(
          resolvedUserId,
          String(session.session_id || session_id),
          {
            email: resetEmailForSession(session, resolvedUserId),
            language,
          }
        );

        logger.info(`PIN reset initiated for session ${session.session_id || session_id}`);

        return res.status(200).json({
          success: true,
          message: resetData.email_sent && resetData.masked_email
            ? language === 'en'
              ? `Email sent to ${resetData.masked_email}. The link is valid for ${resetData.expires_in_minutes} minutes.`
              : `E-mail enviado para ${resetData.masked_email}. O link vale por ${resetData.expires_in_minutes} minutos.`
            : language === 'en'
              ? `Reset link generated. Valid for ${resetData.expires_in_minutes} minutes.`
              : `Link de redefinição gerado. Válido por ${resetData.expires_in_minutes} minutos.`,
          reset_url: resetData.reset_url,
          expires_in_minutes: resetData.expires_in_minutes,
          email_sent: Boolean(resetData.email_sent),
          masked_email: resetData.masked_email,
        });
      }

      if (!loginRecovery) {
        return res.status(401).json({
          success: false,
          message: 'Valid session_token or internal authorization is required to initiate PIN reset.',
        });
      }

      const recoverySession = session && (authorizedBySession || isInternalRequest(req))
        ? session
        : await resolveLoginRecoverySession(req);
      if (!recoverySession?.session_id) {
        return res.status(200).json({
          success: true,
          message: genericRecoveryMessage(language),
          email_sent: true,
        });
      }

      const resolvedUserId = String(recoverySession.user_id || recoverySession.email || '').trim();
      if (!resolvedUserId) {
        return res.status(200).json({
          success: true,
          message: genericRecoveryMessage(language),
          email_sent: true,
        });
      }

      const resetData = await PinResetService.generateResetToken(
        resolvedUserId,
        String(recoverySession.session_id),
        {
          email: resetEmailForSession(recoverySession, resolvedUserId),
          language,
        }
      );

      logger.info(`PIN reset email initiated from login recovery for session ${recoverySession.session_id}`);

      return res.status(200).json({
        success: true,
        message: genericRecoveryMessage(language, resetData.masked_email),
        expires_in_minutes: resetData.expires_in_minutes,
        email_sent: true,
        masked_email: resetData.masked_email,
      });
    } catch (error: any) {
      logger.error(`PIN reset initiation error: ${error?.message || String(error)}`);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to initiate PIN reset',
      });
    }
  }

  /**
   * Verify PIN reset token is valid
   * POST /api/security/reset-pin-verify
   */
  static async verifyResetToken(req: Request, res: Response) {
    try {
      const { token, user_id } = req.body;

      if (!token || !user_id) {
        return res.status(400).json({
          success: false,
          message: 'token and user_id are required',
        });
      }

      const validation = await PinResetService.validateResetToken(
        String(token),
        String(user_id)
      );

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message,
        });
      }

      logger.info(`PIN reset token verified for user ${user_id}`);

      return res.status(200).json({
        success: true,
        message: 'Token is valid',
        valid: true,
      });
    } catch (error: any) {
      logger.error(`Token verification error: ${error?.message || String(error)}`);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Token verification failed',
      });
    }
  }

  /**
   * Finalize PIN reset - Apply new PIN
   * POST /api/security/reset-pin-finalize
   */
  static async finalizePinReset(req: Request, res: Response) {
    try {
      const { token, user_id, new_pin } = req.body;

      if (!token || !user_id || !new_pin) {
        return res.status(400).json({
          success: false,
          message: 'token, user_id, and new_pin are required',
        });
      }

      // Validate PIN format (basic validation)
      const pinStr = String(new_pin);
      if (pinStr.length < 4 || pinStr.length > 8) {
        return res.status(400).json({
          success: false,
          message: 'PIN must be between 4 and 8 characters',
        });
      }

      const newPinHash = hashWalletPin(pinStr);

      const result = await PinResetService.applyNewPin(
        String(token),
        String(user_id),
        newPinHash,
        pinStr
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
        });
      }

      logger.info(`PIN successfully changed for user ${user_id}`);

      return res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error: any) {
      logger.error(`PIN finalization error: ${error?.message || String(error)}`);
      return res.status(400).json({
        success: false,
        message: error?.message || 'Failed to change PIN',
      });
    }
  }
}
