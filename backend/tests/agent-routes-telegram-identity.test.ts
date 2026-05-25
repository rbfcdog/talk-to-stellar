import express from 'express';
import type { Server } from 'http';

const processInputMock = jest.fn();
const checkExternalAccountMock = jest.fn();
const createOnboardUrlWithShortLinkMock = jest.fn();
const createLoginUrlWithShortLinkMock = jest.fn();
const getWalletBySessionMock = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    })),
  },
}));

jest.mock('../src/api/agent/graph', () => ({
  AgentGraph: jest.fn().mockImplementation(() => ({
    processInput: processInputMock,
  })),
}));

jest.mock('../src/api/agent/tools', () => ({
  ALL_TOOLS: [],
  executeTool: jest.fn(),
}));

jest.mock('../src/api/services/core/external.service', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    checkExternalAccount: checkExternalAccountMock,
    createOnboardUrlWithShortLink: createOnboardUrlWithShortLinkMock,
    createLoginUrlWithShortLink: createLoginUrlWithShortLinkMock,
  })),
}));

jest.mock('../src/api/repository/core/wallet.repository', () => ({
  WalletRepository: jest.fn().mockImplementation(() => ({
    getWalletBySession: getWalletBySessionMock,
  })),
}));

jest.mock('../src/api/services/transfer-notification.service', () => ({
  TransferNotificationService: {
    notifySessionLogout: jest.fn(),
  },
}));

function createRepository(sessions: Record<string, any>) {
  return {
    getSession: jest.fn(async (sessionId: string) => sessions[sessionId] || null),
    saveSession: jest.fn(async (sessionId: string, data: any) => {
      sessions[sessionId] = { ...(sessions[sessionId] || {}), ...data };
    }),
    clearSession: jest.fn(async (sessionId: string) => {
      delete sessions[sessionId];
    }),
    getState: jest.fn(async () => null),
    saveState: jest.fn(async () => undefined),
    getMessages: jest.fn(async () => []),
    saveMessage: jest.fn(async () => undefined),
    deletePrivateKeyMessages: jest.fn(async () => undefined),
  };
}

async function withAgentServer(repository: any, run: (baseUrl: string) => Promise<void>) {
  const { createAgentRoutes } = await import('../src/api/agent/routes');
  const app = express();
  app.use(express.json());
  app.use(createAgentRoutes(repository, 'test-openai-key'));
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind to a port');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('agent Telegram identity binding', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    processInputMock.mockReset();
    checkExternalAccountMock.mockReset();
    createOnboardUrlWithShortLinkMock.mockReset();
    createLoginUrlWithShortLinkMock.mockReset();
    getWalletBySessionMock.mockReset();
    process.env = {
      ...originalEnv,
      AGENT_INGEST_SECRET: 'test-agent-ingest-secret',
    };
    processInputMock.mockImplementation(async (state: any) => ({
      ...state,
      response_message: `processed:${state.session_id}`,
      success: true,
    }));
    createOnboardUrlWithShortLinkMock.mockResolvedValue({ url: 'https://app.example.com/create-account' });
    createLoginUrlWithShortLinkMock.mockResolvedValue({ url: 'https://app.example.com/login' });
    getWalletBySessionMock.mockResolvedValue({ public_key: 'G'.padEnd(56, 'A') });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses the Telegram external account session instead of a stale incoming session_id', async () => {
    const staleSessionId = '11111111-1111-4111-8111-111111111111';
    const linkedSessionId = '22222222-2222-4222-8222-222222222222';
    const repository = createRepository({
      [staleSessionId]: {
        user_id: 'old@example.com',
        email: 'old@example.com',
        session_token: 'stale-token',
        last_activity: new Date().toISOString(),
      },
      [linkedSessionId]: {
        user_id: 'alice@example.com',
        email: 'alice@example.com',
        session_token: 'linked-token',
        public_key: 'G'.padEnd(56, 'B'),
        last_activity: new Date().toISOString(),
      },
    });
    checkExternalAccountMock.mockResolvedValue({
      provider: 'telegram',
      provider_user_id: '777',
      session_id: linkedSessionId,
      user_id: 'alice@example.com',
    });

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-ingest-secret': 'test-agent-ingest-secret' },
        body: JSON.stringify({
          query: 'balance',
          session_id: staleSessionId,
          source: 'telegram',
          metadata: {
            from_id: '777',
            provider_user_id: '777',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.session_id).toBe(linkedSessionId);
      expect(payload.message).toBe(`processed:${linkedSessionId}`);
      expect(processInputMock).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: linkedSessionId,
          session_data: expect.objectContaining({ user_id: 'alice@example.com' }),
          action_params: expect.objectContaining({
            external_provider: 'telegram',
            external_provider_user_id: '777',
          }),
        })
      );
    });
  });

  it('requires re-login when the mapped Telegram session belongs to a different account owner', async () => {
    const staleSessionId = '11111111-1111-4111-8111-111111111111';
    const linkedSessionId = '22222222-2222-4222-8222-222222222222';
    const repository = createRepository({
      [staleSessionId]: {
        user_id: 'old@example.com',
        email: 'old@example.com',
        session_token: 'stale-token',
        last_activity: new Date().toISOString(),
      },
      [linkedSessionId]: {
        user_id: 'bob@example.com',
        email: 'bob@example.com',
        session_token: 'linked-token',
        public_key: 'G'.padEnd(56, 'B'),
        last_activity: new Date().toISOString(),
      },
    });
    checkExternalAccountMock.mockResolvedValue({
      provider: 'telegram',
      provider_user_id: '777',
      session_id: linkedSessionId,
      user_id: 'alice@example.com',
    });

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-ingest-secret': 'test-agent-ingest-secret' },
        body: JSON.stringify({
          query: 'balance',
          session_id: staleSessionId,
          source: 'telegram',
          metadata: {
            from_id: '777',
            provider_user_id: '777',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.onboardingRequired).toBe(true);
      expect(payload.reason).toBe('external_identity_mismatch');
      expect(payload.creationUrl).toBe('https://app.example.com/login');
      expect(processInputMock).not.toHaveBeenCalled();
    });
  });
});
