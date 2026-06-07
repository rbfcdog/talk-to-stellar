/**
 * PIN Reset Service
 * Manages temporary PIN reset tokens and password changes
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../../../config/supabase';
import { logger } from '../../../utils/logger';
import { getRequiredJwtSecret } from '../../../config/secrets';
import { EmailConfirmationService } from '../email-confirmation.service';
import { LoginPasswordService } from '../login-password.service';

type PinResetLanguage = 'pt-BR' | 'en';

type GenerateResetTokenOptions = {
  email?: string | null;
  language?: PinResetLanguage | string | null;
};

function normalizeEmail(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function looksLikeEmail(value?: string | null): boolean {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function normalizeLanguage(value?: string | null): PinResetLanguage {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english')) return 'en';
  return 'pt-BR';
}

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
  private static async sendResetEmail(input: {
    email: string;
    resetUrl: string;
    expiresInMinutes: number;
    language: PinResetLanguage;
  }): Promise<void> {
    const subject = input.language === 'en'
      ? 'Confirm your TalkToStellar PIN change'
      : 'Confirme a troca do seu PIN TalkToStellar';
    const text = input.language === 'en'
      ? [
          'We received a request to change your TalkToStellar PIN.',
          `Open this link to choose a new PIN: ${input.resetUrl}`,
          `This link expires in ${input.expiresInMinutes} minutes.`,
          'If this was not you, ignore this email.',
        ].join('\n')
      : [
          'Recebemos um pedido para mudar seu PIN TalkToStellar.',
          `Abra este link para escolher um novo PIN: ${input.resetUrl}`,
          `Este link expira em ${input.expiresInMinutes} minutos.`,
          'Se não foi você, ignore este e-mail.',
        ].join('\n');
    const html = input.language === 'en'
      ? [
          '<p>We received a request to change your TalkToStellar PIN.</p>',
          `<p><a href="${input.resetUrl}">Change my PIN</a></p>`,
          `<p>This link expires in ${input.expiresInMinutes} minutes.</p>`,
          '<p>If this was not you, ignore this email.</p>',
        ].join('')
      : [
          '<p>Recebemos um pedido para mudar seu PIN TalkToStellar.</p>',
          `<p><a href="${input.resetUrl}">Mudar meu PIN</a></p>`,
          `<p>Este link expira em ${input.expiresInMinutes} minutos.</p>`,
          '<p>Se não foi você, ignore este e-mail.</p>',
        ].join('');

    await EmailConfirmationService.sendTransactional({
      to: input.email,
      subject,
      text,
      html,
    });
  }

  static async generateResetToken(userId: string, sessionId: string, options: GenerateResetTokenOptions = {}): Promise<{
    token: string;
    reset_url: string;
    expires_in_minutes: number;
    email_sent?: boolean;
    masked_email?: string;
  }> {
    try {
      const language = normalizeLanguage(options.language);
      const email = normalizeEmail(options.email);
      const sendEmail = looksLikeEmail(email);
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
        if (sendEmail) {
          await this.sendResetEmail({
            email,
            resetUrl: fallbackResetUrl,
            expiresInMinutes: this.TOKEN_EXPIRY_MINUTES,
            language,
          });
        }

        return {
          token: fallbackToken,
          reset_url: fallbackResetUrl,
          expires_in_minutes: this.TOKEN_EXPIRY_MINUTES,
          email_sent: sendEmail,
          masked_email: sendEmail ? EmailConfirmationService.maskEmail(email) : undefined,
        };
      }

      // Generate reset URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetUrl = `${frontendUrl}/change-pin?token=${resetToken}&user_id=${userId}`;
      if (sendEmail) {
        await this.sendResetEmail({
          email,
          resetUrl,
          expiresInMinutes: this.TOKEN_EXPIRY_MINUTES,
          language,
        });
      }

      logger.info(`PIN reset token generated for user ${userId}`);

      return {
        token: resetToken,
        reset_url: resetUrl,
        expires_in_minutes: this.TOKEN_EXPIRY_MINUTES,
        email_sent: sendEmail,
        masked_email: sendEmail ? EmailConfirmationService.maskEmail(email) : undefined,
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
    newPinHash: string,
    newPinPlain?: string
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

          const patch: Record<string, unknown> = { session_password_hash: newPinHash };
          if (newPinPlain) {
            patch.login_password_hash = LoginPasswordService.hash(newPinPlain);
            patch.login_failed_attempts = 0;
            patch.login_locked_until = null;
            patch.login_last_failed_at = null;
          }
          const { error: updateError } = await supabase
            .from('agent_sessions')
            .update(patch)
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
      const patch: Record<string, unknown> = { session_password_hash: newPinHash };
      if (newPinPlain) {
        patch.login_password_hash = LoginPasswordService.hash(newPinPlain);
        patch.login_failed_attempts = 0;
        patch.login_locked_until = null;
        patch.login_last_failed_at = null;
      }
      const { error: updateError } = await supabase
        .from('agent_sessions')
        .update(patch)
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
