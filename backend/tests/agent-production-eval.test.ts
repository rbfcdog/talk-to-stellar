jest.mock('../src/api/agent/tools', () => ({
  ALL_TOOLS: [],
  executeTool: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import { AgentGraph } from '../src/api/agent/graph';
import { executeTool } from '../src/api/agent/tools';
import { ActionType, AgentState, IntentType } from '../src/api/agent/types';

const executeToolMock = executeTool as jest.Mock;

function createRepository() {
  return {
    saveMessage: jest.fn().mockResolvedValue(undefined),
    saveState: jest.fn().mockResolvedValue(undefined),
  };
}

function createState(input: string, hasWallet = true): AgentState {
  return {
    session_id: 'eval-session',
    session_data: {
      session_token: 'eval-session-token',
      user_id: 'eval-user',
      email: 'eval@example.com',
      public_key: hasWallet ? 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' : '',
      created_at: new Date('2026-05-23T12:00:00.000Z').toISOString(),
      last_activity: new Date('2026-05-23T12:00:00.000Z').toISOString(),
    },
    messages: [],
    current_input: input,
    detected_intent: IntentType.GENERAL,
    action_type: ActionType.NONE,
    action_params: {},
    response_message: '',
    success: false,
  };
}

describe('Agent production evals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes cost comparison to show_savings_calculator and preserves WhatsApp rich formatting', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');
    const whatsappReadyMessage = [
      '💸 *Simulação de envio: R$ 5.000*',
      '',
      '✅ Você recebe: *US$ 970,87*',
      '📉 Taxa TalkToStellar: R$ 15,00 (0,30%)',
      '',
      '━━━━━━━━━━━━━━',
      '🏦 Banco tradicional cobraria: R$ 175,00',
      '*Você economiza: R$ 160,00*',
    ].join('\n');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: whatsappReadyMessage,
    }));

    const result = await graph.processInput(createState('quanto custa enviar 5000 reais?', false));

    expect(executeToolMock).toHaveBeenCalledWith('show_savings_calculator', {
      brl_amount: '5000',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('💸 *Simulação de envio: R$ 5.000*');
    expect(result.response_message).toContain('✅ Você recebe: *US$ 970,87*');
    expect(result.response_message).toContain('*Você economiza: R$ 160,00*');
    expect(repository.saveMessage).toHaveBeenCalledWith('eval-session', 'assistant', result.response_message);
  });

  it('does not answer fee comparison through generic financial memory tools', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: '💸 *Simulação de envio: R$ 5.000*\n\n*Você economiza: R$ 160,00*\nBanco tradicional cobraria: R$ 175,00',
    }));

    await graph.processInput(createState('vale a pena comparado com o banco enviar 5000 reais?'));

    expect(executeToolMock).toHaveBeenCalledWith('show_savings_calculator', {
      brl_amount: '5000',
    });
    expect(executeToolMock).not.toHaveBeenCalledWith('get_savings_comparison', expect.anything());
    expect(executeToolMock).not.toHaveBeenCalledWith('get_financial_memory', expect.anything());
  });

  it('routes annual savings summary to show_annual_savings_summary', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: '📊 *Seu resumo de economia — 2026*\n\n💰 *Total economizado: R$ 892*\nvs banco tradicional (3,5%)',
    }));

    const result = await graph.processInput(createState('quanto eu economizei esse ano?'));

    expect(executeToolMock).toHaveBeenCalledWith('show_annual_savings_summary', {
      session_id: 'eval-session',
      user_id: 'eval-user',
      public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(result.response_message).toContain('📊 *Seu resumo de economia');
    expect(result.response_message).toContain('💰 *Total economizado');
  });

  it('keeps the rich-message allowlist narrow and sanitizes unapproved decorative output', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'production prompt') as any;

    const sanitized = graph.sanitizeAssistantResponse('✅ Pronto [abrir](https://talktostellar.test/r/abc)');

    expect(sanitized).not.toContain('✅');
    expect(sanitized).toBe('Pronto abrir:\nhttps://talktostellar.test/r/abc');
  });

  it('keeps the system prompt anchored to production agent policies and eval-protected tools', () => {
    const routesPath = path.resolve(__dirname, '../src/api/agent/routes.ts');
    const source = fs.readFileSync(routesPath, 'utf8');

    expect(source).toContain('## PRODUCTION AGENT CONTRACT');
    expect(source).toContain('Deterministic/tool-first policy');
    expect(source).toContain('Contact validation is strict');
    expect(source).toContain('Never answer fee comparison only with free text');
    expect(source).toContain('get_conversion_preview');
    expect(source).toContain('show_savings_calculator');
    expect(source).toContain('send_receipt_with_savings');
    expect(source).toContain('show_annual_savings_summary');
    expect(source).toContain('Do not expose SQL, schema cache, provider stack traces');
  });
});
