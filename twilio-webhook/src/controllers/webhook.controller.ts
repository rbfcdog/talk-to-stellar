import { Request, Response } from 'express';
import { TwilioMessage } from '../types';
import { AgentApiService } from '../services/agent-api.service';
import { TwilioApiService } from '../services/twilio-api.service';
import twilio from 'twilio';

/**
 * Logger utility for structured logging
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
 * Controller for handling Twilio webhook requests
 */
export class WebhookController {
  private agentService: AgentApiService;
  private twilioService: TwilioApiService;

  constructor() {
    this.agentService = new AgentApiService();
    this.twilioService = new TwilioApiService();
  }

  /**
   * Handle incoming WhatsApp message from Twilio
   * @param req - Express request containing Twilio message
   * @param res - Express response
   */
  public async handleIncomingMessage(req: Request, res: Response): Promise<void> {
    const timestamp = new Date().toISOString();
    let requestId = '';

    try {
      const twilioMessage = req.body as TwilioMessage;
      requestId = twilioMessage.MessageSid || 'unknown-msg';

      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('🎯 INCOMING WHATSAPP MESSAGE', {
        timestamp,
        messageId: requestId,
        from: twilioMessage.From,
        to: twilioMessage.To,
        messageLength: twilioMessage.Body?.length || 0,
        hasMedia: parseInt(twilioMessage.NumMedia || '0') > 0,
      });

      logger.debug('Message content', {
        body: twilioMessage.Body,
        accountSid: twilioMessage.AccountSid?.substring(0, 6) + '...',
        numMedia: twilioMessage.NumMedia,
      });

      // Validate required fields
      if (!twilioMessage.From || !twilioMessage.Body) {
        logger.error('Invalid message format - missing required fields', {
          messageId: requestId,
          hasFrom: !!twilioMessage.From,
          hasBody: !!twilioMessage.Body,
        });
        res.status(400).json({
          error: 'Invalid message format: missing From or Body',
        });
        return;
      }

      // Send immediate acknowledgment to Twilio with TwiML response
      const twimlResponse = new (twilio as any).twiml.MessagingResponse();

      logger.success('Webhook acknowledged to Twilio', { messageId: requestId });

      // Process message asynchronously (don't wait for it)
      this.processAndReply(twilioMessage, requestId).catch((error) => {
        logger.error('Error in async processAndReply', {
          messageId: requestId,
          error: error instanceof Error ? error.message : String(error),
        });
      });

      // Return empty response immediately to Twilio
      res.type('text/xml');
      res.send(twimlResponse.toString());
    } catch (error) {
      logger.error('Error in handleIncomingMessage', {
        messageId: requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({
        error: 'Internal server error',
      });
    }
  }

  /**
   * Process message and send reply to Twilio
   * @param twilioMessage - Incoming Twilio message
   * @param requestId - Message ID for logging
   */
  private async processAndReply(twilioMessage: TwilioMessage, requestId: string): Promise<void> {
    try {
      logger.info('Processing message with agent', {
        messageId: requestId,
        from: twilioMessage.From,
      });

      // Get response from agent
      const agentResponse = await this.agentService.processMessage(twilioMessage, requestId);

      // Format response for Twilio
      const replyMessage = this.agentService.formatResponseForTwilio(agentResponse);

      logger.success('Agent processed message', {
        messageId: requestId,
        replyLength: replyMessage?.length || 0,
      });

      // Send message back via Twilio
      logger.info('Sending reply to user via Twilio', {
        messageId: requestId,
        to: twilioMessage.From,
        replyPreview: replyMessage?.substring(0, 50) + '...',
      });

      const sendResult = await this.twilioService.sendMessage(
        `whatsapp:${twilioMessage.From}`,
        `whatsapp:${twilioMessage.To}`,
        replyMessage,
        requestId
      );

      logger.success('Reply sent to user', {
        messageId: requestId,
        replySid: sendResult,
      });

      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      logger.error('Error in processAndReply', {
        messageId: requestId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Optionally send error message to user
      try {
        logger.info('Sending error message to user', { messageId: requestId });
        await this.twilioService.sendMessage(
          `whatsapp:${twilioMessage.From}`,
          `whatsapp:${twilioMessage.To}`,
          'Sorry, I encountered an error processing your message. Please try again.',
          requestId
        );
        logger.success('Error message sent', { messageId: requestId });
      } catch (sendError) {
        logger.error('Failed to send error message', {
          messageId: requestId,
          error: sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
  }

  /**
   * Health check endpoint for webhook
   * @param req - Express request
   * @param res - Express response
   */
  public healthCheck(req: Request, res: Response): void {
    res.status(200).json({
      status: 'OK',
      service: 'Twilio Webhook',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get webhook status and metrics
   * @param req - Express request
   * @param res - Express response
   */
  public getStatus(req: Request, res: Response): void {
    res.status(200).json({
      status: 'active',
      service: 'Twilio WhatsApp Webhook Service',
      agentApiUrl: process.env.AGENT_API_URL || 'http://localhost:8000/api/actions/query',
      backendApiUrl: process.env.BACKEND_API_URL || 'http://localhost:3000',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      twilioConfigured: this.twilioService.isConfigured(),
    });
  }
}
