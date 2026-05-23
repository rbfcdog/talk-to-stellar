/**
 * Service for checking wallet balance thresholds and sending alerts
 * Integrates with Twilio for WhatsApp notifications
 */

import { supabase } from '../../config/supabase';
import { WalletRepository } from '../repository/core/wallet.repository';
import { StellarService } from './stellar.service';
import { logger } from '../../utils/logger';

interface WhatsAppAlertConfig {
  phoneNumber: string;
  message: string;
  actionUrl?: string;
}

export class BalanceAlertService {
  private static walletRepo = new WalletRepository(supabase);

  /**
   * Check if wallet balance is below threshold and send alert if needed
   */
  static async checkAndAlertLowBalance(
    walletId: number,
    sessionId: string,
    userPhoneNumber?: string
  ): Promise<boolean> {
    try {
      const wallet = await this.walletRepo.getWalletById(walletId);
      if (!wallet) {
        logger.warn(`Wallet ${walletId} not found for balance check`);
        return false;
      }

      // Get current balance
      const balances = await StellarService.getAccountBalance(wallet.public_key);
      
      // Find USDC balance
      const usdcBalance = balances.find(b => (b.asset_code || 'XLM').toUpperCase() === 'USDC');
      const currentBalance = usdcBalance ? parseFloat(usdcBalance.balance) : 0;

      // Get threshold
      const threshold = wallet.alert_threshold_usdc || 5.0;

      // Check if below threshold
      if (currentBalance < threshold) {
        // Check if we already sent an alert in the last 24 hours
        const lastAlert = wallet.last_balance_alert_at
          ? new Date(wallet.last_balance_alert_at)
          : null;
        
        const now = new Date();
        const hoursSinceLastAlert = lastAlert ? (now.getTime() - lastAlert.getTime()) / (1000 * 60 * 60) : Infinity;

        if (hoursSinceLastAlert < 24) {
          logger.debug(`Skipping balance alert - already sent ${Math.round(hoursSinceLastAlert)} hours ago`);
          return false;
        }

        // Send alert if we have phone number
        if (userPhoneNumber) {
          await this.sendWhatsAppAlert({
            phoneNumber: userPhoneNumber,
            message: `🚨 Seu saldo está baixo: ${currentBalance.toFixed(2)} USDC. Limite: ${threshold.toFixed(2)} USDC. Deseja recarregar?`,
            actionUrl: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/wallet/topup` : undefined,
          });
        }

        // Update last alert timestamp
        await this.walletRepo.updateLastBalanceAlert(walletId);

        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error checking balance alert: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Send WhatsApp alert message via Twilio
   */
  static async sendWhatsAppAlert(config: WhatsAppAlertConfig): Promise<boolean> {
    try {
      const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
        logger.warn('Twilio credentials not configured - skipping WhatsApp alert');
        return false;
      }

      // Format phone number for WhatsApp (add 'whatsapp:' prefix if not present)
      const recipient = config.phoneNumber.startsWith('whatsapp:') 
        ? config.phoneNumber 
        : `whatsapp:${config.phoneNumber}`;

      // Send SMS/WhatsApp via Twilio (placeholder - requires actual Twilio SDK)
      logger.info(`[WhatsApp Alert] To: ${recipient}, Message: ${config.message}`);
      
      // In production, use Twilio SDK:
      // const twilio = require('twilio');
      // const client = twilio(twilioAccountSid, twilioAuthToken);
      // await client.messages.create({
      //   from: `whatsapp:${twilioPhoneNumber}`,
      //   to: recipient,
      //   body: config.message,
      // });

      return true;
    } catch (error) {
      logger.error(`Error sending WhatsApp alert: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Bulk check for all wallets with low balances and send alerts
   * Run this as a background job (e.g., every 6 hours)
   */
  static async checkAllWalletsForLowBalance(): Promise<{ checked: number; alerted: number }> {
    try {
      let checked = 0;
      let alerted = 0;

      // Query all wallets with alert thresholds
      const { data: wallets, error } = await supabase
        .from('wallets')
        .select('id, session_id, public_key, alert_threshold_usdc')
        .gt('alert_threshold_usdc', 0);

      if (error) {
        throw new Error(`Failed to query wallets: ${error.message}`);
      }

      for (const wallet of wallets || []) {
        checked++;

        // Get user phone number from session
        const { data: session } = await supabase
          .from('agent_sessions')
          .select('phone_number')
          .eq('session_id', wallet.session_id)
          .single();

        const phoneNumber = session?.phone_number;

        // Check and send alert
        const didAlert = await this.checkAndAlertLowBalance(
          wallet.id,
          wallet.session_id,
          phoneNumber
        );

        if (didAlert) {
          alerted++;
        }
      }

      logger.info(`Balance alert check: ${checked} wallets checked, ${alerted} alerts sent`);
      return { checked, alerted };
    } catch (error) {
      logger.error(`Error in bulk balance check: ${error instanceof Error ? error.message : String(error)}`);
      return { checked: 0, alerted: 0 };
    }
  }

  /**
   * Update alert threshold for a wallet
   */
  static async setAlertThreshold(walletId: number, threshold: number): Promise<boolean> {
    try {
      if (threshold < 0) {
        throw new Error('Threshold cannot be negative');
      }

      await this.walletRepo.setAlertThreshold(walletId, threshold);

      logger.info(`Alert threshold updated for wallet ${walletId}: ${threshold} USDC`);
      return true;
    } catch (error) {
      logger.error(`Error updating alert threshold: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
}
