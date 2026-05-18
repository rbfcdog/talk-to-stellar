import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import PasskeyService from '../../services/passkey.service';

function readSessionId(req: Request): string {
  return String(req.body?.session_id || req.body?.sessionId || req.headers['x-session-id'] || '').trim();
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

function passkeyErrorStatus(error: any): number {
  const status = Number(error?.statusCode || error?.status || 400);
  return Number.isFinite(status) && status >= 400 && status < 600 ? status : 400;
}

export default class PasskeyController {
  static async registerInit(req: Request, res: Response) {
    try {
      const authorization = await PasskeyService.authorizeRegistration({
        userId: req.body?.user_id ? String(req.body.user_id) : undefined,
        email: req.body?.email ? String(req.body.email) : undefined,
        sessionId: readSessionId(req),
        sessionToken: readSessionToken(req),
      });

      const result = await PasskeyService.generateRegistration(authorization);
      return res.status(200).json({ success: true, userId: authorization.userId, ...result });
    } catch (error: any) {
      return res.status(passkeyErrorStatus(error)).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async registerComplete(req: Request, res: Response) {
    try {
      const authorization = await PasskeyService.authorizeRegistration({
        userId: req.body?.user_id ? String(req.body.user_id) : undefined,
        email: req.body?.email ? String(req.body.email) : undefined,
        sessionId: readSessionId(req),
        sessionToken: readSessionToken(req),
      });

      const result = await PasskeyService.verifyRegistration(
        authorization,
        String(req.body?.challenge_id || ''),
        req.body?.credential
      );

      return res.status(200).json({ success: true, userId: authorization.userId, ...result });
    } catch (error: any) {
      return res.status(passkeyErrorStatus(error)).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async authInit(req: Request, res: Response) {
    try {
      if (req.body?.token) {
        const result = await PasskeyService.generateTransactionAuthentication({
          token: String(req.body.token || ''),
          publicKey: String(req.body?.public_key || req.query?.public_key || '').trim() || undefined,
        });

        return res.status(200).json({ success: true, ...result });
      }

      const userId = req.body?.user_id || req.body?.email
        ? await PasskeyService.resolveLoginUserId(String(req.body.user_id || req.body.email))
        : '';
      if (!userId) {
        return res.status(400).json({ success: false, message: 'user_id, email or token is required' });
      }

      const result = await PasskeyService.generateLoginAuthentication(userId);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async authComplete(req: Request, res: Response) {
    try {
      if (req.body?.token) {
        const verification = await PasskeyService.verifyTransactionAuthorization({
          token: String(req.body.token || ''),
          publicKey: String(req.body?.public_key || req.query?.public_key || '').trim() || undefined,
          challengeId: String(req.body?.challenge_id || ''),
          response: req.body?.credential,
        });

        return res.status(200).json({
          success: true,
          sessionToken: AuthService.generateTokenForUser(verification.transaction.userId),
          userId: verification.transaction.userId,
          transaction: verification.transaction,
        });
      }

      const userId = req.body?.user_id || req.body?.email
        ? await PasskeyService.resolveLoginUserId(String(req.body.user_id || req.body.email))
        : '';
      if (!userId) {
        return res.status(400).json({ success: false, message: 'user_id, email or token is required' });
      }

      const result = await PasskeyService.verifyLoginAuthentication(
        userId,
        String(req.body?.challenge_id || ''),
        req.body?.credential
      );

      return res.status(200).json({ success: true, userId, ...result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }
}
