import { Request, Response } from 'express';
import { TwilioMessage } from '../types';
import { TwilioAgentService } from '../services/twilio.service';
import twilio from 'twilio';

/**
 * Controller for handling Twilio webhook requests
 */
export class TwilioController {
  private twilioService: TwilioAgentService;
  private twilioClient?: any;

  constructor() {
    this.twilioService = new TwilioAgentService();

    // Initialize Twilio client if credentials are available
    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN
    ) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }
  }

  /**
   * Handle incoming WhatsApp message from Twilio
   * @param req - Express request containing Twilio message
   * @param res - Express response
   */
  public async handleIncomingMessage(req: Request, res: Response): Promise<void> {
    try {
      const twilioMessage = req.body as TwilioMessage;

      console.log('Received message from Twilio:', {
        from: twilioMessage.From,
        to: twilioMessage.To,
        body: twilioMessage.Body,
        messageSid: twilioMessage.MessageSid,
      });

      // Validate required fields
      if (!twilioMessage.From || !twilioMessage.Body) {
        console.error('Invalid Twilio message format', twilioMessage);
        res.status(400).json({
          error: 'Invalid message format: missing From or Body',
        });
        return;
      }

      // Send immediate acknowledgment to Twilio
      const twimlResponse = new (twilio as any).twiml.MessagingResponse();

      // Process message asynchronously
      this.processAndReply(twilioMessage).catch((error) => {
        console.error('Error processing message:', error);
      });

      // Return empty response immediately
      res.type('text/xml');
      res.send(twimlResponse.toString());
    } catch (error) {
      console.error('Error in handleIncomingMessage:', error);
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
      const agentResponse = await this.twilioService.processMessage(twilioMessage);

      // Format response for Twilio
      const replyMessage = this.twilioService.formatResponseForTwilio(agentResponse);

      // Send message back via Twilio
      if (this.twilioClient) {
        await this.twilioClient.messages.create({
          from: twilioMessage.To, // Reply from the same number message was sent to
          to: twilioMessage.From, // Send to original sender
          body: replyMessage,
        });

        console.log('Reply sent to Twilio:', {
          to: twilioMessage.From,
          body: replyMessage,
        });
      } else {
        console.warn(
          'Twilio client not initialized. Cannot send reply. Message would be:',
          replyMessage
        );
      }
    } catch (error) {
      console.error('Error in processAndReply:', error);

      // Optionally send error message to user
      if (this.twilioClient) {
        try {
          await this.twilioClient.messages.create({
            from: twilioMessage.To,
            to: twilioMessage.From,
            body: 'Sorry, I encountered an error processing your message. Please try again.',
          });
        } catch (sendError) {
          console.error('Failed to send error message to user:', sendError);
        }
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
      service: 'Twilio WhatsApp Webhook',
      pythonApiUrl: process.env.PYTHON_API_URL || 'http://localhost:8000/api/actions/query',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  }
}
