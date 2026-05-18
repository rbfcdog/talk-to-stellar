/**
 * PIN Reset Service
 * Manages temporary PIN reset tokens and password changes
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { getRequiredJwtSecret } from '../config/secrets';

interface PinResetToken {
  id: string;
  user_id: string;
  session_id: string;
  reset_token: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  used_at?: string | null;
  new_pin_hash?: string;
}

export class PinResetService {
  private static readonly TOKEN_EXPIRY_MINUTES = 15;
  private static readonly RESET_TOKEN_LENGTH = 32;

  private static isMissingPinResetTableError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes("could not find the table 'public.pin_reset_tokens'") ||
      message.includes('relation "pin_reset_tokens" does not exist') ||
      message.includes('relation public.pin_reset_tokens does not exist')
    );
  }

  private static isJwtLikeToken(token: string): boolean {
    return typeof token === 'string' && token.split('.').length === 3;
  }

  /**
   * Generate a PIN reset token
   */
  static async generateResetToken(userId: string, sessionId: string): Promise<{
    token: string;
    reset_url: string;
    expires_in_minutes: number;
  }> {
    try {
      // Generate random token
      const resetToken = crypto.randomBytes(this.RESET_TOKEN_LENGTH).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      // Calculate expiry
      const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_MINUTES * 60 * 1000);

      // Store token in database
      const { data, error } = await supabase
        .from('pin_reset_tokens')
        .insert({
          user_id: userId,
          session_id: sessionId,
          // Keep legacy NOT NULL/UNIQUE column populated without storing the
          // bearer reset token in plaintext.
          reset_token: tokenHash,
          token_hash: tokenHash,
          created_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          used_at: null,
        })
        .select('*')
        .single();

      if (error) {
        if (!this.isMissingPinResetTableError(error)) {
          throw new Error(`Failed to create reset token: ${error.message}`);
        }

        logger.warn('pin_reset_tokens table not available; using JWT fallback reset token');
        const fallbackToken = this.generatePinChangeJWT(userId, resetToken, sessionId);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const fallbackResetUrl = `${frontendUrl}/change-pin?token=${encodeURIComponent(fallbackToken)}&user_id=${encodeURIComponent(userId)}`;

        return {
          token: fallbackToken,
          reset_url: fallbackResetUrl,
          expires_in_minutes: this.TOKEN_EXPIRY_MINUTES,
        };
      }

      // Generate reset URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetUrl = `${frontendUrl}/change-pin?token=${resetToken}&user_id=${userId}`;

      logger.info(`PIN reset token generated for user ${userId}`);

      return {
        token: resetToken,
        reset_url: resetUrl,
        expires_in_minutes: this.TOKEN_EXPIRY_MINUTES,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to generate reset token: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Validate and use reset token
   */
  static async validateResetToken(
    resetToken: string,
    userId: string
  ): Promise<{ valid: boolean; message: string; token_data?: PinResetToken }> {
    try {
      if (this.isJwtLikeToken(resetToken)) {
        const verification = this.verifyPinChangeJWT(resetToken);
        if (!verification.valid || !verification.data) {
          return { valid: false, message: verification.error || 'Token inválido' };
        }

        if (String(verification.data.user_id) !== String(userId)) {
          return { valid: false, message: 'Token não pertence ao usuário informado' };
        }

        return {
          valid: true,
          message: 'Token JWT válido',
        };
      }

      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

      // Look up token
      const { data, error } = await supabase
        .from('pin_reset_tokens')
        .select('*')
        .eq('token_hash', tokenHash)
        .eq('user_id', userId)
        .is('used_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (this.isMissingPinResetTableError(error)) {
          return { valid: false, message: 'PIN reset temporariamente indisponível. Tente novamente em instantes.' };
        }
        logger.warn(`Token validation failed for user ${userId}: ${error.message}`);
        return { valid: false, message: 'Token not found or already used' };
      }

      if (!data) {
        return { valid: false, message: 'Token not found or already used' };
      }

      // Check expiry
      const expiresAt = new Date(data.expires_at);
      if (expiresAt < new Date()) {
        return { valid: false, message: 'Token has expired' };
      }

      return {
        valid: true,
        message: 'Token is valid',
        token_data: data,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Token validation error: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Apply new PIN
   */
  static async applyNewPin(
    resetToken: string,
    userId: string,
    newPinHash: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate token first
      const validation = await this.validateResetToken(resetToken, userId);
      if (!validation.valid) {
        return { success: false, message: validation.message };
      }

      const tokenData = validation.token_data;
      if (!tokenData) {
        // JWT fallback mode (stateless token): valid token but no DB token row.
        if (this.isJwtLikeToken(resetToken)) {
          const verification = this.verifyPinChangeJWT(resetToken);
          const sessionId = String(verification.data?.session_id || '').trim();
          if (!sessionId) {
            return { success: false, message: 'Token antigo inválido. Solicite um novo link de redefinição de PIN.' };
          }

          const { error: updateError } = await supabase
            .from('agent_sessions')
            .update({ session_password_hash: newPinHash })
            .eq('session_id', sessionId);

          if (updateError) {
            throw new Error(`Failed to update PIN: ${updateError.message}`);
          }

          logger.info(`PIN successfully reset via JWT fallback for user ${userId}`);
          return { success: true, message: 'PIN changed successfully' };
        }

        return { success: false, message: 'Token data not found' };
      }

      // Update agent_sessions with new PIN hash
      const { error: updateError } = await supabase
        .from('agent_sessions')
        .update({ session_password_hash: newPinHash })
        .eq('session_id', tokenData.session_id);

      if (updateError) {
        throw new Error(`Failed to update PIN: ${updateError.message}`);
      }

      // Mark token as used
      const { error: markError } = await supabase
        .from('pin_reset_tokens')
        .update({
          used_at: new Date().toISOString(),
          new_pin_hash: newPinHash,
        })
        .eq('id', tokenData.id);

      if (markError) {
        logger.warn(`Failed to mark token as used: ${markError.message}`);
      }

      logger.info(`PIN successfully reset for user ${userId}`);

      return { success: true, message: 'PIN changed successfully' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to apply new PIN: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Generate JWT token for PIN change page
   */
  static generatePinChangeJWT(userId: string, resetToken: string, sessionId?: string): string {
    const jwtSecret = getRequiredJwtSecret();
    
    return jwt.sign(
      {
        user_id: userId,
        session_id: sessionId,
        reset_token: resetToken,
        type: 'pin_reset',
      },
      jwtSecret,
      { expiresIn: '15m' }
    );
  }

  /**
   * Verify PIN change JWT
   */
  static verifyPinChangeJWT(token: string): {
    valid: boolean;
    data?: { user_id: string; session_id?: string; reset_token: string; type: string };
    error?: string;
  } {
    try {
      const jwtSecret = getRequiredJwtSecret();
      const decoded = jwt.verify(token, jwtSecret) as any;

      if (decoded.type !== 'pin_reset') {
        return { valid: false, error: 'Invalid token type' };
      }

      return {
        valid: true,
        data: decoded,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Clean up expired tokens
   */
  static async cleanupExpiredTokens(): Promise<{ deleted_count: number }> {
    try {
      const { data: deleted, error } = await supabase
        .from('pin_reset_tokens')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('id');

      if (error) {
        logger.warn(`Failed to cleanup expired tokens: ${error.message}`);
        return { deleted_count: 0 };
      }

      const deletedCount = (deleted || []).length;
      logger.info(`Cleaned up ${deletedCount} expired PIN reset tokens`);

      return { deleted_count: deletedCount };
    } catch (error) {
      logger.error(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      return { deleted_count: 0 };
    }
  }
}
