/**
 * Test Utilities
 * Helper functions and utilities for testing
 */

import axios, { AxiosInstance } from 'axios';
import * as StellarSDK from '@stellar/stellar-sdk';

/**
 * Create a test axios client
 */
export function createTestClient(baseURL?: string): AxiosInstance {
  return axios.create({
    baseURL: baseURL || process.env.API_BASE_URL || 'http://localhost:3000/api',
    timeout: 10000,
    validateStatus: () => true,
  });
}

/**
 * Generate a random test email
 */
export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Generate a random Stellar keypair
 */
export function generateTestKeypair(): { publicKey: string; secretKey: string } {
  const keypair = StellarSDK.Keypair.random();
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

/**
 * Wait for a specific amount of time
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        await wait(Math.min(delay, maxDelayMs));
        delay *= backoffMultiplier;
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Mock data generators
 */
export const mockData = {
  /**
   * Generate mock user data
   */
  user: (overrides?: Record<string, any>) => ({
    id: `user-${Date.now()}`,
    email: generateTestEmail(),
    phoneNumber: '+1234567890',
    publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  /**
   * Generate mock wallet data
   */
  wallet: (overrides?: Record<string, any>) => ({
    publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
    balance: '1000.5',
    sequence: '123456789',
    balances: [
      {
        balance: '1000.5',
        asset_code: 'XLM',
        asset_issuer: undefined,
      },
    ],
    ...overrides,
  }),

  /**
   * Generate mock transaction data
   */
  transaction: (overrides?: Record<string, any>) => ({
    id: `tx-${Date.now()}`,
    from: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
    to: 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJvengaybnwqti5ELXIRVFY5K',
    amount: '10',
    assetCode: 'XLM',
    status: 'completed',
    hash: 'abc123def456ghi789',
    timestamp: new Date().toISOString(),
    ...overrides,
  }),

  /**
   * Generate mock chat message
   */
  chatMessage: (overrides?: Record<string, any>) => ({
    id: `msg-${Date.now()}`,
    sessionId: `session-${Date.now()}`,
    userId: `user-${Date.now()}`,
    message: 'What is my balance?',
    reply: 'Your balance is 1000.5 XLM.',
    timestamp: new Date().toISOString(),
    ...overrides,
  }),

  /**
   * Generate mock agent log
   */
  agentLog: (overrides?: Record<string, any>) => ({
    id: `log-${Date.now()}`,
    sessionId: `session-${Date.now()}`,
    agent: 'wallet',
    intent: 'check_balance',
    tools: ['getBalance'],
    result: 'success',
    timestamp: new Date().toISOString(),
    ...overrides,
  }),
};

/**
 * Test result formatting
 */
export const testLogger = {
  /**
   * Log test section header
   */
  section: (title: string) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 ${title}`);
    console.log(`${'='.repeat(60)}`);
  },

  /**
   * Log test case
   */
  test: (name: string) => {
    console.log(`\n📝 ${name}`);
  },

  /**
   * Log success
   */
  success: (message: string) => {
    console.log(`✅ ${message}`);
  },

  /**
   * Log warning
   */
  warning: (message: string) => {
    console.log(`⚠️  ${message}`);
  },

  /**
   * Log error
   */
  error: (message: string) => {
    console.log(`❌ ${message}`);
  },

  /**
   * Log info
   */
  info: (message: string) => {
    console.log(`ℹ️  ${message}`);
  },

  /**
   * Log network request
   */
  request: (method: string, url: string, status?: number) => {
    const statusStr = status ? ` [${status}]` : '';
    console.log(`📡 ${method} ${url}${statusStr}`);
  },

  /**
   * Log data
   */
  data: (label: string, data: any) => {
    console.log(`📊 ${label}:`);
    console.log(JSON.stringify(data, null, 2));
  },
};

/**
 * Environment variable utilities
 */
export const testEnv = {
  /**
   * Load required environment variables
   */
  requireEnv: (...vars: string[]): Record<string, string> => {
    const missing = vars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }
    return Object.fromEntries(vars.map((v) => [v, process.env[v]!]));
  },

  /**
   * Get optional environment variable
   */
  getEnv: (name: string, defaultValue?: string): string => {
    return process.env[name] || defaultValue || '';
  },

  /**
   * Check if running in test mode
   */
  isTestMode: (): boolean => {
    return process.env.NODE_ENV === 'test' || process.env.CI === 'true';
  },

  /**
   * Check if running in CI
   */
  isCI: (): boolean => {
    return process.env.CI === 'true';
  },
};

/**
 * Assertion helpers
 */
export const assertions = {
  /**
   * Assert value is a valid Stellar public key
   */
  isValidStellarPublicKey: (key: string): boolean => {
    return /^G[A-Z0-9]{55}$/.test(key);
  },

  /**
   * Assert value is a valid Stellar secret key
   */
  isValidStellarSecretKey: (key: string): boolean => {
    return /^S[A-Z0-9]{55}$/.test(key);
  },

  /**
   * Assert value is a valid email
   */
  isValidEmail: (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  /**
   * Assert value is a valid UUID
   */
  isValidUUID: (uuid: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  },

  /**
   * Assert value is a valid transaction hash
   */
  isValidTransactionHash: (hash: string): boolean => {
    return /^[a-f0-9]{64}$/i.test(hash);
  },
};

export default {
  createTestClient,
  generateTestEmail,
  generateTestKeypair,
  wait,
  retry,
  mockData,
  testLogger,
  testEnv,
  assertions,
};
