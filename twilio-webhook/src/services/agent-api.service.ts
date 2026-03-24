import axios, { AxiosError } from 'axios';
import config from '../config';
import { AgentQueryRequest, AgentResponse, TwilioMessage } from '../types';

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
 * Service to communicate with TalkToStellar agent API
 */
export class AgentApiService {
  private agentApiUrl: string;
  private agentApiTimeout: number;

  constructor() {
    this.agentApiUrl = config.agentApiUrl;
    this.agentApiTimeout = config.agentApiTimeout;
  }

  /**
   * Send message to agent and get response
   * @param twilioMessage - Incoming Twilio message
   * @param requestId - Message ID for logging
   * @returns Agent response
   */
  public async processMessage(twilioMessage: TwilioMessage, requestId: string = 'unknown'): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Generate session ID from phone number (consistent across messages)
      const sessionId = this.generateSessionId(twilioMessage.From);

      const agentRequest: AgentQueryRequest = {
        query: twilioMessage.Body,
        session_id: sessionId,
        source: 'whatsapp-webhook',
      };

      logger.info('🤖 Calling Agent API', {
        requestId,
        sessionId,
        url: this.agentApiUrl,
        queryLength: twilioMessage.Body?.length || 0,
        timeout: this.agentApiTimeout,
      });

      logger.debug('Agent request payload', {
        requestId,
        query: twilioMessage.Body?.substring(0, 100),
        session_id: sessionId,
      });

      const response = await axios.post<AgentResponse>(
        this.agentApiUrl,
        agentRequest,
        {
          timeout: this.agentApiTimeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const duration = Date.now() - startTime;

      logger.success('Agent API response received', {
        requestId,
        durationMs: duration,
        responseStatus: response.status,
        hasMessage: !!response.data?.result?.message,
        messageLength: response.data?.result?.message?.length || 0,
      });

      logger.debug('Agent response content', {
        requestId,
        message: response.data?.result?.message?.substring(0, 100),
        task: response.data?.result?.task,
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      const axiosError = error as AxiosError;
      const errorMessage = axiosError.message || 'Unknown error';
      const errorData = axiosError.response?.data || {};

      logger.error('🤖 Agent API Error', {
        requestId,
        durationMs: duration,
        url: this.agentApiUrl,
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        message: errorMessage,
        errorData: errorData,
        code: axiosError.code,
      });

      throw new Error(`Failed to process message with agent: ${errorMessage}`);
    }
  }

  /**
   * Generate consistent session ID from phone number
   * @param phoneNumber - Twilio phone number
   * @returns Session ID
   */
  private generateSessionId(phoneNumber: string): string {
    // Remove + and format to remove special characters
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    return `whatsapp-${cleanNumber}-${config.nodeEnv || 'dev'}`;
  }

  /**
   * Format agent response for Twilio
   * @param agentResponse - Response from agent API
   * @returns Formatted message text
   */
  public formatResponseForTwilio(agentResponse: AgentResponse): string {
    // Check for errors first
    if (agentResponse?.error) {
      return `Sorry, I encountered an error: ${agentResponse.error}`;
    }

    // Try to get message from result.message or top-level message
    const message = agentResponse?.result?.message || agentResponse?.message || 'No response received from the agent.';

    // Ensure message is not too long for WhatsApp (WhatsApp has a 4096 character limit per message)
    const maxLength = 4096;
    if (message.length > maxLength) {
      return message.substring(0, maxLength - 3) + '...';
    }

    return message;
  }

  /**
   * Extract message content from Twilio message
   * @param twilioMessage - Twilio message object
   * @returns Extracted message content
   */
  public extractMessageContent(twilioMessage: TwilioMessage): string {
    let content = twilioMessage.Body.trim();

    // Handle media messages
    const numMedia = parseInt(twilioMessage.NumMedia || '0', 10);
    if (numMedia > 0) {
      content += `\n[Media: ${numMedia} attachment(s) received]`;
    }

    return content;
  }
}
