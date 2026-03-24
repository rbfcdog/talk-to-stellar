/**
 * Twilio Webhook Types
 */

export interface TwilioMessage {
  AccountSid: string;
  MessageSid: string;
  MessagingServiceSid?: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  NumSegments: string;
  ApiVersion?: string;
}

export interface TwilioWebhookRequest {
  body: TwilioMessage;
}

export interface AgentQueryRequest {
  query: string;
  session_id: string;
  source?: string;
}

export interface AgentResponse {
  result?: {
    message: string;
    task?: string;
    params?: Record<string, unknown>;
  };
  message?: string;
  error?: string;
}

export interface WhatsAppContact {
  phoneNumber: string;
  name?: string;
  customerId?: string;
}

export interface WebhookSession {
  sessionId: string;
  phoneNumber: string;
  startedAt: Date;
  lastMessageAt: Date;
  authenticated: boolean;
  userId?: string;
}

export interface ApiConfig {
  agentApiUrl: string;
  backendApiUrl: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  agentApiTimeout: number;
  port: number;
  nodeEnv: string;
}
