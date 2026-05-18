const mockSupabaseInsert = jest.fn();
const mockSupabaseFrom = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFrom(...args),
  },
}));

import { EvolutionService } from '../src/api/services/evolution.service';

async function flushBackgroundWork() {
  for (let index = 0; index < 5; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('EvolutionService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    const reservedDedupeKeys = new Set<string>();
    mockSupabaseInsert.mockReset();
    mockSupabaseFrom.mockReset();
    mockSupabaseFrom.mockReturnValue({ insert: mockSupabaseInsert });
    mockSupabaseInsert.mockImplementation(async (row: any) => {
      const key = String(row?.idempotency_key || '');
      if (reservedDedupeKeys.has(key)) {
        return {
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
          },
        };
      }
      reservedDedupeKeys.add(key);
      return { error: null };
    });
    process.env = {
      ...originalEnv,
      EVOLUTION_API_URL: 'http://evolution.local',
      EVOLUTION_API_KEY: 'evolution-key',
      EVOLUTION_INSTANCE: 'main',
      INTERNAL_BACKEND_URL: 'http://backend.local',
      EVOLUTION_AGENT_URL: 'http://backend.local/api/agent/query',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('forwards incoming WhatsApp text to the agent query endpoint and sends the agent reply', async () => {
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [url] = args;
      const normalizedUrl = String(url);
      if (normalizedUrl === 'http://backend.local/api/external/check-account') {
        return new Response(JSON.stringify({
          success: true,
          exists: true,
          sessionId: '22222222-2222-4222-8222-222222222222',
        }), { status: 200 });
      }
      if (normalizedUrl === 'http://backend.local/api/agent/query') {
        return new Response(JSON.stringify({
          success: true,
          message: 'Seu saldo esta disponivel.',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const result = await EvolutionService.handleWebhook({
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-agent-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'qual meu saldo?',
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      received: true,
      replied: true,
      recipient: '5519981808102',
      instance: 'main',
    }));

    await flushBackgroundWork();

    const agentCall = fetchMock.mock.calls.find(([url]) => String(url) === 'http://backend.local/api/agent/query');
    expect(agentCall).toBeTruthy();
    const agentInit = agentCall?.[1] as RequestInit | undefined;
    const agentBody = JSON.parse(String(agentInit?.body || '{}'));
    expect(agentBody).toMatchObject({
      query: 'qual meu saldo?',
      session_id: '22222222-2222-4222-8222-222222222222',
      source: 'whatsapp',
      metadata: {
        channel: 'whatsapp',
        provider: 'whatsapp',
        provider_user_id: '5519981808102',
        phone_number: '5519981808102',
        remote_jid: '5519981808102@s.whatsapp.net',
        instance: 'main',
        message_id: 'evolution-agent-test-1',
      },
    });
    expect(sendTextSpy).toHaveBeenCalledWith('main', '5519981808102', 'Seu saldo esta disponivel.');
  });

  it('does not call the agent for unsupported empty messages', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const result = await EvolutionService.handleWebhook({
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-empty-test-1',
          fromMe: false,
        },
        message: {
          audioMessage: { seconds: 3 },
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      received: true,
      replied: false,
      skipped: 'empty_or_unsupported_message',
      recipient: '5519981808102',
      instance: 'main',
    }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendTextSpy).not.toHaveBeenCalled();
  });

  it('does not send the failure fallback when the generated agent reply send times out', async () => {
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [url] = args;
      const normalizedUrl = String(url);
      if (normalizedUrl === 'http://backend.local/api/external/check-account') {
        return new Response(JSON.stringify({
          success: true,
          exists: true,
          sessionId: '22222222-2222-4222-8222-222222222222',
        }), { status: 200 });
      }
      if (normalizedUrl === 'http://backend.local/api/agent/query') {
        return new Response(JSON.stringify({
          success: true,
          message: 'Estou aqui e funcionando.',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest
      .spyOn(EvolutionService, 'sendText')
      .mockRejectedValueOnce(new Error('This operation was aborted'));

    const result = await EvolutionService.handleWebhook({
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-send-timeout-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'teste',
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      received: true,
      replied: true,
      recipient: '5519981808102',
      instance: 'main',
    }));

    await flushBackgroundWork();

    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    expect(sendTextSpy).toHaveBeenCalledWith('main', '5519981808102', 'Estou aqui e funcionando.');
  });

  it('does not send a user-visible fallback when the agent request fails by default', async () => {
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [url] = args;
      const normalizedUrl = String(url);
      if (normalizedUrl === 'http://backend.local/api/external/check-account') {
        return new Response(JSON.stringify({
          success: true,
          exists: true,
          sessionId: '22222222-2222-4222-8222-222222222222',
        }), { status: 200 });
      }
      if (normalizedUrl === 'http://backend.local/api/agent/query') {
        return new Response(JSON.stringify({
          success: false,
          message: 'agent busy',
        }), { status: 503 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const result = await EvolutionService.handleWebhook({
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-agent-failure-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'ola fallback',
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      received: true,
      replied: true,
      recipient: '5519981808102',
      instance: 'main',
    }));

    await flushBackgroundWork();

    expect(sendTextSpy).not.toHaveBeenCalled();
  });

  it('deduplicates repeated Evolution delivery for the same text even when message ids differ', async () => {
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [url] = args;
      const normalizedUrl = String(url);
      if (normalizedUrl === 'http://backend.local/api/external/check-account') {
        return new Response(JSON.stringify({
          success: true,
          exists: true,
          sessionId: '22222222-2222-4222-8222-222222222222',
        }), { status: 200 });
      }
      if (normalizedUrl === 'http://backend.local/api/agent/query') {
        return new Response(JSON.stringify({
          success: true,
          message: 'Resposta unica.',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const basePayload = {
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-duplicate-content-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'ola duplicado',
        },
      },
    };

    const first = await EvolutionService.handleWebhook(basePayload);
    const second = await EvolutionService.handleWebhook({
      ...basePayload,
      data: {
        ...basePayload.data,
        key: {
          ...basePayload.data.key,
          id: 'evolution-duplicate-content-test-2',
        },
      },
    });

    expect(first).toEqual(expect.objectContaining({ replied: true }));
    expect(second).toEqual(expect.objectContaining({
      replied: false,
      skipped: 'duplicate_content',
    }));

    await flushBackgroundWork();

    const agentCalls = fetchMock.mock.calls.filter(([url]) => String(url) === 'http://backend.local/api/agent/query');
    expect(agentCalls).toHaveLength(1);
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
  });

  it('skips the agent call when persistent dedupe already reserved the incoming content', async () => {
    mockSupabaseInsert.mockImplementation(async (row: any) => {
      const key = String(row?.idempotency_key || '');
      if (key.startsWith('evolution_incoming_content_')) {
        return {
          error: {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
          },
        };
      }
      return { error: null };
    });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const result = await EvolutionService.handleWebhook({
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-persistent-duplicate-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'ola persistente duplicado',
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      received: true,
      replied: false,
      skipped: 'duplicate_persistent_content',
      recipient: '5519981808102',
      instance: 'main',
    }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendTextSpy).not.toHaveBeenCalled();
  });
});
