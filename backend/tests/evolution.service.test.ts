const mockSupabaseInsert = jest.fn();
const mockSupabaseUpdate = jest.fn();
const mockSupabaseDelete = jest.fn();
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
    mockSupabaseUpdate.mockReset();
    mockSupabaseDelete.mockReset();
    mockSupabaseFrom.mockReset();
    mockSupabaseFrom.mockReturnValue({
      insert: mockSupabaseInsert,
      update: mockSupabaseUpdate,
      delete: mockSupabaseDelete,
    });
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
    mockSupabaseUpdate.mockImplementation(() => {
      const chain: any = {
        error: null,
        eq: jest.fn(() => chain),
      };
      return chain;
    });
    mockSupabaseDelete.mockImplementation(() => {
      let key = '';
      const chain: any = {
        error: null,
        eq: jest.fn((column: string, value: string) => {
          if (column === 'idempotency_key') key = value;
          if (column === 'status' && value === 'processing' && key) reservedDedupeKeys.delete(key);
          return chain;
        }),
      };
      return chain;
    });
    process.env = {
      ...originalEnv,
      EVOLUTION_API_URL: 'http://evolution.local',
      EVOLUTION_API_KEY: 'evolution-key',
      EVOLUTION_INSTANCE: 'main',
      INTERNAL_BACKEND_URL: 'http://backend.local',
      EVOLUTION_AGENT_URL: 'http://backend.local/api/agent/query',
      AGENT_INGEST_SECRET: 'test-agent-ingest-secret',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('requires a webhook secret in production-like environments', () => {
    process.env.NODE_ENV = 'production';
    process.env.EVOLUTION_WEBHOOK_SECRET = '';

    expect(EvolutionService.verifyWebhookSecret('anything')).toBe(false);

    process.env.EVOLUTION_WEBHOOK_SECRET = 'expected-secret';
    expect(EvolutionService.verifyWebhookSecret('wrong-secret')).toBe(false);
    expect(EvolutionService.verifyWebhookSecret('expected-secret')).toBe(true);
  });

  it('configures the Evolution incoming message webhook for the backend URL', async () => {
    process.env.PUBLIC_BACKEND_URL = 'https://api.example.com';
    process.env.EVOLUTION_WEBHOOK_SECRET = 'webhook-secret';
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [url, init] = args;
      expect(String(url)).toBe('http://evolution.local/webhook/set/main');
      expect((init as RequestInit).method).toBe('POST');
      expect((init as RequestInit).headers).toMatchObject({
        'Content-Type': 'application/json',
        apikey: 'evolution-key',
      });
      const body = JSON.parse(String((init as RequestInit).body || '{}'));
      expect(body).toMatchObject({
        enabled: true,
        url: 'https://api.example.com/api/evolution/webhook?secret=webhook-secret',
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT'],
      });
      return new Response(JSON.stringify({ webhook: { enabled: true } }), { status: 201 });
    });
    global.fetch = fetchMock as any;

    await expect(EvolutionService.configureWebhook()).resolves.toEqual(expect.objectContaining({
      success: true,
      webhookUrl: 'https://api.example.com/api/evolution/webhook?secret=webhook-secret',
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    expect((agentInit?.headers as Record<string, string>)?.['x-agent-ingest-secret']).toBe('test-agent-ingest-secret');
    expect((agentInit?.headers as Record<string, string>)?.['Idempotency-Key']).toMatch(/^evolution_query_/);
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
    expect(sendTextSpy).toHaveBeenCalledWith('main', '5519981808102', 'Seu saldo esta disponivel.', { reliable: true, attempts: 1 });
  });

  it('replaces generic capability replies with the detailed WhatsApp help message', async () => {
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
          message: [
            'Posso ajudar com:',
            '1. Contatos',
            '2. Saldo',
            '3. PIX',
            'Diga o que quer fazer em uma frase curta.',
          ].join('\n'),
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    await EvolutionService.handleWebhook({
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-detailed-help-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'o que posso fazer por aqui?',
        },
      },
    });

    await flushBackgroundWork();

    expect(sendTextSpy).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      expect.stringContaining('Posso ajudar com sua conta TalkToStellar:'),
      { reliable: true, attempts: 1 }
    );
    const sentText = String(sendTextSpy.mock.calls[0]?.[2] || '');
    expect(sentText).toContain('Contatos — listar, adicionar e escolher destinatários salvos');
    expect(sentText).toContain('PIX — trazer dinheiro, retirar para uma chave PIX ou pagar alguém via PIX');
    expect(sentText).toContain('Aplicações e posições');
    expect(sentText).toContain('Pode escrever normal');
  });

  it('strips multi-topic Markdown explanation blocks before sending to WhatsApp', async () => {
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
          message: [
            '## PIX',
            'PIX is the fastest way to move money in your account.',
            '',
            '---',
            '',
            '## ASSETS',
            'Assets are the currencies that can appear in your account.',
          ].join('\n'),
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    await EvolutionService.handleWebhook({
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-markdown-explanation-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'helooo',
        },
      },
    });

    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    const sentText = String(sendTextSpy.mock.calls[0]?.[2] || '');
    expect(sentText).toBe('PIX is the fastest way to move money in your account.');
    expect(sentText).not.toContain('##');
    expect(sentText).not.toContain('---');
    expect(sentText).not.toContain('ASSETS');
  });

  it('keeps Evolution instanceId as diagnostic metadata and uses the configured instance name for delivery', async () => {
    process.env.EVOLUTION_INSTANCE = 'TalkToStellar';
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
          message: 'Resposta pelo WhatsApp.',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const result = await EvolutionService.handleWebhook({
      event: 'MESSAGES_UPSERT',
      data: {
        key: {
          remoteJid: '5519997624114@s.whatsapp.net',
          id: 'evolution-instance-id-test-1',
          fromMe: false,
        },
        instanceId: '635afaa8-b4d2-4e04-8b35-3093d16ba1af',
        message: {
          conversation: 'olaa',
        },
      },
    });

    expect(result).toEqual(expect.objectContaining({
      received: true,
      replied: true,
      recipient: '5519997624114',
      instance: 'TalkToStellar',
    }));

    await flushBackgroundWork();

    const checkAccountCall = fetchMock.mock.calls.find(([url]) => String(url) === 'http://backend.local/api/external/check-account');
    const checkAccountBody = JSON.parse(String((checkAccountCall?.[1] as RequestInit | undefined)?.body || '{}'));
    expect(checkAccountBody).toMatchObject({
      provider: 'whatsapp',
      provider_user_id: '5519997624114',
      instance: 'TalkToStellar',
      instance_id: '635afaa8-b4d2-4e04-8b35-3093d16ba1af',
    });

    const agentCall = fetchMock.mock.calls.find(([url]) => String(url) === 'http://backend.local/api/agent/query');
    const agentBody = JSON.parse(String((agentCall?.[1] as RequestInit | undefined)?.body || '{}'));
    expect(agentBody.metadata).toMatchObject({
      provider: 'whatsapp',
      provider_user_id: '5519997624114',
      instance: 'TalkToStellar',
      instance_id: '635afaa8-b4d2-4e04-8b35-3093d16ba1af',
    });
    expect(sendTextSpy).toHaveBeenCalledWith('TalkToStellar', '5519997624114', 'Resposta pelo WhatsApp.', { reliable: true, attempts: 1 });
  });

  it('normalizes outbound numbers and retries reliable completion messages after transient Evolution failures', async () => {
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [url, init] = args;
      const normalizedUrl = String(url);
      if (normalizedUrl !== 'http://evolution.local/message/sendText/main') {
        throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
      }
      const body = JSON.parse(String((init as RequestInit).body || '{}'));
      expect(body.number).toBe('5519981808102');
      expect(body.text).toBe('Pagamento concluido.');

      if (fetchMock.mock.calls.length === 1) {
        return new Response(JSON.stringify({ error: 'temporary unavailable' }), { status: 503 });
      }
      return new Response(JSON.stringify({ key: { id: 'msg-1' } }), { status: 201 });
    });
    global.fetch = fetchMock as any;

    const result = await EvolutionService.sendText(
      'main',
      'whatsapp:+55 19 98180-8102@s.whatsapp.net',
      'Pagamento concluido.',
      { reliable: true, attempts: 2, timeoutMs: 5000 }
    );

    expect(result).toEqual({ key: { id: 'msg-1' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('discovers the real Evolution instance when the configured fallback instance does not exist', async () => {
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [url, init] = args;
      const normalizedUrl = String(url);
      if (normalizedUrl === 'http://evolution.local/message/sendText/main') {
        return new Response(JSON.stringify({
          status: 404,
          error: 'Not Found',
          response: {
            message: ['The "main" instance does not exist'],
          },
        }), { status: 404 });
      }
      if (normalizedUrl === 'http://evolution.local/instance/fetchInstances') {
        return new Response(JSON.stringify([
          {
            instance: {
              instanceName: 'TalkToStellar',
              status: 'open',
            },
          },
        ]), { status: 200 });
      }
      if (normalizedUrl === 'http://evolution.local/message/sendText/TalkToStellar') {
        const body = JSON.parse(String((init as RequestInit).body || '{}'));
        expect(body.number).toBe('5519997624114');
        expect(body.text).toBe('Pagamento concluido.');
        return new Response(JSON.stringify({ sent: true, instance: 'TalkToStellar' }), { status: 201 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;

    await expect(EvolutionService.sendText(
      'main',
      '5519997624114',
      'Pagamento concluido.',
      { reliable: true, attempts: 1, timeoutMs: 5000 }
    )).resolves.toEqual({ sent: true, instance: 'TalkToStellar' });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://evolution.local/message/sendText/main',
      'http://evolution.local/instance/fetchInstances',
      'http://evolution.local/message/sendText/TalkToStellar',
    ]);
  });

  it('tries the Evolution v1 textMessage payload shape when the v2 sendText body is rejected', async () => {
    const requestBodies: any[] = [];
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [, init] = args;
      const body = JSON.parse(String((init as RequestInit).body || '{}'));
      requestBodies.push(body);
      if (requestBodies.length === 1) {
        return new Response(JSON.stringify({ message: 'bad payload' }), { status: 400 });
      }
      return new Response(JSON.stringify({ sent: true }), { status: 200 });
    });
    global.fetch = fetchMock as any;

    await expect(EvolutionService.sendText('main', '5519981808102', 'ok', { reliable: true, attempts: 1 }))
      .resolves.toEqual({ sent: true });

    expect(requestBodies[0]).toMatchObject({
      number: '5519981808102',
      text: 'ok',
      delay: 300,
      linkPreview: false,
    });
    expect(requestBodies[1]).toMatchObject({
      number: '5519981808102',
      textMessage: {
        text: 'ok',
      },
      options: {
        delay: 300,
        presence: 'composing',
        linkPreview: false,
      },
    });
  });

  it('preserves WhatsApp markdown markers in outbound text payloads', async () => {
    const whatsappText = '✅ *Transferência concluída*\n_Taxa baixa_\nVocê economizou *R$ 160,00*';
    const requestBodies: any[] = [];
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [, init] = args;
      const body = JSON.parse(String((init as RequestInit).body || '{}'));
      requestBodies.push(body);
      return new Response(JSON.stringify({ sent: true }), { status: 200 });
    });
    global.fetch = fetchMock as any;

    await expect(EvolutionService.sendText('main', '5519981808102', whatsappText, { reliable: true, attempts: 1 }))
      .resolves.toEqual({ sent: true });

    expect(requestBodies[0]).toMatchObject({
      number: '5519981808102',
      text: whatsappText,
    });
    expect(requestBodies[0].text).not.toContain('\\*');
    expect(requestBodies[0].text).not.toContain('\\_');
  });

  it('tries a WhatsApp JID outbound number candidate when plain number shapes are rejected', async () => {
    const attemptedNumbers: string[] = [];
    const fetchMock = jest.fn(async (...args: any[]) => {
      const [, init] = args;
      const body = JSON.parse(String((init as RequestInit).body || '{}'));
      attemptedNumbers.push(String(body.number || ''));
      if (String(body.number || '') === '5519981808102@s.whatsapp.net') {
        return new Response(JSON.stringify({ sent: true, number: body.number }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'number format rejected' }), { status: 400 });
    });
    global.fetch = fetchMock as any;

    await expect(EvolutionService.sendText('main', '+55 19 98180-8102', 'ok', { reliable: true, attempts: 1 }))
      .resolves.toEqual({ sent: true, number: '5519981808102@s.whatsapp.net' });

    expect(attemptedNumbers).toContain('5519981808102');
    expect(attemptedNumbers).toContain('+5519981808102');
    expect(attemptedNumbers).toContain('5519981808102@s.whatsapp.net');
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

  it('queues the agent reply when outbound WhatsApp delivery is uncertain', async () => {
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
      .mockRejectedValueOnce(new Error('This operation was aborted'))
      .mockResolvedValueOnce({ success: true });

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
      queued: true,
      recipient: '5519981808102',
      instance: 'main',
    }));

    await flushBackgroundWork();

    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    expect(sendTextSpy).toHaveBeenCalledWith('main', '5519981808102', 'Estou aqui e funcionando.', { reliable: true, attempts: 1 });
    expect(mockSupabaseFrom).toHaveBeenCalledWith('evolution_outbound_queue');
    expect(mockSupabaseInsert).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'whatsapp',
      instance: 'main',
      recipient: '5519981808102',
      remote_jid: '5519981808102@s.whatsapp.net',
      message_id: 'evolution-send-timeout-test-1',
      text: 'Estou aqui e funcionando.',
      status: 'pending',
      attempts: 0,
    }));
  });

  it('drains queued outbound WhatsApp replies without re-running the agent', async () => {
    const updatePayloads: any[] = [];
    const queuedRow = {
      dedupe_key: 'evolution_outbound_message_test',
      instance: 'main',
      recipient: '5519981808102',
      text: 'Resposta pendente.',
      attempts: 0,
      max_attempts: 8,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    };
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table !== 'evolution_outbound_queue') {
        return {
          insert: mockSupabaseInsert,
          update: mockSupabaseUpdate,
          delete: mockSupabaseDelete,
        };
      }
      const selectChain: any = {};
      selectChain.select = jest.fn(() => selectChain);
      selectChain.in = jest.fn(() => selectChain);
      selectChain.lte = jest.fn(() => selectChain);
      selectChain.order = jest.fn(() => selectChain);
      selectChain.limit = jest.fn(() => Promise.resolve({ data: [queuedRow], error: null }));

      return {
        select: selectChain.select,
        update: jest.fn((payload: any) => {
          updatePayloads.push(payload);
          const updateChain: any = {};
          updateChain.eq = jest.fn(() => updateChain);
          updateChain.in = jest.fn(() => Promise.resolve({ error: null }));
          updateChain.lt = jest.fn(() => Promise.resolve({ error: null }));
          updateChain.then = (resolve: any, reject: any) => Promise.resolve({ error: null }).then(resolve, reject);
          if (payload.status === 'sent' || payload.status === 'dead_letter') {
            updateChain.eq = jest.fn(() => Promise.resolve({ error: null }));
          }
          return updateChain;
        }),
      };
    });
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const result = await EvolutionService.processQueuedOutboundDeliveries(5);

    expect(result).toEqual({
      processed: 1,
      sent: 1,
      failed: 0,
      remaining: 0,
    });
    expect(sendTextSpy).toHaveBeenCalledWith('main', '5519981808102', 'Resposta pendente.', {
      reliable: true,
      attempts: 1,
      timeoutMs: 45000,
    });
    expect(updatePayloads).toContainEqual(expect.objectContaining({ status: 'sending' }));
    expect(updatePayloads).toContainEqual(expect.objectContaining({
      status: 'sent',
      attempts: 1,
      last_error: null,
    }));
  });

  it('sends the detailed capability fallback when the agent request fails', async () => {
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

    expect(sendTextSpy).toHaveBeenCalledWith(
      'main',
      '5519981808102',
      expect.stringContaining('Posso ajudar com sua conta TalkToStellar:'),
      { reliable: true, attempts: 1 }
    );
    const sentText = String(sendTextSpy.mock.calls[0]?.[2] || '');
    expect(sentText).toContain('Contatos — listar, adicionar e escolher destinatários salvos');
    expect(sentText).toContain('Melhor rota — comparar cotação, taxas e caminho');
  });

  it('opens the conversion picker when the LLM returns a generic conversion reply', async () => {
    process.env.FRONTEND_URL = 'https://app.example.com';
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
          intent: 'conversion',
          message: 'Posso ajudar com:',
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
          id: 'evolution-conversion-picker-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'quero converter dinheiro',
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
    const sentText = String(sendTextSpy.mock.calls[0]?.[2] || '');
    expect(sentText).toContain('Abra a conversão para escolher valor e moedas');
    expect(sentText).toContain('https://app.example.com/convert?from=whatsapp&lang=pt-BR&picker=1');
    expect(sentText).not.toContain('Posso converter entre');
  });

  it('answers repeated WhatsApp texts when Evolution message ids differ', async () => {
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
    expect(second).toEqual(expect.objectContaining({ replied: true }));

    await flushBackgroundWork();

    const agentCalls = fetchMock.mock.calls.filter(([url]) => String(url) === 'http://backend.local/api/agent/query');
    expect(agentCalls).toHaveLength(2);
    expect(sendTextSpy).toHaveBeenCalledTimes(2);
  });

  it('deduplicates only an exact Evolution message id replay after a reply was delivered', async () => {
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
          message: 'Resposta para replay exato.',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const payload = {
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-exact-replay-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'ola replay',
        },
      },
    };

    const first = await EvolutionService.handleWebhook(payload);
    const second = await EvolutionService.handleWebhook(payload);

    expect(first).toEqual(expect.objectContaining({
      received: true,
      replied: true,
      recipient: '5519981808102',
      instance: 'main',
    }));
    expect(second).toEqual(expect.objectContaining({
      received: true,
      replied: false,
      skipped: 'duplicate',
      recipient: '5519981808102',
      instance: 'main',
    }));

    const agentCalls = fetchMock.mock.calls.filter(([url]) => String(url) === 'http://backend.local/api/agent/query');
    expect(agentCalls).toHaveLength(1);
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
  });

  it('claims an inbound WhatsApp message before the LLM runs so concurrent webhook deliveries send one reply', async () => {
    let releaseAgent!: () => void;
    const agentGate = new Promise<void>((resolve) => {
      releaseAgent = resolve;
    });
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
        await agentGate;
        return new Response(JSON.stringify({
          success: true,
          message: 'Uma resposta apenas.',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });
    const payload = {
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-concurrent-replay-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'olaa',
        },
      },
    };

    const firstPromise = EvolutionService.handleWebhook(payload);
    const secondPromise = EvolutionService.handleWebhook(payload);
    await flushBackgroundWork();
    releaseAgent();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first).toEqual(expect.objectContaining({ replied: true }));
    expect(second).toEqual(expect.objectContaining({
      replied: false,
      skipped: 'duplicate_persistent',
    }));
    const agentCalls = fetchMock.mock.calls.filter(([url]) => String(url) === 'http://backend.local/api/agent/query');
    expect(agentCalls).toHaveLength(1);
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    expect(mockSupabaseInsert).toHaveBeenCalledTimes(2);
    expect(mockSupabaseUpdate).toHaveBeenCalledTimes(1);
  });

  it('releases the durable WhatsApp claim when processing fails so Evolution can retry', async () => {
    process.env.EVOLUTION_SEND_FAILURE_FALLBACK = 'false';
    let agentAttempts = 0;
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
        agentAttempts += 1;
        if (agentAttempts === 1) throw new Error('temporary LLM failure');
        return new Response(JSON.stringify({
          success: true,
          message: 'Resposta apos retry.',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });
    const payload = {
      event: 'MESSAGES_UPSERT',
      instance: 'main',
      data: {
        key: {
          remoteJid: '5519981808102@s.whatsapp.net',
          id: 'evolution-retry-after-failure-test-1',
          fromMe: false,
        },
        message: {
          conversation: 'tente novamente',
        },
      },
    };

    await expect(EvolutionService.handleWebhook(payload)).rejects.toThrow('temporary LLM failure');
    await expect(EvolutionService.handleWebhook(payload)).resolves.toEqual(expect.objectContaining({ replied: true }));

    expect(agentAttempts).toBe(2);
    expect(sendTextSpy).toHaveBeenCalledTimes(1);
    expect(mockSupabaseDelete).toHaveBeenCalledTimes(1);
  });

  it('does not drop rapid WhatsApp messages from the same user, including repeated text', async () => {
    const replies = ['reply 1', 'reply 2', 'reply 3', 'reply 4'];
    let agentQueryCount = 0;
    const fetchMock = jest.fn(async (...args: any[]): Promise<Response> => {
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
        const callIndex = agentQueryCount;
        agentQueryCount += 1;
        return new Response(JSON.stringify({
          success: true,
          message: replies[callIndex] || 'reply fallback',
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${normalizedUrl}`);
    });
    global.fetch = fetchMock as any;
    const sendTextSpy = jest.spyOn(EvolutionService, 'sendText').mockResolvedValue({ success: true });

    const messages = [
      'i want to make a pix transfer to 100 dollars into my account',
      'hello!! i want to make a pix transfer to 100 dollars into my account',
      'hello!! i want to make a pix transfer to 100 dollars into my account',
      'helooo',
    ];

    const results = [];
    for (const [index, text] of messages.entries()) {
      results.push(await EvolutionService.handleWebhook({
        event: 'MESSAGES_UPSERT',
        instance: 'main',
        data: {
          key: {
            remoteJid: '5519981808102@s.whatsapp.net',
            id: `evolution-rapid-message-${index + 1}`,
            fromMe: false,
          },
          message: {
            conversation: text,
          },
        },
      }));
    }

    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result).toEqual(expect.objectContaining({
        received: true,
        replied: true,
        recipient: '5519981808102',
        instance: 'main',
      }));
    }

    const agentCalls = fetchMock.mock.calls.filter((call: any[]) => String(call[0]) === 'http://backend.local/api/agent/query');
    expect(agentCalls).toHaveLength(4);
    expect(sendTextSpy).toHaveBeenCalledTimes(4);
    expect(sendTextSpy.mock.calls.map((call) => call[2])).toEqual(replies);
  });
});
