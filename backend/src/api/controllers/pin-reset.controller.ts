import { Request, Response } from 'express';
import crypto from 'crypto';
import { PinResetService } from '../../services/pin-reset.service';
import { logger } from '../../utils/logger';

export class PinResetController {
  /**
   * Initiate PIN reset - Generate temporary reset token
   * POST /api/security/reset-pin-init
   */
  static async initiatePinReset(req: Request, res: Response) {
    try {
      const { user_id, session_id } = req.body;

      if (!user_id || !session_id) {
        return res.status(400).json({
          success: false,
          message: 'user_id and session_id are required',
        });
      }

      const resetData = await PinResetService.generateResetToken(
        String(user_id),
        String(session_id)
      );

      logger.info(`PIN reset initiated for user ${user_id}`);

      return res.status(200).json({
        success: true,
        message: `Reset link generated. Valid for ${resetData.expires_in_minutes} minutes.`,
        reset_url: resetData.reset_url,
        expires_in_minutes: resetData.expires_in_minutes,
        token: resetData.token, // For debugging or direct use
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

      // Hash the new PIN using same method as password hashing
      const newPinHash = crypto
        .pbkdf2Sync(pinStr, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
        .toString('hex');

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
