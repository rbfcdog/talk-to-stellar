import { Request, Response } from 'express';
import crypto from 'crypto';
import { PinResetService } from '../../services/pin-reset.service';
import { logger } from '../../utils/logger';
import { supabase } from '../../config/supabase';
import { isSessionExpired } from '../../utils/session-expiry';
import { hashWalletPin } from '../../utils/pin-hash';

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

export class PinResetController {
  /**
   * Initiate PIN reset - Generate temporary reset token
   * POST /api/security/reset-pin-init
   */
  static async initiatePinReset(req: Request, res: Response) {
    try {
      const { user_id, session_id } = req.body;

      if (!session_id) {
        return res.status(400).json({
          success: false,
          message: 'session_id is required',
        });
      }

      const session = await loadSession(String(session_id));
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found',
        });
      }
      if (isSessionExpired(session)) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Sign in again before resetting your PIN.',
        });
      }

      const providedSessionToken = readSessionToken(req);
      const storedSessionToken = String(session.session_token || '').trim();
      const authorizedBySession =
        Boolean(providedSessionToken && storedSessionToken) &&
        timingSafeEqualString(providedSessionToken, storedSessionToken);

      if (!authorizedBySession && !isInternalRequest(req)) {
        return res.status(401).json({
          success: false,
          message: 'Valid session_token or internal authorization is required to initiate PIN reset.',
        });
      }

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
        String(session_id)
      );

      logger.info(`PIN reset initiated for session ${session_id}`);

      return res.status(200).json({
        success: true,
        message: `Reset link generated. Valid for ${resetData.expires_in_minutes} minutes.`,
        reset_url: resetData.reset_url,
        expires_in_minutes: resetData.expires_in_minutes,
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
        newPinHash
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
