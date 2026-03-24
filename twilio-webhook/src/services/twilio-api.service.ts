import twilio from 'twilio';
import config from '../config';

/**
 * Service to send messages via Twilio API
 */
export class TwilioApiService {
  private twilioClient: any;

  constructor() {
    // Initialize Twilio client if credentials are available
    if (config.twilioAccountSid && config.twilioAuthToken) {
      this.twilioClient = twilio(
        config.twilioAccountSid,
        config.twilioAuthToken
      );
    } else {
      console.warn('⚠️  Twilio credentials not configured. Messages will not be sent.');
    }
  }

  /**
   * Send reply message via Twilio
   * @param to - Phone number to send to
   * @param from - Phone number to send from
   * @param body - Message body
   */
  public async sendMessage(to: string, from: string, body: string): Promise<void> {
    if (!this.twilioClient) {
      console.warn('⚠️  Twilio client not initialized. Message not sent:', {
        to,
        body,
      });
      return;
    }

    try {
      const message = await this.twilioClient.messages.create({
        from,
        to,
        body,
      });

      console.log('✓ Reply sent via Twilio:', {
        messageSid: message.sid,
        to,
        body,
      });
    } catch (error) {
      console.error('❌ Failed to send message via Twilio:', error);
      throw error;
    }
  }

  /**
   * Check if Twilio is configured
   */
  public isConfigured(): boolean {
    return this.twilioClient !== undefined;
  }
}
