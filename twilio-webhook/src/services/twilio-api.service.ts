import twilio from 'twilio';
import config from '../config';

/**
 * Logger utility
 */
const logger = {
  info: (msg: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`, data ? JSON.stringify(data, null, 2) : '');
  },
  success: (msg: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] ✓ ${msg}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (msg: string, data?: any) => {
    console.error(`[${new Date().toISOString()}] ❌ ${msg}`, data ? JSON.stringify(data, null, 2) : '');
  },
  debug: (msg: string, data?: any) => {
    console.log(`[${new Date().toISOString()}] 🔍 ${msg}`, data ? JSON.stringify(data, null, 2) : '');
  },
};

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
      logger.success('Twilio client initialized', {
        accountSid: config.twilioAccountSid.substring(0, 6) + '...',
      });
    } else {
      logger.error('Twilio credentials not configured. Messages will not be sent.');
    }
  }

  /**
   * Send reply message via Twilio
   * @param to - Phone number to send to
   * @param from - Phone number to send from
   * @param body - Message body
   * @param requestId - Message ID for logging correlation
   */
  public async sendMessage(to: string, from: string, body: string, requestId: string = 'unknown'): Promise<string | null> {
    const startTime = Date.now();

    if (!this.twilioClient) {
      logger.error('⚠️  Twilio client not initialized', {
        requestId,
        to,
        bodyLength: body.length,
      });
      return null;
    }

    try {
      logger.info('📤 Sending Twilio message', {
        requestId,
        to: to.replace(/^whatsapp:/, ''),
        from: from.replace(/^whatsapp:/, ''),
        bodyLength: body.length,
        bodyPreview: body.substring(0, 50) + (body.length > 50 ? '...' : ''),
      });

      const message = await this.twilioClient.messages.create({
        from,
        to,
        body,
      });

      const duration = Date.now() - startTime;

      logger.success('✉️  Message sent via Twilio', {
        requestId,
        messageSid: message.sid,
        durationMs: duration,
        to: to.replace(/^whatsapp:/, ''),
        status: message.status,
      });

      logger.debug('Twilio message details', {
        requestId,
        messageSid: message.sid,
        bodyLength: body.length,
        dateCreated: message.dateCreated,
      });

      return message.sid;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to send Twilio message', {
        requestId,
        durationMs: duration,
        to: to.replace(/^whatsapp:/, ''),
        from: from.replace(/^whatsapp:/, ''),
        bodyLength: body.length,
        error: errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
      });

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
