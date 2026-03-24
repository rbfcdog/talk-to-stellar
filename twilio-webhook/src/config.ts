import dotenv from 'dotenv';
import { ApiConfig } from './types';

dotenv.config();

/**
 * Load and validate configuration from environment
 */
export const config: ApiConfig = {
  // Twilio Configuration
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',

  // API URLs - These are EXTERNAL URLs to call
  agentApiUrl: process.env.AGENT_API_URL || 'http://localhost:8000/api/actions/query',
  backendApiUrl: process.env.BACKEND_API_URL || 'http://localhost:3000',

  // Timeout for API calls
  agentApiTimeout: parseInt(process.env.AGENT_API_TIMEOUT || '30000', 10),

  // Server Configuration
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
};

/**
 * Validate required configuration
 */
export const validateConfig = (): void => {
  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0 && config.nodeEnv === 'production') {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (missing.length > 0 && config.nodeEnv !== 'production') {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('⚠️  Some features may not work in development');
  }
};

export default config;
