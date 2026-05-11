import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import PasskeyService from '../../services/passkey.service';

export default class PasskeyController {
  static async registerInit(req: Request, res: Response) {
    try {
      const userId = req.body?.user_id || req.body?.email
        ? await PasskeyService.resolveLoginUserId(String(req.body.user_id || req.body.email))
        : await PasskeyService.getUserIdFromExternalPaymentToken(String(req.body?.token || ''));

      const result = await PasskeyService.generateRegistration(userId);
      return res.status(200).json({ success: true, userId, ...result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async registerComplete(req: Request, res: Response) {
    try {
      const userId = req.body?.user_id || req.body?.email
        ? await PasskeyService.resolveLoginUserId(String(req.body.user_id || req.body.email))
        : await PasskeyService.getUserIdFromExternalPaymentToken(String(req.body?.token || ''));

      const result = await PasskeyService.verifyRegistration(
        userId,
        String(req.body?.challenge_id || ''),
        req.body?.credential
      );

      return res.status(200).json({ success: true, userId, ...result });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
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
