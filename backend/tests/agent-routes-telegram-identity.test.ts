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
      sessions[sessionId] = {
        ...(sessions[sessionId] || {}),
        ...data,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
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

  it('passes authenticated web session token into agent state for account tools', async () => {
    const webSessionId = '11111111-1111-4111-8111-111111111111';
    const repository = createRepository({
      [webSessionId]: {
        user_id: 'web@example.com',
        email: 'web@example.com',
        session_token: 'cookie-token',
        public_key: 'G'.padEnd(56, 'W'),
        last_activity: new Date().toISOString(),
      },
    });
    checkExternalAccountMock.mockResolvedValue(null);

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': 'cookie-token',
        },
        body: JSON.stringify({
          query: 'colocar 100 em rendimento',
          session_id: webSessionId,
          source: 'web',
          metadata: {
            browser_id: 'browser-1',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.session_id).toBe(webSessionId);
      expect(processInputMock).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: webSessionId,
          action_params: expect.objectContaining({
            session_token: 'cookie-token',
          }),
        })
      );
    });
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
        password_hash: 'hashed-pin',
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
            session_token: 'linked-token',
          }),
        })
      );
    });
  });

  it('refreshes an expired WhatsApp mapped session instead of clearing it', async () => {
    const linkedSessionId = '33333333-3333-4333-8333-333333333333';
    const repository = createRepository({
      [linkedSessionId]: {
        user_id: 'whatsapp@example.com',
        email: 'whatsapp@example.com',
        session_token: 'linked-token',
        password_hash: 'hashed-pin',
        public_key: 'G'.padEnd(56, 'C'),
        last_activity: '2020-01-01T00:00:00.000Z',
      },
    });
    checkExternalAccountMock.mockResolvedValue({
      provider: 'whatsapp',
      provider_user_id: '5511999999999',
      session_id: linkedSessionId,
      user_id: 'whatsapp@example.com',
    });

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-ingest-secret': 'test-agent-ingest-secret' },
        body: JSON.stringify({
          query: 'quero ver rendimentos',
          session_id: linkedSessionId,
          source: 'whatsapp',
          metadata: {
            provider_user_id: '+55 11 99999-9999',
            phone_number: '+55 11 99999-9999',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.session_id).toBe(linkedSessionId);
      expect(payload.message).toBe(`processed:${linkedSessionId}`);
      expect(repository.clearSession).not.toHaveBeenCalled();
      expect(repository.saveSession).toHaveBeenCalledWith(
        linkedSessionId,
        expect.objectContaining({
          user_id: 'whatsapp@example.com',
          session_token: 'linked-token',
        })
      );
      expect(processInputMock).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: linkedSessionId,
          session_data: expect.objectContaining({ user_id: 'whatsapp@example.com' }),
          action_params: expect.objectContaining({
            external_provider: 'whatsapp',
            external_provider_user_id: '5511999999999',
            session_token: 'linked-token',
          }),
        })
      );
    });
  });

  it('sends unlinked WhatsApp users to account creation instead of PIN login', async () => {
    const repository = createRepository({});
    checkExternalAccountMock.mockResolvedValue(null);

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-ingest-secret': 'test-agent-ingest-secret' },
        body: JSON.stringify({
          query: 'hello',
          language: 'en',
          source: 'whatsapp',
          metadata: {
            provider_user_id: '+55 11 99999-9999',
            phone_number: '+55 11 99999-9999',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.onboardingRequired).toBe(true);
      expect(payload.reason).toBe('not_linked');
      expect(payload.creationUrl).toBe('https://app.example.com/create-account');
      expect(payload.message).toContain('create your account');
      expect(payload.message).not.toContain('PIN');
      expect(createOnboardUrlWithShortLinkMock).toHaveBeenCalledWith('whatsapp', '5511999999999', expect.objectContaining({
        source: 'whatsapp',
      }));
      expect(createLoginUrlWithShortLinkMock).not.toHaveBeenCalled();
      expect(processInputMock).not.toHaveBeenCalled();
    });
  });

  it('treats WhatsApp mappings without an account email as onboarding placeholders', async () => {
    const linkedSessionId = '44444444-4444-4444-8444-444444444444';
    const repository = createRepository({
      [linkedSessionId]: {
        user_id: 'user_1780000000000',
        email: '',
        session_token: 'placeholder-token',
        last_activity: new Date().toISOString(),
      },
    });
    checkExternalAccountMock.mockResolvedValue({
      provider: 'whatsapp',
      provider_user_id: '5511999999999',
      session_id: linkedSessionId,
      user_id: 'user_1780000000000',
    });

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-ingest-secret': 'test-agent-ingest-secret' },
        body: JSON.stringify({
          query: 'quero deslogar',
          source: 'whatsapp',
          metadata: {
            provider_user_id: '+55 11 99999-9999',
            phone_number: '+55 11 99999-9999',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.onboardingRequired).toBe(true);
      expect(payload.reason).toBe('missing_account_identity');
      expect(payload.creationUrl).toBe('https://app.example.com/create-account');
      expect(createOnboardUrlWithShortLinkMock).toHaveBeenCalledWith('whatsapp', '5511999999999', expect.objectContaining({
        source: 'whatsapp',
      }));
      expect(createLoginUrlWithShortLinkMock).not.toHaveBeenCalled();
      expect(processInputMock).not.toHaveBeenCalled();
    });
  });

  it('treats WhatsApp mappings with a missing database session as not onboarded', async () => {
    const repository = createRepository({});
    checkExternalAccountMock.mockResolvedValue({
      provider: 'whatsapp',
      provider_user_id: '5511999999999',
      session_id: '55555555-5555-4555-8555-555555555555',
      user_id: 'real@example.com',
    });

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-ingest-secret': 'test-agent-ingest-secret' },
        body: JSON.stringify({
          query: 'olaaa',
          source: 'whatsapp',
          metadata: {
            provider_user_id: '+55 11 99999-9999',
            phone_number: '+55 11 99999-9999',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.onboardingRequired).toBe(true);
      expect(payload.reason).toBe('missing_account_session');
      expect(payload.creationUrl).toBe('https://app.example.com/create-account');
      expect(createOnboardUrlWithShortLinkMock).toHaveBeenCalledWith('whatsapp', '5511999999999', expect.objectContaining({
        source: 'whatsapp',
      }));
      expect(createLoginUrlWithShortLinkMock).not.toHaveBeenCalled();
      expect(processInputMock).not.toHaveBeenCalled();
    });
  });

  it('treats WhatsApp mappings without a wallet row as not onboarded', async () => {
    const linkedSessionId = '66666666-6666-4666-8666-666666666666';
    const repository = createRepository({
      [linkedSessionId]: {
        user_id: 'real@example.com',
        email: 'real@example.com',
        session_token: 'linked-token',
        password_hash: 'hashed-pin',
        last_activity: new Date().toISOString(),
      },
    });
    checkExternalAccountMock.mockResolvedValue({
      provider: 'whatsapp',
      provider_user_id: '5511999999999',
      session_id: linkedSessionId,
      user_id: 'real@example.com',
    });
    getWalletBySessionMock.mockResolvedValueOnce(null);

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-ingest-secret': 'test-agent-ingest-secret' },
        body: JSON.stringify({
          query: 'olaaa',
          source: 'whatsapp',
          metadata: {
            provider_user_id: '+55 11 99999-9999',
            phone_number: '+55 11 99999-9999',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.onboardingRequired).toBe(true);
      expect(payload.reason).toBe('missing_account_wallet');
      expect(payload.creationUrl).toBe('https://app.example.com/create-account');
      expect(createOnboardUrlWithShortLinkMock).toHaveBeenCalledWith('whatsapp', '5511999999999', expect.objectContaining({
        source: 'whatsapp',
      }));
      expect(createLoginUrlWithShortLinkMock).not.toHaveBeenCalled();
      expect(processInputMock).not.toHaveBeenCalled();
    });
  });

  it('treats WhatsApp mappings without a PIN credential as not onboarded', async () => {
    const linkedSessionId = '77777777-7777-4777-8777-777777777777';
    const repository = createRepository({
      [linkedSessionId]: {
        user_id: 'real@example.com',
        email: 'real@example.com',
        session_token: 'linked-token',
        public_key: 'G'.padEnd(56, 'D'),
        last_activity: new Date().toISOString(),
      },
    });
    checkExternalAccountMock.mockResolvedValue({
      provider: 'whatsapp',
      provider_user_id: '5511999999999',
      session_id: linkedSessionId,
      user_id: 'real@example.com',
    });

    await withAgentServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-agent-ingest-secret': 'test-agent-ingest-secret' },
        body: JSON.stringify({
          query: 'quero deslogar',
          source: 'whatsapp',
          metadata: {
            provider_user_id: '+55 11 99999-9999',
            phone_number: '+55 11 99999-9999',
          },
        }),
      });
      const payload = await response.json() as any;

      expect(response.status).toBe(200);
      expect(payload.onboardingRequired).toBe(true);
      expect(payload.reason).toBe('missing_account_credentials');
      expect(payload.creationUrl).toBe('https://app.example.com/create-account');
      expect(createOnboardUrlWithShortLinkMock).toHaveBeenCalledWith('whatsapp', '5511999999999', expect.objectContaining({
        source: 'whatsapp',
      }));
      expect(createLoginUrlWithShortLinkMock).not.toHaveBeenCalled();
      expect(processInputMock).not.toHaveBeenCalled();
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
        password_hash: 'hashed-pin',
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
