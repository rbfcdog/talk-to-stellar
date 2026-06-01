jest.mock('../src/api/agent/tools', () => ({
  ALL_TOOLS: [],
  executeTool: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import { AgentGraph as AgentGraphClass } from '../src/api/agent/graph';
import { executeTool } from '../src/api/agent/tools';
import { ActionType, AgentState, IntentType } from '../src/api/agent/types';

const executeToolMock = executeTool as jest.Mock;
const AgentGraph: any = AgentGraphClass;

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

function mockRouteIntent(graph: any, toolName: string) {
  const routerInvoke = jest.fn().mockResolvedValue({
    tool_calls: [{
      id: `call_${toolName}`,
      name: toolName,
      args: { confidence: 0.99, reason: 'test route' },
    }],
  });
  graph.llm = {
    bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
    invoke: jest.fn(),
  };
  return routerInvoke;
}

describe('Agent production evals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.DISABLE_SHORT_LINKS = '1';
  });

  it('routes broad capability questions to the deterministic help tool', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Guia rápido: contatos, saldo, PIX, converter e rendimentos.',
    }));

    const result = await graph.processInput(createState('olá, o que você pode fazer?'));

    expect(executeToolMock).toHaveBeenCalledWith('get_intent_help', {});
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('contatos');
    expect(result.response_message).toContain('rendimentos');
    expect(result.response_message).not.toContain('ciclo completo');
  });

  it('routes typo capability questions from WhatsApp-style text to the help tool', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Posso ajudar com contatos, saldo, PIX, conversão, rendimentos, pagamentos e histórico.',
    }));

    const result = await graph.processInput(createState('o que possso fazer por aqui?'));

    expect(executeToolMock).toHaveBeenCalledWith('get_intent_help', {});
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('contatos');
    expect(result.response_message).toContain('rendimentos');
    expect(result.response_message).not.toContain('Não consegui entender');
  });

  it('answers asset explanation questions with the explanations tool instead of generic help', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      topic: 'assets',
      message: [
        'Assets são as moedas que podem aparecer na sua conta TalkToStellar:',
        '1. R$ / BRL: reais.',
        '2. USDC / US$: dólar digital.',
        '3. CETES: opção México em teste.',
        '4. XLM: saldo técnico visível da conta.',
      ].join('\n'),
    }));

    const result = await graph.processInput(createState('uais são os assets explique sobre cada um deles'));

    expect(executeToolMock).toHaveBeenCalledWith('get_explanations', {
      topic: 'assets',
      language: 'pt-BR',
    });
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Assets são as moedas');
    expect(result.response_message).toContain('USDC');
    expect(result.response_message).toContain('CETES');
    expect(result.response_message).toContain('XLM');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('uses LLM route tools to route typo balance requests instead of generic help', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'real-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: 'intent-call-1',
        name: 'route_balance_intent',
        args: { confidence: 0.98, reason: 'saldo typo' },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      balances: [
        { asset: 'BRL', balance: '12.3400000' },
        { asset: 'USDC', balance: '8.9000000' },
        { asset: 'XLM', balance: '3.0000000' },
      ],
    }));

    const result = await graph.processInput(createState('quero ver meu sald9'));

    expect(graph.llm.bindTools).toHaveBeenCalled();
    expect(routerInvoke).toHaveBeenCalled();
    const routedTools = graph.llm.bindTools.mock.calls[0][0];
    expect(routedTools.some((tool: any) => tool.function?.name === 'route_balance_intent')).toBe(true);
    const balanceRouteTool = routedTools.find((tool: any) => tool.function?.name === 'route_balance_intent');
    expect(balanceRouteTool.function.parameters.properties.needs_clarification).toBeDefined();
    expect(balanceRouteTool.function.parameters.properties.risk.enum).toEqual(['low', 'medium', 'high']);
    expect(balanceRouteTool.function.parameters.properties.language.enum).toEqual(['pt-BR', 'en']);
    expect(executeToolMock).toHaveBeenCalledWith('get_balance', {
      session_id: 'eval-session',
      public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Saldo da sua conta TalkToStellar');
    expect(result.response_message).toContain('R$: 12.3400000');
    expect(result.response_message).toContain('XLM: 3.0000000');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('answers common product questions directly instead of falling back to the menu', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_balance_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      balances: [
        { asset: 'BRL', balance: '25.0000000' },
        { asset: 'USDC', balance: '12.5000000' },
      ],
    }));

    const result = await graph.processInput(createState('quanto eu tenho na conta?'));

    expect(executeToolMock).toHaveBeenCalledWith('get_balance', {
      session_id: 'eval-session',
      public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Saldo da sua conta');
    expect(result.response_message).not.toContain('Diga o que quer fazer');
  });

  it('lists saved contacts for direct contacts requests without the generic help fallback', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_contacts_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      contacts: [
        {
          contact_name: 'Ana Silva',
          pix_key: 'ana@pix',
          history: {
            tx_count: 2,
            last_amount_label: 'R$ 100',
          },
        },
      ],
    }));

    const result = await graph.processInput(createState('quero ver meus contatos'));

    expect(executeToolMock.mock.calls.filter(([name]) => name === 'list_contacts')).toHaveLength(1);
    expect(executeToolMock.mock.calls.some(([name, args]) => (
      name === 'list_contacts' &&
      args?.session_id === 'eval-session' &&
      args?.user_id === 'eval-user'
    ))).toBe(true);
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Seus destinatários');
    expect(result.response_message).toContain('Ana Silva');
    expect(result.response_message).toContain('histórico: 2 envio(s)');
  });

  it('lists contacts even when the WhatsApp text has contact typos', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_contacts_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      contacts: [
        {
          contact_name: 'Bruna',
          pix_key: 'bruna@pix',
        },
      ],
    }));

    const result = await graph.processInput(createState('quero ver meus conattos'));

    expect(executeToolMock.mock.calls.filter(([name]) => name === 'list_contacts')).toHaveLength(1);
    expect(routerInvoke).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Bruna');
    expect(result.response_message).not.toContain('Posso ajudar com:');
  });

  it('adds a new contact when the user asks to add an email to contacts', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_contacts_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      contact: {
        contact_name: '',
        pix_key: 'rodrigobfdog@gmail.com',
      },
      contact_profile: {
        email: 'rodrigobfdog@gmail.com',
      },
    }));

    const result = await graph.processInput(createState('quero adicionar rodrigobfdog@gmail.com nos contatos'));

    expect(executeToolMock).toHaveBeenCalledWith('add_contact', {
      session_id: 'eval-session',
      user_id: 'eval-user',
      contact_name: '',
      contact_key: 'rodrigobfdog@gmail.com',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Contato adicionado com sucesso');
    expect(result.response_message).toContain('rodrigobfdog@gmail.com');
  });

  it('routes simple greetings to the full compact capability guide', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Posso ajudar com:\n1. Saldo e conta\n2. PIX\n3. Link de pagamento\n4. Aplicações\n5. Histórico',
    }));

    const result = await graph.processInput(createState('olaaa'));

    expect(executeToolMock).toHaveBeenCalledWith('get_intent_help', {});
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Link de pagamento');
    expect(result.response_message).toContain('Aplicações');
    expect(result.response_message).toContain('Histórico');
  });

  it('routes typo transaction history requests without falling back to the LLM', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      transactions: [
        {
          direction: 'received',
          amount: '10.00',
          asset: 'USDC',
          counterparty: 'Ana Silva',
          date: '2026-05-28T12:00:00.000Z',
        },
      ],
    }));

    const result = await graph.processInput(createState('quero ver meu historicp'));

    expect(executeToolMock).toHaveBeenCalledWith('get_transaction_history', {
      public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      user_id: 'eval-user',
      limit: 5,
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Ver histórico completo');
    expect(result.response_message).toContain('Últimas 5 transações');
    expect(result.response_message).toContain('Ana Silva');
    expect(result.response_message.indexOf('Ver histórico completo')).toBeLessThan(result.response_message.indexOf('Últimas 5 transações'));
  });

  it('opens the user profile page for direct profile requests', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      profile: {
        public_link: 'https://talk-to-stellar.test/u/eval',
      },
    }));

    const result = await graph.processInput(createState('quero ver meu perfil'));

    expect(executeToolMock).toHaveBeenCalledWith('get_or_create_global_profile', {
      session_id: 'eval-session',
      user_id: 'eval-user',
      display_name: 'eval@example.com',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Aqui está seu perfil');
    expect(result.response_message).toContain('https://talk-to-stellar.test/u/eval');
    expect(result.response_message).not.toContain('Não consegui entender');
  });

  it('answers ambiguous best-route requests with guidance instead of generic fallback', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    const result = await graph.processInput(createState('qual a melhor rota agota?'));

    expect(executeToolMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Toda conversão ou envio usa a melhor rota disponível');
    expect(result.response_message).toContain('valor, moeda de origem e destino');
    expect(result.response_message).toContain('converter 100 USDC para BRL');
    expect(result.response_message).not.toContain('Desculpe');
    expect(result.response_message).not.toContain('Eu analiso a melhor rota');
  });

  it('does not claim standalone best-route knowledge when route request has assets but no amount', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    const result = await graph.processInput(createState('qual a melhor rota de usdc pra brl agor?'));

    expect(executeToolMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Toda conversão ou envio usa a melhor rota disponível');
    expect(result.response_message).toContain('antes de qualquer PIN');
    expect(result.response_message).not.toContain('Eu analiso a melhor rota');
  });

  it('quotes a concrete best-route conversion instead of repeating guidance', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValueOnce(JSON.stringify({
      success: true,
      source: { amount: '100', asset_code: 'USDC' },
      destination: { amount: '438.7000000', asset_code: 'TESOURO' },
      route: { chain: 'USDC -> TESOURO', hops_count: 0 },
      effective_rate: { destination_per_source: '4.38700000' },
      fee_breakdown: { total_fee_display: 'R$ 0,01' },
      quote_ttl_seconds: 45,
      quote: {
        sourceAmount: '100',
        destinationAmount: '438.7000000',
        sourceAsset: { code: 'USDC' },
        destinationAsset: { code: 'TESOURO' },
        path: [],
      },
      optimization_criteria: 'maximizar recebimento no destino para o valor de envio informado',
      message: 'Rota mais otimizada agora.',
    }));

    const result = await graph.processInput(createState('- melhor rota para converter 100 USDC para BRL'));

    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith('get_best_route', expect.objectContaining({
      source_amount: '100',
      source_asset_code: 'USDC',
      dest_asset_code: 'TESOURO',
    }));
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Melhor rota agora para converter US$ 100.00');
    expect(result.response_message).toContain('Recebe aproximadamente R$ 438.70');
    expect(result.response_message).toContain('Rota mais otimizada agora: US$ -> R$');
    expect(result.response_message).not.toContain('Eu analiso a melhor rota quando você informa');
  });

  it('routes menu item 8 to best-route guidance before savings summaries', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    const result = await graph.processInput(createState('8. Melhor rota, cotação, taxas e economia'));

    expect(executeToolMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Toda conversão ou envio usa a melhor rota disponível');
    expect(result.response_message).toContain('valor final, taxas e a rota escolhida');
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
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Earnings options: dollars, CETES, reais.',
    }));

    const result = await graph.processInput(createState('show yield options', false));

    expect(executeToolMock).toHaveBeenCalledWith('get_yield_options', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Earnings options');
  });

  it('routes a plain investment request to application options', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Opções de rendimentos: dólares e XLM.\n\nAbrir rendimentos:\nhttps://app.example.com/rendimentos',
    }));

    const result = await graph.processInput(createState('quero investir'));

    expect(executeToolMock).toHaveBeenCalledWith('get_yield_options', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('/rendimentos');
    expect(result.response_message).not.toContain('/money-cycle');
  });

  it('routes misspelled applications wording to application options without generic help', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_yield_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Abrir rendimentos:\nhttps://app.example.com/rendimentos',
    }));

    const result = await graph.processInput(createState('quero ver aolicacoes'));

    expect(executeToolMock).toHaveBeenCalledWith('get_yield_options', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      language: 'pt-BR',
    });
    expect(routerInvoke).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('/rendimentos');
    expect(result.response_message).not.toContain('Diga o que quer fazer');
  });

  it('routes applications wording and typo variants to application options', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Abrir rendimentos:\nhttps://app.example.com/rendimentos',
    }));

    const first = await graph.processInput(createState('quero ver minhas aplicação'));
    const second = await graph.processInput(createState('aplicações'));

    expect(executeToolMock.mock.calls.filter(([name]) => name === 'get_yield_options')).toHaveLength(2);
    expect(first.success).toBe(true);
    expect(first.response_message).toContain('/rendimentos');
    expect(second.success).toBe(true);
    expect(second.response_message).toContain('/rendimentos');
  });

  it('routes PIN reset requests to the reset_pin tool instead of generic help', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      additional_kwargs: {
        tool_calls: [
          {
            id: 'call_reset_pin',
            function: {
              name: 'route_reset_pin_intent',
              arguments: '{"confidence":0.99,"reason":"change pin"}',
            },
          },
        ],
      },
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Enviei um e-mail para r******@gmail.com com o link seguro para mudar seu PIN. Ele vale por 15 minutos.',
    }));

    const result = await graph.processInput(createState(' redefinir o pin'));

    expect(result.success).toBe(true);
    expect(result.detected_intent).toBe(IntentType.RESET_PIN);
    expect(result.action_type).toBe(ActionType.RESET_PIN);
    expect(executeToolMock).toHaveBeenCalledWith('reset_pin', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      user_id: 'eval-user',
      language: 'pt-BR',
    });
    expect(result.response_message).toContain('e-mail');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
    expect(result.response_message).not.toContain('Diga o que quer fazer');
  });

  it('keeps exact short PIN reset wording in the intent router prompt', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'production prompt') as any;
    const prompt = graph.buildIntentRouterPrompt();

    expect(prompt).toContain('redefinir o pin -> route_reset_pin_intent');
    expect(prompt).toContain('Do not choose route_general_intent for a PIN reset/change request');
    expect(prompt).toContain('Do not choose route_general_intent just because amount, asset, destination, contact, public key, or PIN is missing');
    expect(prompt).toContain('You are not obligated to call a tool');
    expect(prompt).toContain('Priority order when multiple intents appear');
  });

  it('does not force or retry a route tool when the LLM router selects no tool', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({ content: 'Posso responder sem ferramenta quando não houver rota concreta.' });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    const intent = await graph.detectIntent('olá, explica o que você faz');

    expect(intent).toBe(IntentType.GENERAL);
    expect(routerInvoke).toHaveBeenCalledTimes(1);
    expect(graph.llm.bindTools).toHaveBeenCalledTimes(1);
    expect(graph.llm.bindTools.mock.calls[0][1]).toBeUndefined();
  });

  it('selects the highest-confidence LLM route when the model returns more than one route tool', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [
        {
          id: 'call_general',
          name: 'route_general_intent',
          args: { confidence: 0.2, reason: 'too broad', needs_clarification: true },
        },
        {
          id: 'call_balance',
          name: 'route_balance_intent',
          args: { confidence: 0.94, reason: 'balance typo', needs_clarification: false, language: 'pt-BR', risk: 'low' },
        },
      ],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      balances: [
        { asset: 'BRL', balance: '50.0000000' },
        { asset: 'XLM', balance: '2.0000000' },
      ],
    }));

    const result = await graph.processInput(createState('quero ver meu sald9'));

    expect(result.detected_intent).toBe(IntentType.BALANCE);
    expect(executeToolMock).toHaveBeenCalledWith('get_balance', expect.objectContaining({
      session_id: 'eval-session',
    }));
    expect(result.response_message).toContain('XLM: 2.0000000');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('redacts sensitive values from LLM router logs', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'production prompt') as any;

    const sanitized = graph.sanitizeIntentRouterLogMessage('PIN 1234 para rodrigo@example.com +55 19 99999-9999');

    expect(sanitized).toContain('PIN [redacted]');
    expect(sanitized).toContain('[redacted_email]');
    expect(sanitized).toContain('[redacted_number]');
    expect(sanitized).not.toContain('1234');
    expect(sanitized).not.toContain('rodrigo@example.com');
    expect(sanitized).not.toContain('99999-9999');
  });

  it('routes PIX send wording through the product intent router instead of generic help', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';

    const routerInvoke = mockRouteIntent(graph, 'route_pix_intent');
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    try {
      const result = await graph.processInput(createState('quero mandar 100 reais no pix'));

      expect(routerInvoke).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('/pix-on?');
      expect(result.response_message).toContain('amount=100');
      expect(result.response_message).toContain('currency=BRL');
      expect(result.response_message).toContain('receive_amount=100');
      expect(result.response_message).toContain('receive_asset=BRL');
      expect(result.response_message).not.toContain('Diga o que quer fazer');
      expect(result.response_message).not.toContain('Posso ajudar com:');
      expect(executeToolMock.mock.calls.some(([name]) => name === 'list_contacts')).toBe(false);
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('extracts OpenAI function tool calls from additional kwargs', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'production prompt') as any;

    const calls = graph.extractToolCalls({
      additional_kwargs: {
        tool_calls: [
          {
            id: 'call_1',
            function: {
              name: 'route_yield_intent',
              arguments: '{"confidence":0.99,"reason":"applications"}',
            },
          },
        ],
      },
    });

    expect(calls).toEqual([
      {
        id: 'call_1',
        name: 'route_yield_intent',
        args: { confidence: 0.99, reason: 'applications' },
      },
    ]);
  });

  it('routes explicit conversion when the LLM route tool returns conversion', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      additional_kwargs: {
        tool_calls: [
          {
            id: 'call_conversion',
            function: {
              name: 'route_conversion_intent',
              arguments: '{"confidence":0.96,"reason":"explicit conversion"}',
            },
          },
        ],
      },
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };
    graph.extractConversionIntentWithLlm = jest.fn().mockResolvedValue({});
    graph.resolveWalletAssetIssuer = jest
      .fn()
      .mockResolvedValueOnce('GUSDC')
      .mockResolvedValueOnce('GTESOURO');

    executeToolMock
      .mockResolvedValueOnce(JSON.stringify({
        success: true,
        quote: {
          sourceAmount: '10',
          destinationAmount: '43.8720000',
          sourceAsset: { code: 'USDC', issuer: 'GUSDC' },
          destinationAsset: { code: 'TESOURO', issuer: 'GTESOURO' },
          path: [],
        },
        optimization_criteria: 'maximizar recebimento no destino para o valor de envio informado',
        message: 'Rota mais otimizada agora.',
      }))
      .mockResolvedValueOnce(JSON.stringify({
        success: true,
        url: 'https://app.example.com/confirm-conversion?token=abc',
      }));

    const result = await graph.processInput(createState('quero converter 10 usdc pra brl'));

    expect(result.success).toBe(true);
    expect(result.detected_intent).toBe(IntentType.CONVERSION);
    expect(result.action_type).toBe(ActionType.CONVERT_ASSETS);
    expect(executeToolMock).toHaveBeenNthCalledWith(1, 'get_best_route', expect.objectContaining({
      source_amount: '10',
      source_asset_code: 'USDC',
      dest_asset_code: 'TESOURO',
    }));
    expect(executeToolMock).toHaveBeenNthCalledWith(2, 'prepare_conversion_confirmation', expect.objectContaining({
      source_amount: '10',
      source_asset_code: 'USDC',
      dest_asset_code: 'TESOURO',
    }));
    expect(result.response_message).toContain('/confirm-conversion?');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
    expect(result.response_message).not.toContain('Diga o que quer fazer');
  });

  it('routes yield deposits to prepare_yield_action with BRL normalized from reais', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Pronto para confirmar: aplicar 250 reais.',
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
    expect(result.response_message).toContain('Pronto para confirmar');
  });

  it('routes yield balance checks to get_yield_balance for CETES', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent');

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
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent');

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
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Pronto para confirmar: aplicar 100 reais.',
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
      message: 'Abrir rendimentos para CETES.\n\nAbrir:\nhttps://app.example.com/rendimentos?asset=CETES',
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
    expect(result.response_message).toContain('/rendimentos?asset=CETES');
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
