import { Request, Response } from 'express';
import { TwilioMessage } from '../types';
import { AgentApiService } from '../services/agent-api.service';
import { TwilioApiService } from '../services/twilio-api.service';
import twilio from 'twilio';

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
    try {
      const twilioMessage = req.body as TwilioMessage;

      console.log('📱 Received message from Twilio:', {
        from: twilioMessage.From,
        to: twilioMessage.To,
        body: twilioMessage.Body,
        messageSid: twilioMessage.MessageSid,
      });

      // Validate required fields
      if (!twilioMessage.From || !twilioMessage.Body) {
        console.error('❌ Invalid Twilio message format', twilioMessage);
        res.status(400).json({
          error: 'Invalid message format: missing From or Body',
        });
        return;
      }

      // Send immediate acknowledgment to Twilio with TwiML response
      const twimlResponse = new (twilio as any).twiml.MessagingResponse();

      // Process message asynchronously (don't wait for it)
      this.processAndReply(twilioMessage).catch((error) => {
        console.error('❌ Error processing message:', error);
      });

      // Return empty response immediately to Twilio
      res.type('text/xml');
      res.send(twimlResponse.toString());
    } catch (error) {
      console.error('❌ Error in handleIncomingMessage:', error);
      res.status(500).json({
        error: 'Internal server error',
      });
    }
  }

  /**
   * Process message and send reply to Twilio
   * @param twilioMessage - Incoming Twilio message
   */
  private async processAndReply(twilioMessage: TwilioMessage): Promise<void> {
    try {
      // Get response from agent
      const agentResponse = await this.agentService.processMessage(twilioMessage);

      // Format response for Twilio
      const replyMessage = this.agentService.formatResponseForTwilio(agentResponse);

      // Send message back via Twilio
      await this.twilioService.sendMessage(
        twilioMessage.From,
        twilioMessage.To,
        replyMessage
      );
    } catch (error) {
      console.error('❌ Error in processAndReply:', error);

      // Optionally send error message to user
      try {
        await this.twilioService.sendMessage(
          twilioMessage.From,
          twilioMessage.To,
          'Sorry, I encountered an error processing your message. Please try again.'
        );
      } catch (sendError) {
        console.error('❌ Failed to send error message to user:', sendError);
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
