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
    action_params: {
      session_token: 'eval-session-token',
    },
    response_message: '',
    success: false,
  };
}

describe('Agent production evals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STELLAR_NETWORK = 'TESTNET';
  });

  it('routes broad capability questions to the deterministic help tool', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Guia rápido: saldo, PIX, converter, APY e ciclo completo.',
    }));

    const result = await graph.processInput(createState('olá, o que você pode fazer?'));

    expect(executeToolMock).toHaveBeenCalledWith('get_intent_help', {});
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('APY');
    expect(result.response_message).toContain('ciclo completo');
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

  it('routes public yield questions to yield tools even before login', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Options for review: dollars, CETES, reais.',
    }));

    const result = await graph.processInput(createState('show yield options', false));

    expect(executeToolMock).toHaveBeenCalledWith('get_yield_options', {
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Options for review');
  });

  it('routes yield deposits to prepare_yield_action with BRL normalized from reais', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Revisão pronta: revisar entrada 250 reais.',
    }));

    const result = await graph.processInput(createState('guardar 250 reais rendendo'));

    expect(executeToolMock).toHaveBeenCalledWith('prepare_yield_action', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      action: 'deposit',
      amount: '250',
      asset_code: 'BRL',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Revisão pronta');
  });

  it('routes yield balance checks to get_yield_balance for CETES', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Você tem 40 CETES em posição atual.',
    }));

    const result = await graph.processInput(createState('quanto tenho rendendo em cetes?'));

    expect(executeToolMock).toHaveBeenCalledWith('get_yield_balance', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      asset_code: 'CETES',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('40 CETES');
  });

  it('routes explicit yield confirmations with PIN to confirm_yield_action', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Pedido revisado confirmado para 100 reais.',
    }));

    const result = await graph.processInput(createState('confirmar rendimento de 100 reais PIN 1234'));

    expect(executeToolMock).toHaveBeenCalledWith('confirm_yield_action', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      action: 'deposit',
      amount: '100',
      asset_code: 'BRL',
      pin: '1234',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('confirmado');
  });

  it('does not execute yield confirmation without a PIN', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Revisão pronta: revisar entrada 100 reais.',
    }));

    await graph.processInput(createState('confirmar rendimento de 100 reais'));

    expect(executeToolMock).toHaveBeenCalledWith('prepare_yield_action', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      action: 'deposit',
      amount: '100',
      asset_code: 'BRL',
      language: 'pt-BR',
    });
    expect(executeToolMock).not.toHaveBeenCalledWith('confirm_yield_action', expect.anything());
  });

  it('routes broad keep-asset navigation to open_asset_interface', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Revisar aplicação está pronto para CETES.\n\nAbra:\nhttps://app.example.com/yield?asset=CETES',
    }));

    const result = await graph.processInput(createState('manter 50 cetes'));

    expect(executeToolMock).toHaveBeenCalledWith('open_asset_interface', {
      session_id: 'eval-session',
      action: 'keep',
      amount: '50',
      asset_code: 'CETES',
      destination_pix_key: '',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('/yield?asset=CETES');
  });

  it('routes send-out navigation with dynamic PIX key to open_asset_interface', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Mandar para PIX está pronto para BRL.\n\nAbra:\nhttps://app.example.com/pix-off?destination_pix_key=user%40example.com',
    }));

    const result = await graph.processInput(createState('mandar embora 100 reais para user@example.com'));

    expect(executeToolMock).toHaveBeenCalledWith('open_asset_interface', {
      session_id: 'eval-session',
      action: 'send_out',
      amount: '100',
      asset_code: 'BRL',
      destination_pix_key: 'user@example.com',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('destination_pix_key');
  });

  it('routes full money-cycle requests to open_money_cycle', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'O ciclo completo está pronto para BRL.\n\nAbra:\nhttps://app.example.com/money-cycle?asset=BRL&destination_pix_key=user%40example.com',
    }));

    const result = await graph.processInput(createState('quero injetar 500 reais, deixar render e depois sair para user@example.com'));

    expect(executeToolMock).toHaveBeenCalledWith('open_money_cycle', {
      session_id: 'eval-session',
      amount: '500',
      asset_code: 'BRL',
      destination_pix_key: 'user@example.com',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('/money-cycle?asset=BRL');
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
