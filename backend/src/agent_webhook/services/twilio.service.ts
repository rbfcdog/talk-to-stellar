import axios, { AxiosError } from 'axios';
import { AgentQueryRequest, AgentResponse, TwilioMessage } from '../types';

/**
 * Service to communicate with TalkToStellar agent
 */
export class TwilioAgentService {
  private pythonApiUrl: string;
  private pythonApiTimeout: number;

  constructor() {
    this.pythonApiUrl =
      process.env.PYTHON_API_URL || 'http://localhost:8000/api/actions/query';
    this.pythonApiTimeout = parseInt(process.env.PYTHON_API_TIMEOUT || '30000', 10);
  }

  /**
   * Send message to agent and get response
   * @param twilioMessage - Incoming Twilio message
   * @returns Agent response
   */
  public async processMessage(twilioMessage: TwilioMessage): Promise<AgentResponse> {
    try {
      // Generate session ID from phone number (consistent across messages)
      const sessionId = this.generateSessionId(twilioMessage.From);

      const agentRequest: AgentQueryRequest = {
        query: twilioMessage.Body,
        session_id: sessionId,
        source: 'whatsapp-webhook',
      };

      console.log('Sending to agent:', {
        sessionId,
        query: twilioMessage.Body,
        from: twilioMessage.From,
      });

      const response = await axios.post<AgentResponse>(
        this.pythonApiUrl,
        agentRequest,
        {
          timeout: this.pythonApiTimeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Agent response received:', response.data);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      const errorMessage = axiosError.message || 'Unknown error';
      const errorData = axiosError.response?.data || {};

      console.error('Agent communication error:', {
        message: errorMessage,
        status: axiosError.response?.status,
        data: errorData,
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
    return `whatsapp-${cleanNumber}-${process.env.NODE_ENV || 'dev'}`;
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

  /**
   * Format agent response for Twilio
   * @param agentResponse - Response from agent
   * @returns Formatted text message
   */
  public formatResponseForTwilio(agentResponse: AgentResponse): string {
    if (agentResponse.error) {
      return `Sorry, I encountered an error: ${agentResponse.error}`;
    }

    const message =
      agentResponse.result?.message ||
      agentResponse.message ||
      'No response received from the agent.';

    // Twilio has message length limits, truncate if needed
    const maxLength = 1600;
    if (message.length > maxLength) {
      return message.substring(0, maxLength - 3) + '...';
    }

    return message;
  }
}
