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

function mockRouteIntent(graph: any, toolName: string, args: Record<string, any> = {}) {
  const routerInvoke = jest.fn().mockResolvedValue({
    tool_calls: [{
      id: `call_${toolName}`,
      name: toolName,
      args: {
        confidence: 0.99,
        reason: 'test route',
        needs_clarification: false,
        language: 'pt-BR',
        risk: toolName === 'route_general_intent' ? 'low' : 'high',
        ...args,
      },
    }],
  });
  graph.llm = {
    bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
    invoke: jest.fn(),
  };
  return routerInvoke;
}

const routeToolByIntent: Record<IntentType, string> = {
  [IntentType.LOGIN]: 'route_login_intent',
  [IntentType.ONBOARD]: 'route_onboard_intent',
  [IntentType.WALLET]: 'route_wallet_intent',
  [IntentType.WALLET_LOGOUT]: 'route_wallet_logout_intent',
  [IntentType.RESET_PIN]: 'route_reset_pin_intent',
  [IntentType.PASSKEY_SETUP]: 'route_passkey_setup_intent',
  [IntentType.CONTACTS]: 'route_contacts_intent',
  [IntentType.PAYMENT]: 'route_payment_intent',
  [IntentType.PAYMENT_LINK]: 'route_payment_link_intent',
  [IntentType.BALANCE]: 'route_balance_intent',
  [IntentType.HISTORY]: 'route_history_intent',
  [IntentType.FINANCIAL_MEMORY]: 'route_financial_memory_intent',
  [IntentType.CONVERSION]: 'route_conversion_intent',
  [IntentType.PRICE_QUOTE]: 'route_price_quote_intent',
  [IntentType.PIX]: 'route_pix_intent',
  [IntentType.YIELD]: 'route_yield_intent',
  [IntentType.GENERAL]: 'route_general_intent',
};

type RouterEvalCase = {
  name: string;
  input: string;
  expectedIntent: IntentType;
  expectedTool?: string;
  risk?: 'low' | 'medium' | 'high';
  language?: 'pt-BR' | 'en';
  needsClarification?: boolean;
  expectedAmount?: string;
  expectedAssetCode?: string;
  expectedQuoteAssetCode?: string;
  expectedSourceAssetCode?: string;
  expectedDestAssetCode?: string;
  expectedQuoteMode?: 'market_price' | 'send_exact';
  expectedAllQuotes?: boolean;
  deterministic?: boolean;
};

function flattenMessageContent(value: any): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((item) => flattenMessageContent(item?.text ?? item?.content ?? item)).join('\n');
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value || '');
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
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_general_intent', {
      explanation_topic: 'assets',
      risk: 'low',
    });

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
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: 'intent-call-1',
        name: 'route_balance_intent',
        args: {
          confidence: 0.98,
          reason: 'saldo typo',
          needs_clarification: false,
          language: 'pt-BR',
          risk: 'low',
        },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    const result = await graph.processInput(createState('quero ver meu sald9'));

    expect(graph.llm.bindTools).toHaveBeenCalled();
    expect(routerInvoke).toHaveBeenCalled();
    const routedTools = graph.llm.bindTools.mock.calls[0][0];
    expect(routedTools.some((tool: any) => tool.function?.name === 'route_balance_intent')).toBe(true);
    const balanceRouteTool = routedTools.find((tool: any) => tool.function?.name === 'route_balance_intent');
    expect(balanceRouteTool.function.parameters.properties.needs_clarification).toBeDefined();
    expect(balanceRouteTool.function.parameters.properties.risk.enum).toEqual(['low', 'medium', 'high']);
    expect(balanceRouteTool.function.parameters.properties.language.enum).toEqual(['pt-BR', 'en']);
    expect(executeToolMock).not.toHaveBeenCalledWith('get_balance', expect.anything());
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('/balance?');
    expect(result.response_message).toContain('PIN');
    expect(result.response_message).not.toContain('R$: 12.3400000');
    expect(result.response_message).not.toContain('XLM: 3.0000000');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('answers common product questions directly instead of falling back to the menu', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_balance_intent');
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    const result = await graph.processInput(createState('quanto eu tenho na conta?'));

    expect(executeToolMock).not.toHaveBeenCalledWith('get_balance', expect.anything());
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('/balance?');
    expect(result.response_message).toContain('PIN');
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
    mockRouteIntent(graph, 'route_contacts_intent', {
      contact_action: 'add',
      contact_key: 'rodrigobfdog@gmail.com',
      contact_name: '',
      risk: 'medium',
    });

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

  it('routes typo transaction history requests through the LLM route contract', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_history_intent');
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    const result = await graph.processInput(createState('quero ver meu historicp'));

    expect(executeToolMock).not.toHaveBeenCalledWith('get_transaction_history', expect.anything());
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('/transactions?');
    expect(result.response_message).toContain('PIN');
    expect(result.response_message).not.toContain('Ana Silva');
  });

  it('opens the user profile page for direct profile requests', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_wallet_intent', {
      wallet_action: 'profile',
      risk: 'low',
    });

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

  it('returns the Stellar public key for direct public-key requests', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_wallet_intent');

    const result = await graph.processInput(createState('ual a minha chave publica?'));

    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Sua chave pública Stellar é');
    expect(result.response_message).toContain('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(result.response_message).not.toContain('eval@example.com');
    expect(executeToolMock).not.toHaveBeenCalledWith('get_or_create_global_profile', expect.anything());
  });

  it('answers ambiguous best-route requests with guidance instead of generic fallback', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_price_quote_intent');

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
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_price_quote_intent');

    const result = await graph.processInput(createState('qual a melhor rota de usdc pra brl agor?'));

    expect(executeToolMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Toda conversão ou envio usa a melhor rota disponível');
    expect(result.response_message).toContain('antes de qualquer PIN');
    expect(result.response_message).not.toContain('Eu analiso a melhor rota');
  });

  it('calls the pair quote tool when the LLM route extracts source and destination assets', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: 'call_route_price_quote_intent',
        name: 'route_price_quote_intent',
        args: {
          confidence: 0.99,
          reason: 'pair quote',
          needs_clarification: false,
          language: 'pt-BR',
          risk: 'medium',
          source_asset_code: 'USDC',
          dest_asset_code: 'BRL',
          quote_mode: 'send_exact',
        },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };
    executeToolMock.mockResolvedValueOnce(JSON.stringify({
      success: true,
      message: [
        'Cotação de envio pela melhor rota: US$ 1.00 -> aproximadamente R$ 5.13.',
        'Câmbio: 1 USDC ≈ R$ 5.13.',
        'Isso é só cotação. Nada é executado sem abrir a confirmação e digitar o PIN.',
      ].join('\n'),
    }));

    const result = await graph.processInput(createState('qual a melhor rota de usdc pra brl agor?'));

    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith('get_pair_quote', {
      source_asset_code: 'USDC',
      dest_asset_code: 'BRL',
      source_amount: '1',
      amount_was_provided: false,
      quote_mode: 'send_exact',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Cotação de envio pela melhor rota');
    expect(result.response_message).not.toContain('Toda conversão ou envio usa a melhor rota disponível');
  });

  it('quotes single-asset CETES against BRL instead of falling back to USDC/BRL', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: 'call_route_price_quote_intent',
        name: 'route_price_quote_intent',
        args: {
          confidence: 0.99,
          reason: 'single asset quote for CETES',
          needs_clarification: false,
          language: 'pt-BR',
          risk: 'medium',
          asset_code: 'CETES',
        },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };
    executeToolMock.mockResolvedValueOnce(JSON.stringify({
      success: true,
      message: [
        'Preço atual pela melhor rota: para receber 1.0000000 CETES, precisa de aproximadamente R$ 5.01.',
        'Câmbio: 1 CETES custa cerca de R$ 5.01.',
        'Modo: cotação por alvo exato. É o mesmo sentido usado quando o PIX precisa entregar um valor final em outro ativo.',
      ].join('\n'),
    }));

    const result = await graph.processInput(createState('uero ver a cotacao do cetes'));

    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith('get_pair_quote', {
      source_asset_code: 'CETES',
      dest_asset_code: 'BRL',
      source_amount: '1',
      amount_was_provided: false,
      quote_mode: 'market_price',
      language: 'pt-BR',
    });
    expect(executeToolMock).not.toHaveBeenCalledWith('get_brl_usdc_quote', {});
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Preço atual pela melhor rota');
    expect(result.response_message).toContain('1 CETES');
    expect(result.response_message).not.toContain('1 US$ = R$');
    expect(result.response_message).not.toContain('Fonte: saldo em reais da sua conta');
  });

  it('calls the all-pair quote tool when the LLM route asks for every quote', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: 'call_route_price_quote_intent',
        name: 'route_price_quote_intent',
        args: {
          confidence: 0.99,
          reason: 'all configured quotes',
          needs_clarification: false,
          language: 'pt-BR',
          risk: 'medium',
          all_quotes: true,
        },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };
    executeToolMock.mockResolvedValueOnce(JSON.stringify({
      success: true,
      message: [
        'Cotações atuais (testnet):',
        'BRL/USDC: R$ 1.00 -> US$ 0.19 | US$ 1.00 -> R$ 5.13',
        'BRL/XLM: R$ 1.00 -> 0.34 XLM | 1 XLM -> R$ 2.87',
        'Conferi arbitragem direta e multi-hop; nenhum ajuste foi necessário.',
        'Nada é executado sem abrir a confirmação e digitar o PIN.',
      ].join('\n'),
    }));

    const result = await graph.processInput(createState('uero ver todas as cotacoes aqui'));

    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith('get_all_pair_quotes', {
      language: 'pt-BR',
    });
    expect(executeToolMock).not.toHaveBeenCalledWith('get_brl_usdc_quote', {});
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Cotações atuais');
    expect(result.response_message).toContain('Conferi arbitragem direta e multi-hop');
    expect(result.response_message).not.toContain('1 US$ = R$');
    expect(result.response_message).not.toContain('Fonte: saldo em reais da sua conta');
  });

  it('quotes a concrete best-route conversion instead of repeating guidance', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_price_quote_intent', {
      amount: '100',
      source_asset_code: 'USDC',
      dest_asset_code: 'BRL',
      quote_mode: 'send_exact',
      risk: 'medium',
    });

    executeToolMock.mockResolvedValueOnce(JSON.stringify({
      success: true,
      message: [
        'Cotação de envio pela melhor rota: US$ 100.00 -> aproximadamente R$ 438.70.',
        'Câmbio: 1 USDC ≈ R$ 4.39.',
        'Isso é só cotação. Nada é executado sem abrir a confirmação e digitar o PIN.',
      ].join('\n'),
    }));

    const result = await graph.processInput(createState('- melhor rota para converter 100 USDC para BRL'));

    expect(executeToolMock).toHaveBeenCalledTimes(1);
    expect(executeToolMock).toHaveBeenCalledWith('get_pair_quote', {
      source_asset_code: 'USDC',
      dest_asset_code: 'BRL',
      source_amount: '100',
      amount_was_provided: true,
      quote_mode: 'send_exact',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Cotação de envio pela melhor rota');
    expect(result.response_message).toContain('US$ 100.00');
    expect(result.response_message).toContain('R$ 438.70');
    expect(result.response_message).not.toContain('Rota mais otimizada');
    expect(result.response_message).not.toContain('Critério:');
    expect(result.response_message).not.toContain('Eu analiso a melhor rota quando você informa');
  });

  it('routes menu item 8 to best-route guidance before savings summaries', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_price_quote_intent');

    const result = await graph.processInput(createState('8. Melhor rota, cotação, taxas e economia'));

    expect(executeToolMock).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Toda conversão ou envio usa a melhor rota disponível');
    expect(result.response_message).toContain('valor final, taxas e a rota escolhida');
  });

  it('routes cost comparison to show_savings_calculator and preserves WhatsApp rich formatting', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_price_quote_intent');
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
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_price_quote_intent');

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
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_financial_memory_intent');

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
              arguments: '{"confidence":0.99,"reason":"change pin","needs_clarification":false,"language":"pt-BR","risk":"high"}',
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

  it('routes typo PIN reset wording instead of showing the generic menu', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_reset_pin_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Enviei um e-mail para r******@gmail.com com o link seguro para mudar seu PIN. Ele vale por 15 minutos.',
    }));

    const result = await graph.processInput(createState('uero redefinir o pin'));

    expect(routerInvoke).toHaveBeenCalled();
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
  });

  it('routes biometrics setup requests to the passkey setup tool without the LLM router', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_passkey_setup_intent');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      url: 'https://app.example.com/setup-passkey?mode=agent&require_pin=1',
      message: 'Abra esta página segura para ativar biometria:\n\nhttps://app.example.com/setup-passkey?mode=agent&require_pin=1\n\nA página pede seu PIN antes de abrir a confirmação biométrica do celular. O link vale 15 minutos.',
    }));

    const result = await graph.processInput(createState('quero definir a biometria na minha conta'));

    expect(routerInvoke).not.toHaveBeenCalled();
    expect(graph.llm.bindTools).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.detected_intent).toBe(IntentType.PASSKEY_SETUP);
    expect(result.action_type).toBe(ActionType.SETUP_PASSKEY);
    expect(executeToolMock).toHaveBeenCalledWith('prepare_passkey_setup', expect.objectContaining({
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      user_id: 'eval-user',
      language: 'pt-BR',
    }));
    expect(result.response_message).toContain('/setup-passkey');
    expect(result.response_message).toContain('PIN');
    expect(result.response_message).not.toContain('e-mail');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('recognizes biometrics setup even when the LLM router is disabled', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt') as any;
    graph.llm = {
      bindTools: jest.fn(),
      invoke: jest.fn(),
    };

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      url: 'https://app.example.com/setup-passkey?mode=agent&require_pin=1',
      message: 'Abra esta página segura para ativar biometria:\n\nhttps://app.example.com/setup-passkey?mode=agent&require_pin=1\n\nA página pede seu PIN antes de abrir a confirmação biométrica do celular. O link vale 15 minutos.',
    }));

    const result = await graph.processInput(createState('cadastrar digital na conta'));

    expect(graph.llm.bindTools).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.detected_intent).toBe(IntentType.PASSKEY_SETUP);
    expect(result.action_type).toBe(ActionType.SETUP_PASSKEY);
    expect(executeToolMock).toHaveBeenCalledWith('prepare_passkey_setup', expect.objectContaining({
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      user_id: 'eval-user',
      language: 'pt-BR',
    }));
    expect(result.response_message).toContain('/setup-passkey');
    expect(result.response_message).toContain('PIN');
  });

  it('keeps web chat logout local so it does not disconnect WhatsApp or Telegram', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_wallet_logout_intent');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';

    try {
      const result = await graph.processInput(createState('deslogar dessa conta'));

      expect(routerInvoke).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.WALLET_LOGOUT);
      expect(result.action_type).toBe(ActionType.LOGOUT_WALLET);
      expect(result.response_message).toContain('só deste navegador');
      expect(result.response_message).toContain('https://app.example.com/logout?source=web');
      expect(result.response_message).toContain('não desconecta WhatsApp ou Telegram');
      expect(result.response_message).not.toContain('token=');
      expect(executeToolMock).not.toHaveBeenCalledWith('logout_session', expect.anything());
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('documents broad LLM route boundaries without hardcoded payment examples', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'production prompt') as any;
    const prompt = graph.buildIntentRouterPrompt();

    expect(prompt).toContain('money-transfer requests that combine a transfer verb, amount, asset/currency, and recipient');
    expect(prompt).toContain('Normal payment routing');
    expect(prompt).toContain('PIN/security requests are account actions');
    expect(prompt).toContain('Tool selection patterns');
    expect(prompt).toContain('This routing step must call exactly one route_*_intent tool for every user message');
    expect(prompt).toContain('Always interpret the latest user message together with recent conversation context');
    expect(prompt).toContain('If the previous context contains a send/pay/transfer request with amount and asset');
    expect(prompt).toContain('Do not choose route_general_intent just because amount, asset, destination, contact, public key, or PIN is missing');
    expect(prompt).toContain('route_general_intent is not a fallback for failed understanding');
    expect(prompt).toContain('Priority order when multiple intents appear');
    expect(prompt).toContain('"pra fora do pix", "fora em pix", "sair para meu pix"');
    expect(prompt).toContain('colocar/adicionar/depositar/carregar/recarregar/trazer 100 reais via/no/por PIX');
    expect(prompt).toContain('Do not route it as payment and do not ask for contact key');
    expect(prompt).toContain('"me ajude com o colocar 100 reais via pix"');
    expect(prompt).toContain('Never choose route_contacts_intent for that shape');
    expect(prompt).toContain('If PIX pays another person/contact, preserve the requested final asset');
    expect(prompt).toContain('previous user "quero mandar 100 cetes d" and latest user "pra Ana Silva via pix"');
    expect(prompt).toContain('route_pix_intent with amount="100", asset_code="CETES", recipient_query="Ana Silva"');
    expect(prompt).toContain('"want to send 100 USDC PIX to Ana Silva so they receive in CETES"');
    expect(prompt).toContain('dest_asset_code="CETES"');
    expect(prompt).toContain('For single-asset quote requests in Portuguese/Brazil context, default the quote against BRL');
    expect(prompt).toContain('"uero ver a cotacao do cetes"');
    expect(prompt).toContain('source_asset_code=CETES, dest_asset_code=BRL, quote_mode=market_price');
    expect(prompt).toContain('Do not answer with USDC/BRL unless the user asks for dólar/USDC');
    expect(prompt).toContain('uero fazer pix pra ana silva de 100 xlm');
    expect(prompt).toContain('Do not reinterpret "100 xlm" as "R$100"');
    expect(prompt).toContain('A named human recipient after "pra", "para", "pro", or "a" makes route_pix_onramp_intent invalid');
    expect(prompt).toContain('"quero mandar 100 cetes d" followed by "pra ana silva via pix" is route_pix_intent');
    expect(prompt).toContain('"quero mandar 10 usdc pra fora da conta" -> route_pix_offramp_intent');
    expect(prompt).toContain('Never ask for recipient for "pra fora da conta"');
    expect(prompt).toContain('Without a conversion layer and with "da conta"/"minha conta", it is route_pix_offramp_intent');
    expect(prompt).toContain('"mudar/trocar/alterar/redefinir/redefimir/resetar/recuperar PIN"');
    expect(prompt).toContain('Missing recipient for payment does not make it general');
    expect(prompt).not.toContain('uero mandar 10 xlm pra ana silva');
    expect(prompt).not.toContain('quero mandar 10 xlm pra ana silva');
    expect(prompt).not.toContain('uero redefinir o pin ->');
  });

  it('exposes route tool descriptions with explicit edge-case boundaries', async () => {
    const graph = new AgentGraph(createRepository() as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: 'call_general',
        name: 'route_general_intent',
        args: {
          confidence: 0.95,
          reason: 'schema inspection',
          needs_clarification: false,
          language: 'pt-BR',
          risk: 'low',
        },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    await graph.detectIntent('olá');

    const tools = graph.llm.bindTools.mock.calls[0][0];
    const descriptionByName = Object.fromEntries(
      tools.map((tool: any) => [tool.function?.name, tool.function?.description || ''])
    );
    const requiredByName = Object.fromEntries(
      tools.map((tool: any) => [tool.function?.name, tool.function?.parameters?.required || []])
    );

    expect(Object.keys(descriptionByName)).toHaveLength(new Set(Object.keys(descriptionByName)).size);
    for (const required of Object.values(requiredByName) as string[][]) {
      expect(required).toEqual(['confidence', 'reason', 'needs_clarification', 'language', 'risk']);
    }
    expect(descriptionByName.route_pix_onramp_intent).toContain('own-account PIX entrada/on-ramp only');
    expect(descriptionByName.route_pix_onramp_intent).toContain('me ajude com o colocar 100 reais via pix');
    expect(descriptionByName.route_pix_onramp_intent).toContain('never requires a contact');
    expect(descriptionByName.route_pix_onramp_intent).toContain('Never use this if the message has PIX plus a named recipient/person');
    expect(descriptionByName.route_pix_onramp_intent).toContain('uero fazer pix pra ana silva de 100 xlm');
    expect(descriptionByName.route_pix_onramp_intent).toContain('fazer PIX pra Ana Silva de 100 XLM');
    expect(descriptionByName.route_pix_offramp_intent).toContain('PIX saída/off-ramp only');
    expect(descriptionByName.route_pix_offramp_intent).toContain('mandar pra fora 50 reais em pix');
    expect(descriptionByName.route_pix_offramp_intent).toContain('quero mandar 10 usdc pra fora da conta');
    expect(descriptionByName.route_pix_offramp_intent).toContain('recipient_query empty');
    expect(descriptionByName.route_pix_intent).toContain('prefer route_pix_onramp_intent');
    expect(descriptionByName.route_pix_intent).toContain('prefer route_pix_offramp_intent');
    expect(descriptionByName.route_pix_intent).toContain('PIX wins over contacts');
    expect(descriptionByName.route_pix_intent).toContain('amount/asset is the final amount the recipient should receive');
    expect(descriptionByName.route_pix_intent).toContain('The phrase "de 100 XLM" means 100 XLM to Ana');
    expect(descriptionByName.route_pix_intent).toContain('follow-up messages that complete a previous send/payment request');
    expect(descriptionByName.route_pix_intent).toContain('previous context has amount/asset such as "quero mandar 100 CETES"');
    expect(descriptionByName.route_contacts_intent).toContain('Contact routing requires explicit contact-management meaning');
    expect(descriptionByName.route_contacts_intent).toContain('Do not use for PIX top-up/on-ramp');
    expect(descriptionByName.route_contacts_intent).toContain('me ajude com o colocar 100 reais via pix');
    expect(descriptionByName.route_contacts_intent).toContain('contacts tool is invalid');
    expect(descriptionByName.route_payment_intent).toContain('must not become general help');
    expect(descriptionByName.route_payment_intent).toContain('when PIX is not the requested rail');
    expect(descriptionByName.route_payment_intent).toContain('Do not use for "pra fora da conta"');
    expect(descriptionByName.route_payment_intent).toContain('Do not use for PIX top-up');
    expect(descriptionByName.route_payment_link_intent).toContain('does not require an existing contact');
    expect(descriptionByName.route_price_quote_intent).toContain('needs_clarification=true');
    expect(descriptionByName.route_price_quote_intent).toContain('XLM/USDC');
    expect(descriptionByName.route_price_quote_intent).toContain('BRL para CETES');
    expect(descriptionByName.route_price_quote_intent).toContain('single-asset quote');
    expect(descriptionByName.route_price_quote_intent).toContain('uero ver a cotacao do cetes');
    expect(descriptionByName.route_price_quote_intent).toContain('all_quotes=true');
    expect(descriptionByName.route_price_quote_intent).toContain('uero ver todas as cotacoes aqui');
    expect(descriptionByName.route_reset_pin_intent).toContain('redefimir');
    expect(descriptionByName.route_general_intent).toContain('Never use for actionable product requests');
    const priceQuoteProperties = tools.find((tool: any) => tool.function?.name === 'route_price_quote_intent')?.function?.parameters?.properties || {};
    expect(priceQuoteProperties.source_asset_code.description).toContain('source/origin asset');
    expect(priceQuoteProperties.source_asset_code.description).toContain('cotação do CETES');
    expect(priceQuoteProperties.dest_asset_code.description).toContain('destination/target asset');
    expect(priceQuoteProperties.dest_asset_code.description).toContain('default to BRL');
    expect(priceQuoteProperties.quote_mode.description).toContain('market_price');
    expect(priceQuoteProperties.quote_mode.description).toContain('send_exact');
    expect(priceQuoteProperties.all_quotes.description).toContain('all quotes');
    expect(priceQuoteProperties.all_quotes.description).toContain('uero ver todas as cotacoes aqui');
  });

  it('routes multi-turn PIX-funded CETES contact payment using recent conversation context', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn(async (messages: any[]) => {
      const joinedMessages = messages.map((message) => flattenMessageContent(message.content)).join('\n\n');

      expect(joinedMessages).toContain('Recent conversation context:');
      expect(joinedMessages).toContain('User: quero mandar 100 cetes d');
      expect(joinedMessages).toContain('Assistant: Para quem você quer mandar 100 CETES?');
      expect(joinedMessages).toContain('Latest user message: pra Ana Silva via pix');
      expect(joinedMessages).toContain('previous user "quero mandar 100 cetes d" and latest user "pra Ana Silva via pix"');

      return {
        tool_calls: [{
          id: 'call_pix_context',
          name: 'route_pix_intent',
          args: {
            confidence: 0.99,
            reason: 'latest message completes previous CETES send with PIX rail',
            needs_clarification: false,
            language: 'pt-BR',
            risk: 'high',
            amount: '100',
            asset_code: 'CETES',
            recipient_query: 'Ana Silva',
          },
        }],
      };
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };
    const state = createState('pra Ana Silva via pix');
    state.messages = [
      { role: 'user', content: 'quero mandar 100 cetes d', created_at: new Date().toISOString() } as any,
      { role: 'assistant', content: 'Para quem você quer mandar 100 CETES?', created_at: new Date().toISOString() } as any,
    ];

    const detected = await graph.detectIntent(state.current_input, state.session_data?.user_id, state.messages);

    expect(detected).toBe(IntentType.PIX);
    expect(routerInvoke).toHaveBeenCalledTimes(1);
    expect((graph as any).lastIntentRouteCandidate).toMatchObject({
      intent: IntentType.PIX,
      toolName: 'route_pix_intent',
      amount: '100',
      assetCode: 'CETES',
      recipientQuery: 'Ana Silva',
    });
    expect(graph.llm.bindTools).toHaveBeenCalledWith(expect.any(Array), { tool_choice: 'required' });
  });

  describe('LLM intent router contract matrix', () => {
    const cases: RouterEvalCase[] = [
      { name: 'balance typo', input: 'quero ver meu sald9', expectedIntent: IntentType.BALANCE, risk: 'low' },
      { name: 'balance natural', input: 'quanto eu tenho na conta agora?', expectedIntent: IntentType.BALANCE, risk: 'low' },
      { name: 'balance xlm', input: 'mostra meu saldo em xlm', expectedIntent: IntentType.BALANCE, risk: 'low' },
      { name: 'balance typo zero', input: 'mostra meu sald0 total', expectedIntent: IntentType.BALANCE, risk: 'low' },
      { name: 'balance mixed with available', input: 'quanto tenho disponivel em usdc?', expectedIntent: IntentType.BALANCE, risk: 'low' },
      { name: 'contacts list', input: 'quero ver meus contatos', expectedIntent: IntentType.CONTACTS, risk: 'low' },
      { name: 'contacts typo', input: 'lista meus conattos salvos', expectedIntent: IntentType.CONTACTS, risk: 'low' },
      { name: 'contacts add', input: 'adicionar rodrigobfcdog@gmail.com nos contatos', expectedIntent: IntentType.CONTACTS, risk: 'medium' },
      { name: 'contacts beneficiaries', input: 'mostrar destinatarios salvos pra pagamento', expectedIntent: IntentType.CONTACTS, risk: 'low' },
      { name: 'payment typo contact', input: 'uero mandar 10 xlm pra ana silva', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment abbreviated contact', input: 'qro enviar 7 cetes para marina costa', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment email recipient', input: 'manda 3 usdc para rodrigo@example.com', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment cpf recipient', input: 'transferir 20 reais para 123.456.789-09', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment external wallet', input: 'enviar 5 xlm para carteira externa GDUMMYPUBLICKEY', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment missing amount still payment', input: 'quero mandar dinheiro para Ana Silva', expectedIntent: IntentType.PAYMENT, risk: 'high', needsClarification: true },
      { name: 'payment key without pix', input: 'transferir 12 usdc para chave maria@example.com sem pix', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment stellar rail explicit', input: 'mandar 10 xlm pra Ana Silva pela Stellar', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment not pix explicit typo', input: 'uero mandar 10 xlm pra ana sem pix', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment phone recipient no pix', input: 'transferir 8 cetes para +55 11 99999-0000', expectedIntent: IntentType.PAYMENT, risk: 'high' },
      { name: 'payment contact brl source usdc destination typo', input: 'quero mandar pra Marina Costa 100 brl da minha conta pra chegar na dela como usss', expectedIntent: IntentType.PAYMENT, expectedTool: 'route_payment_intent', risk: 'high', expectedAmount: '100', expectedAssetCode: 'BRL', expectedSourceAssetCode: 'BRL', expectedDestAssetCode: 'USDC' },
      { name: 'payment layered external conversion missing destination', input: 'uero mandar 10 usdc em xlm pra fora', expectedIntent: IntentType.PAYMENT, expectedTool: 'route_payment_intent', risk: 'high', needsClarification: true, expectedAmount: '10', expectedSourceAssetCode: 'USDC', expectedDestAssetCode: 'XLM' },
      { name: 'pix off ramp outside', input: 'quero mandar pra fora 50 reais em pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high' },
      { name: 'pix off ramp outside without pix word', input: 'quero mandar 50 reais pra fora da minha conta', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high' },
      { name: 'pix off ramp own account usdc no pix word', input: 'quero mandar 10 usdc pra fora da conta', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high', expectedAmount: '10', expectedAssetCode: 'USDC' },
      { name: 'pix off ramp bank wording', input: 'tirar 80 usdc pro meu banco', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high' },
      { name: 'pix off ramp own key', input: 'sacar 25 usdc para minha chave pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high' },
      { name: 'pix off ramp account exit wording', input: 'quero tirar dinheiro da conta e mandar pro meu pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high', needsClarification: true },
      { name: 'pix off ramp bank no pix word', input: 'retirar 100 reais para o meu banco', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high' },
      { name: 'pix off ramp typo withdraw', input: 'sacarr 30 usdc pro pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high' },
      { name: 'pix on ramp', input: 'colocar 100 reais via pix na minha conta', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high' },
      { name: 'pix on ramp help wording', input: 'me ajude com o colocar 100 reais via pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high' },
      { name: 'pix on ramp help add wording', input: 'me ajuda a adicionar 100 reais por pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high' },
      { name: 'pix on ramp balance wording', input: 'adicionar saldo com pix de 100 reais', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high' },
      { name: 'pix on ramp own account receive', input: 'quero receber 100 reais via pix na minha conta', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high' },
      { name: 'pix on ramp load wording', input: 'carregar minha conta com 100 reais no pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high' },
      { name: 'pix on ramp exact usdc receive', input: 'uero mandar um pix pra chegar 100 usdc na minha conta', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high', expectedAmount: '100', expectedAssetCode: 'USDC' },
      { name: 'pix on ramp exact usdc receive truncated typo', input: 'ro mandar um pix pra chegar 100 usdc na minha conta', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high', expectedAmount: '100', expectedAssetCode: 'USDC' },
      { name: 'pix on ramp exact xlm then convert to usdc', input: 'uero colocar 100 xlm pra eu receber em usdc', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high', expectedAmount: '100', expectedAssetCode: 'XLM', expectedDestAssetCode: 'USDC' },
      { name: 'pix on ramp typo own account', input: 'qro botar cem reais por pix na conta', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high' },
      { name: 'pix on ramp missing amount', input: 'quero colocar dinheiro via pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high', needsClarification: true },
      { name: 'pix funded payment', input: 'pagar Ana via PIX', expectedIntent: IntentType.PIX, risk: 'high' },
      { name: 'pix funded payment exact xlm typo', input: 'uero fazer pix pra ana silva de 100 xlm', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_intent', risk: 'high' },
      { name: 'pix funded payment exact xlm natural', input: 'quero fazer pix pra Ana Silva de 100 XLM', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_intent', risk: 'high' },
      { name: 'pix funded payment exact usdc', input: 'pagar ana silva via pix com 50 usdc', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_intent', risk: 'high' },
      { name: 'pix funded payment exact cetes', input: 'pix pra Marina de 75 cetes', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_intent', risk: 'high' },
      { name: 'pix funded payment missing asset', input: 'fazer pix de 100 para Ana Silva', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_intent', risk: 'high' },
      { name: 'pix typo off ramp', input: 'uero mandar 100 reais pra fora do pix', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high' },
      { name: 'pix cost edge is quote', input: 'quanto custa sacar 100 usdc para meu pix?', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium' },
      { name: 'conversion explicit', input: 'quero converter 10 usdc pra brl', expectedIntent: IntentType.CONVERSION, risk: 'high' },
      { name: 'conversion generic', input: 'quero converter dinheiro', expectedIntent: IntentType.CONVERSION, risk: 'medium' },
      { name: 'conversion swap wording', input: 'trocar 50 reais para dólar', expectedIntent: IntentType.CONVERSION, risk: 'high' },
      { name: 'conversion missing amount', input: 'trocar usdc para brl', expectedIntent: IntentType.CONVERSION, risk: 'medium', needsClarification: true },
      { name: 'price quote best route', input: 'qual a melhor rota de usdc pra brl agora?', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedSourceAssetCode: 'USDC', expectedDestAssetCode: 'BRL', expectedQuoteMode: 'send_exact' },
      { name: 'price quote fees', input: 'quanto custa enviar 5000 reais?', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium' },
      { name: 'price quote bank comparison', input: 'vale a pena comparado com o banco enviar 5000 reais?', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium' },
      { name: 'price quote missing amount', input: 'qual a taxa de usdc pra brl?', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedSourceAssetCode: 'USDC', expectedDestAssetCode: 'BRL', expectedQuoteMode: 'send_exact' },
      { name: 'price quote xlm to usdc', input: 'quanto dá 100 xlm em usdc?', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedAmount: '100', expectedSourceAssetCode: 'XLM', expectedDestAssetCode: 'USDC', expectedQuoteMode: 'send_exact' },
      { name: 'price quote route without amount', input: 'melhor rota de brl para xlm', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedSourceAssetCode: 'BRL', expectedDestAssetCode: 'XLM', expectedQuoteMode: 'send_exact' },
      { name: 'price quote cetes slash xlm', input: 'quanto está CETES/XLM agora?', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedSourceAssetCode: 'CETES', expectedDestAssetCode: 'XLM', expectedQuoteMode: 'market_price' },
      { name: 'price quote brl to cetes', input: 'cotação atual de 250 reais para cetes', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedAmount: '250', expectedSourceAssetCode: 'BRL', expectedDestAssetCode: 'CETES', expectedQuoteMode: 'send_exact' },
      { name: 'price quote xlm brl market price', input: 'cotação XLM/BRL agora', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedSourceAssetCode: 'XLM', expectedDestAssetCode: 'BRL', expectedQuoteMode: 'market_price' },
      { name: 'price quote xlm cost in brl', input: 'quanto custa 100 XLM em reais?', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedAmount: '100', expectedSourceAssetCode: 'XLM', expectedDestAssetCode: 'BRL', expectedQuoteMode: 'market_price' },
      { name: 'price quote cetes single asset typo', input: 'uero ver a cotacao do cetes', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedSourceAssetCode: 'CETES', expectedDestAssetCode: 'BRL', expectedQuoteMode: 'market_price' },
      { name: 'price quote cetes single asset natural', input: 'cotação do CETES agora', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedSourceAssetCode: 'CETES', expectedDestAssetCode: 'BRL', expectedQuoteMode: 'market_price' },
      { name: 'price quote all pairs typo', input: 'uero ver todas as cotacoes aqui', expectedIntent: IntentType.PRICE_QUOTE, risk: 'medium', expectedAllQuotes: true },
      { name: 'yield typo', input: 'quero ver aolicacoes', expectedIntent: IntentType.YIELD, risk: 'low' },
      { name: 'yield investments', input: 'quero ver meus investimentos', expectedIntent: IntentType.YIELD, risk: 'low' },
      { name: 'yield singular typo', input: 'quero ver minhas aplicação', expectedIntent: IntentType.YIELD, risk: 'low' },
      { name: 'yield deposit', input: 'guardar 250 reais rendendo', expectedIntent: IntentType.YIELD, risk: 'high' },
      { name: 'yield position', input: 'quanto tenho rendendo em cetes?', expectedIntent: IntentType.YIELD, risk: 'low' },
      { name: 'yield apply missing amount', input: 'quero investir', expectedIntent: IntentType.YIELD, risk: 'high', needsClarification: true },
      { name: 'history typo', input: 'quero ver meu historicp', expectedIntent: IntentType.HISTORY, risk: 'low' },
      { name: 'history receipts', input: 'listar meus comprovantes recentes', expectedIntent: IntentType.HISTORY, risk: 'low' },
      { name: 'history transactions', input: 'ver minhas movimentações', expectedIntent: IntentType.HISTORY, risk: 'low' },
      { name: 'history latest five', input: 'mostrar minhas 5 últimas transações', expectedIntent: IntentType.HISTORY, risk: 'low' },
      { name: 'financial memory nicknames', input: 'quais apelidos eu salvei para pagamentos?', expectedIntent: IntentType.FINANCIAL_MEMORY, risk: 'low' },
      { name: 'financial memory savings', input: 'quanto eu economizei esse ano?', expectedIntent: IntentType.FINANCIAL_MEMORY, risk: 'low' },
      { name: 'reset pin typo', input: 'uero redefinir o pin', expectedIntent: IntentType.RESET_PIN, risk: 'high' },
      { name: 'reset pin typo redefimir', input: 'quero redefimir o pin', expectedIntent: IntentType.RESET_PIN, risk: 'high' },
      { name: 'reset pin change', input: 'quero alterar meu pin', expectedIntent: IntentType.RESET_PIN, risk: 'high' },
      { name: 'reset pin forgot', input: 'esqueci meu PIN', expectedIntent: IntentType.RESET_PIN, risk: 'high' },
      { name: 'reset pin invalid', input: 'meu pin nao funciona', expectedIntent: IntentType.RESET_PIN, risk: 'high' },
      { name: 'reset pin security wording', input: 'preciso trocar a senha pin da conta', expectedIntent: IntentType.RESET_PIN, risk: 'high' },
      { name: 'reset pin typo missing first letter', input: 'ero mudar meu pin', expectedIntent: IntentType.RESET_PIN, risk: 'high' },
      { name: 'passkey setup biometrics', input: 'quero ativar biometria na minha conta', expectedIntent: IntentType.PASSKEY_SETUP, expectedTool: 'route_passkey_setup_intent', risk: 'high', deterministic: true },
      { name: 'payment link create', input: 'criar link de pagamento de 50 dólares', expectedIntent: IntentType.PAYMENT_LINK, risk: 'medium' },
      { name: 'payment link receive', input: 'quero meu link para receber dinheiro', expectedIntent: IntentType.PAYMENT_LINK, risk: 'medium' },
      { name: 'payment link charge customer', input: 'gerar link pra cobrar cliente 15 usdc', expectedIntent: IntentType.PAYMENT_LINK, risk: 'medium' },
      { name: 'profile', input: 'quero ver meu perfil', expectedIntent: IntentType.WALLET, risk: 'low' },
      { name: 'wallet public info', input: 'qual minha chave de recebimento?', expectedIntent: IntentType.WALLET, risk: 'low' },
      { name: 'wallet global profile', input: 'abrir meu perfil global', expectedIntent: IntentType.WALLET, risk: 'low' },
      { name: 'login', input: 'entrar na minha conta', expectedIntent: IntentType.LOGIN, risk: 'high' },
      { name: 'login google', input: 'entrar com google', expectedIntent: IntentType.LOGIN, risk: 'high' },
      { name: 'onboard', input: 'quero criar uma conta nova', expectedIntent: IntentType.ONBOARD, risk: 'medium' },
      { name: 'onboard google', input: 'criar conta com google', expectedIntent: IntentType.ONBOARD, risk: 'medium' },
      { name: 'logout', input: 'deslogar dessa conta', expectedIntent: IntentType.WALLET_LOGOUT, risk: 'high' },
      { name: 'logout whatsapp', input: 'sair da sessao do whatsapp', expectedIntent: IntentType.WALLET_LOGOUT, risk: 'high' },
      { name: 'general greeting', input: 'olaaa', expectedIntent: IntentType.GENERAL, risk: 'low' },
      { name: 'general capabilities', input: 'o que você consegue fazer?', expectedIntent: IntentType.GENERAL, risk: 'low' },
      { name: 'general asset explanation', input: 'quais são os assets? explique cada um', expectedIntent: IntentType.GENERAL, risk: 'low' },
      { name: 'general feature explanation', input: 'me explica como funciona o pix e os rendimentos', expectedIntent: IntentType.GENERAL, risk: 'low' },
      { name: 'general asset pair explanation', input: 'explique CETES, XLM e USDC', expectedIntent: IntentType.GENERAL, risk: 'low' },
      { name: 'general route explanation', input: 'como voces escolhem a melhor rota?', expectedIntent: IntentType.GENERAL, risk: 'low' },
      { name: 'english balance', input: 'show my balance', expectedIntent: IntentType.BALANCE, risk: 'low', language: 'en' },
      { name: 'english payment', input: 'send 12 usdc to Ana Silva', expectedIntent: IntentType.PAYMENT, risk: 'high', language: 'en' },
      { name: 'english payment not pix', input: 'send 10 xlm to Ana without PIX', expectedIntent: IntentType.PAYMENT, risk: 'high', language: 'en' },
      { name: 'english pix withdraw', input: 'withdraw 20 usdc to my PIX key', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_offramp_intent', risk: 'high', language: 'en' },
      { name: 'english pix top up', input: 'add 100 reais by PIX to my account', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_onramp_intent', risk: 'high', language: 'en' },
      { name: 'english pix contact final asset', input: 'make a PIX to Ana Silva for 100 XLM', expectedIntent: IntentType.PIX, expectedTool: 'route_pix_intent', risk: 'high', language: 'en' },
      { name: 'english payment link', input: 'create a payment link for 20 dollars', expectedIntent: IntentType.PAYMENT_LINK, risk: 'medium', language: 'en' },
      { name: 'english pin', input: 'forgot my PIN', expectedIntent: IntentType.RESET_PIN, risk: 'high', language: 'en' },
      { name: 'english help', input: 'what can you do?', expectedIntent: IntentType.GENERAL, risk: 'low', language: 'en' },
    ];

    it.each(cases)('$name -> $expectedIntent', async ({
      input,
      expectedIntent,
      expectedTool: caseExpectedTool,
      risk = 'medium',
      language = 'pt-BR',
      needsClarification = false,
      expectedAmount,
      expectedAssetCode,
      expectedQuoteAssetCode,
      expectedSourceAssetCode,
      expectedDestAssetCode,
      expectedQuoteMode,
      expectedAllQuotes,
      deterministic = false,
    }) => {
      const graph = new AgentGraph(createRepository() as any, 'live-openai-key', 'production prompt') as any;
      const expectedTool = caseExpectedTool || routeToolByIntent[expectedIntent];
      const routeArgs = {
        confidence: 0.99,
        reason: `eval expects ${expectedIntent}`,
        needs_clarification: needsClarification,
        language,
        risk,
        ...(expectedAmount ? { amount: expectedAmount } : {}),
        ...(expectedAssetCode ? { asset_code: expectedAssetCode } : {}),
        ...(expectedQuoteAssetCode ? { quote_asset_code: expectedQuoteAssetCode } : {}),
        ...(expectedSourceAssetCode ? { source_asset_code: expectedSourceAssetCode } : {}),
        ...(expectedDestAssetCode ? { dest_asset_code: expectedDestAssetCode } : {}),
        ...(expectedQuoteMode ? { quote_mode: expectedQuoteMode } : {}),
        ...(expectedAllQuotes ? { all_quotes: true } : {}),
      };
      const routerInvoke = jest.fn(async (messages: any[]) => {
        const joinedMessages = messages.map((message) => flattenMessageContent(message.content)).join('\n\n');

        expect(joinedMessages).toContain('You are the routing layer for TalkToStellar');
        expect(joinedMessages).toContain('This routing step must call exactly one route_*_intent tool for every user message');
        expect(joinedMessages).toContain(`User message: ${input}`);

        return {
          tool_calls: [{
            id: `call_${expectedTool}`,
            name: expectedTool,
            args: routeArgs,
          }],
        };
      });

      graph.llm = {
        bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
        invoke: jest.fn(),
      };

      const detected = await graph.detectIntent(input);

      expect(detected).toBe(expectedIntent);
      if (deterministic) {
        expect(routerInvoke).not.toHaveBeenCalled();
        expect(graph.llm.bindTools).not.toHaveBeenCalled();
        return;
      }
      expect(routeArgs.needs_clarification).toBe(needsClarification);
      expect(routeArgs.language).toBe(language);
      expect(routeArgs.risk).toBe(risk);
      if (expectedAmount) expect(routeArgs.amount).toBe(expectedAmount);
      if (expectedAssetCode) expect(routeArgs.asset_code).toBe(expectedAssetCode);
      if (expectedQuoteAssetCode) expect(routeArgs.quote_asset_code).toBe(expectedQuoteAssetCode);
      if (expectedSourceAssetCode) expect(routeArgs.source_asset_code).toBe(expectedSourceAssetCode);
      if (expectedDestAssetCode) expect(routeArgs.dest_asset_code).toBe(expectedDestAssetCode);
      if (expectedQuoteMode) expect(routeArgs.quote_mode).toBe(expectedQuoteMode);
      if (expectedAllQuotes) expect(routeArgs.all_quotes).toBe(true);
      const expectedRouterCalls = expectedIntent === IntentType.CONTACTS || expectedTool === 'route_pix_onramp_intent' ? 2 : 1;
      expect(routerInvoke).toHaveBeenCalledTimes(expectedRouterCalls);
      expect(graph.llm.bindTools).toHaveBeenCalledTimes(expectedRouterCalls);
      expect(graph.llm.bindTools).toHaveBeenCalledWith(expect.any(Array), { tool_choice: 'required' });

      if (expectedIntent === IntentType.CONTACTS || expectedTool === 'route_pix_onramp_intent') {
        const auditMessages = routerInvoke.mock.calls[1][0]
          .map((message: any) => flattenMessageContent(message.content))
          .join('\n');
        expect(auditMessages).toContain('ROUTE AUDIT');
        expect(auditMessages).toContain(`Previous route tool selected: ${expectedTool}`);
      }

      const tools = graph.llm.bindTools.mock.calls[0][0];
      const toolNames = tools.map((tool: any) => tool.function?.name).filter(Boolean);
      expect(toolNames).toContain(expectedTool);
      expect(toolNames).toContain('route_general_intent');
      expect(toolNames).toContain('route_payment_intent');
      expect(toolNames).toContain('route_pix_intent');
      expect(toolNames).toContain('route_pix_onramp_intent');
      expect(toolNames).toContain('route_pix_offramp_intent');

      if (expectedIntent !== IntentType.GENERAL) {
        expect(expectedTool).not.toBe('route_general_intent');
      }
    });
  });

  it('binds the LLM route tools with required tool choice and uses general only as an explicit route', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: 'call_general',
        name: 'route_general_intent',
        args: {
          confidence: 0.95,
          reason: 'broad capability question',
          needs_clarification: false,
          language: 'pt-BR',
          risk: 'low',
        },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    const intent = await graph.detectIntent('olá, explica o que você faz');

    expect(intent).toBe(IntentType.GENERAL);
    expect(routerInvoke).toHaveBeenCalledTimes(1);
    expect(graph.llm.bindTools).toHaveBeenCalledTimes(1);
    expect(graph.llm.bindTools.mock.calls[0][1]).toEqual({ tool_choice: 'required' });
  });

  it('audits a suspicious contacts route through a second LLM route call instead of using a parser', async () => {
    const graph = new AgentGraph(createRepository() as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest
      .fn()
      .mockResolvedValueOnce({
        tool_calls: [{
          id: 'call_contacts',
          name: 'route_contacts_intent',
          args: {
            confidence: 0.91,
            reason: 'incorrectly thought adicionar means contacts',
            needs_clarification: true,
            language: 'pt-BR',
            risk: 'high',
          },
        }],
      })
      .mockResolvedValueOnce({
        tool_calls: [{
          id: 'call_pix',
          name: 'route_pix_onramp_intent',
          args: {
            confidence: 0.99,
            reason: 'own-account PIX top-up',
            needs_clarification: false,
            language: 'pt-BR',
            risk: 'high',
          },
        }],
      });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    const intent = await graph.detectIntent('me ajude com o colocar 100 reais via pix');

    expect(intent).toBe(IntentType.PIX);
    expect(routerInvoke).toHaveBeenCalledTimes(2);
    const auditMessages = routerInvoke.mock.calls[1][0].map((message: any) => flattenMessageContent(message.content)).join('\n');
    expect(auditMessages).toContain('ROUTE AUDIT');
    expect(auditMessages).toContain('Previous route tool selected: route_contacts_intent');
    expect(auditMessages).toContain('call route_pix_onramp_intent');
  });

  it('audits a suspicious PIX on-ramp route into PIX-funded contact payment without using a parser', async () => {
    const graph = new AgentGraph(createRepository() as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest
      .fn()
      .mockResolvedValueOnce({
        tool_calls: [{
          id: 'call_wrong_onramp',
          name: 'route_pix_onramp_intent',
          args: {
            confidence: 0.92,
            reason: 'incorrectly treated PIX as own-account top-up',
            needs_clarification: false,
            language: 'pt-BR',
            risk: 'high',
          },
        }],
      })
      .mockResolvedValueOnce({
        tool_calls: [{
          id: 'call_pix_contact',
          name: 'route_pix_intent',
          args: {
            confidence: 0.99,
            reason: 'PIX funds payment to Ana Silva for final 100 XLM',
            needs_clarification: false,
            language: 'pt-BR',
            risk: 'high',
          },
        }],
      });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    const intent = await graph.detectIntent('uero fazer pix pra ana silva de 100 xlm');

    expect(intent).toBe(IntentType.PIX);
    expect(routerInvoke).toHaveBeenCalledTimes(2);
    const auditMessages = routerInvoke.mock.calls[1][0].map((message: any) => flattenMessageContent(message.content)).join('\n');
    expect(auditMessages).toContain('ROUTE AUDIT');
    expect(auditMessages).toContain('Previous route tool selected: route_pix_onramp_intent');
    expect(auditMessages).toContain('uero fazer pix pra ana silva de 100 xlm');
    expect(auditMessages).toContain('must be route_pix_intent, not route_pix_onramp_intent');
    expect(auditMessages).toContain('pay Ana Silva 100 XLM using PIX funding');
  });

  it('does not mask LLM router API failures as generic help', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockRejectedValue(new Error('429 You exceeded your current quota'));
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    const result = await graph.processInput(createState('quero ver meu sald9'));

    expect(routerInvoke).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe('intent_router_unavailable');
    expect(result.response_message).toContain('instabilidade');
    expect(result.response_message).toContain('ação, valor, moeda e destino');
    expect(result.response_message).not.toMatch(/LLM|interpretador|acesso/i);
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
  });

  it('does not mask missing production router configuration as generic help outside tests', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, '', 'production prompt') as any;

    try {
      const result = await graph.processInput(createState('quero mandar 10 xlm pra ana silva'));

      expect(result.success).toBe(false);
      expect(result.error).toBe('intent_router_unavailable');
      expect(result.response_message).toContain('instabilidade');
      expect(result.response_message).toContain('ação, valor, moeda e destino');
      expect(result.response_message).not.toMatch(/LLM|interpretador|acesso/i);
      expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
      expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('selects the highest-confidence LLM route when the model returns more than one route tool', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [
        {
          id: 'call_general',
          name: 'route_general_intent',
          args: {
            confidence: 0.2,
            reason: 'too broad',
            needs_clarification: true,
            language: 'pt-BR',
            risk: 'low',
          },
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
    expect(executeToolMock).not.toHaveBeenCalledWith('get_balance', expect.anything());
    expect(result.response_message).toContain('Abra seu saldo aqui:');
    expect(result.response_message).toContain('PIN');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('does not let routed money-transfer requests fall through to the generic menu path', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const contactPublicKey = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: 'call_payment',
        name: 'route_payment_intent',
        args: {
          confidence: 0.99,
          reason: 'specific amount, asset, and saved contact recipient',
          needs_clarification: false,
          language: 'pt-BR',
          risk: 'high',
          amount: '7',
          asset_code: 'CETES',
          recipient_query: 'Marina Costa',
        },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'get_intent_help') {
        throw new Error('generic menu should not be used for this request');
      }

      if (name === 'list_contacts') {
        return JSON.stringify({
          success: true,
          contacts: [
            {
              contact_name: 'Marina Costa',
              stellar_public_key: contactPublicKey,
              email: 'marina@example.com',
            },
          ],
        });
      }

      if (name === 'prepare_payment_confirmation') {
        return JSON.stringify({
          success: true,
          url: 'https://app.example.com/confirm-payment?token=abc',
        });
      }

      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const result = await graph.processInput(createState('qro enviar 7 cetes para marina costa'));

    expect(graph.llm.bindTools).toHaveBeenCalledWith(expect.any(Array), { tool_choice: 'required' });
    expect(routerInvoke).toHaveBeenCalled();
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.action_type).toBe(ActionType.BUILD_PAYMENT);
    expect(result.response_message).toContain('7.00 CETES');
    expect(result.response_message).toContain('Marina Costa');
    expect(result.response_message).toContain('/confirm-payment?');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('routes the exact WhatsApp XLM-to-contact request to payment instead of the help menu', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const contactPublicKey = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
    const routerInvoke = mockRouteIntent(graph, 'route_payment_intent', {
      amount: '10',
      asset_code: 'XLM',
      recipient_query: 'Ana Silva',
    });

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'get_intent_help') {
        throw new Error('generic menu should not be used for this request');
      }

      if (name === 'list_contacts') {
        return JSON.stringify({
          success: true,
          contacts: [
            {
              contact_name: 'Ana Silva',
              stellar_public_key: contactPublicKey,
              email: 'ana@example.com',
            },
          ],
        });
      }

      if (name === 'prepare_payment_confirmation') {
        return JSON.stringify({
          success: true,
          url: 'https://app.example.com/confirm-payment?token=ana-xlm',
        });
      }

      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const result = await graph.processInput(createState('quero mandar 10 xlm pra ana silva'));

    expect(routerInvoke).toHaveBeenCalled();
    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.action_type).toBe(ActionType.BUILD_PAYMENT);
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
    expect(executeToolMock).toHaveBeenCalledWith('prepare_payment_confirmation', expect.objectContaining({
      amount: '10',
      asset_code: 'XLM',
      destination: contactPublicKey,
      destination_name: 'Ana Silva',
    }));
    expect(result.response_message).toContain('10.00 XLM');
    expect(result.response_message).toContain('Ana Silva');
    expect(result.response_message).toContain('/confirm-payment?');
    expect(result.response_message).toContain('Gerei o link de confirmação com a cotação atual');
    expect(result.response_message).not.toMatch(/confirmar o saldo|saldo suficiente|taxa estimada|indispon[ií]vel/i);
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('keeps layered external conversion as payment clarification instead of opening generic PIX', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_payment_intent', {
      needs_clarification: true,
      amount: '10',
      asset_code: 'USDC',
      source_asset_code: 'USDC',
      dest_asset_code: 'XLM',
    });

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'get_intent_help') {
        throw new Error('generic menu should not be used for layered transfer');
      }
      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const result = await graph.processInput(createState('uero mandar 10 usdc em xlm pra fora'));

    expect(routerInvoke).toHaveBeenCalled();
    expect(graph.llm.invoke).not.toHaveBeenCalled();
    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.action_type).toBe(ActionType.BUILD_PAYMENT);
    expect(result.success).toBe(false);
    expect(result.response_message).toContain('duas camadas');
    expect(result.response_message).toContain('US$ 10.00');
    expect(result.response_message).toContain('XLM');
    expect(result.response_message).toContain('destino externo');
    expect(result.response_message).not.toContain('Abra para PIX');
    expect(result.response_message).not.toContain('/pix-on');
    expect(result.response_message).not.toContain('/pix-off');
    expect(result.response_message).not.toContain('Me diga a chave, email, telefone ou public key do contato');
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
  });

  it('preserves destination asset when PIX tops up a cross-asset contact payment', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const contactPublicKey = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    mockRouteIntent(graph, 'route_payment_intent', {
      amount: '100',
      asset_code: 'BRL',
      source_asset_code: 'BRL',
      dest_asset_code: 'USDC',
      recipient_query: 'Marina Costa',
    });
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'get_intent_help') {
        throw new Error('generic menu should not be used for cross-asset payment');
      }
      if (name === 'list_contacts') {
        return JSON.stringify({
          success: true,
          contacts: [
            {
              contact_name: 'Marina Costa',
              stellar_public_key: contactPublicKey,
              email: 'marina@example.com',
            },
          ],
        });
      }
      if (name === 'get_balance') {
        return JSON.stringify({
          success: true,
          balances: [
            { asset: 'BRL', balance: '0.0000000' },
            { asset: 'USDC', balance: '0.0000000' },
          ],
        });
      }

      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const result = await graph.processInput(createState('quero mandar pra Marina Costa 100 brl da minha conta pra chegar na dela como usss'));
    const link = result.response_message.match(/https?:\/\/\S+/)?.[0] || '';
    const parsed = new URL(link);

    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Marina Costa');
    expect(result.response_message).toContain('R$ 100.00');
    expect(result.response_message).toContain('US$');
    expect(result.response_message).toContain('converte');
    expect(parsed.pathname).toBe('/pix-on');
    expect(parsed.searchParams.get('flow')).toBe('fund_and_pay');
    expect(parsed.searchParams.get('amount')).toBe('100');
    expect(parsed.searchParams.get('currency')).toBe('BRL');
    expect(parsed.searchParams.get('asset')).toBe('BRL');
    expect(parsed.searchParams.get('target_asset')).toBeNull();
    expect(parsed.searchParams.get('receive_amount')).toBeNull();
    expect(parsed.searchParams.get('receive_asset')).toBeNull();
    expect(parsed.searchParams.get('recipient')).toBe('Marina Costa');
    expect(parsed.searchParams.get('recipient_public_key')).toBe(contactPublicKey);
    expect(parsed.searchParams.get('pay_amount')).toBe('100');
    expect(parsed.searchParams.get('pay_asset')).toBe('BRL');
    expect(parsed.searchParams.get('pay_source_amount')).toBe('100');
    expect(parsed.searchParams.get('pay_source_asset')).toBe('BRL');
    expect(parsed.searchParams.get('pay_destination_asset')).toBe('USDC');
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
  });

  it('keeps the requested receive asset for English PIX-funded contact payments', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const contactPublicKey = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    mockRouteIntent(graph, 'route_pix_intent', {
      amount: '100',
      asset_code: 'USDC',
      dest_asset_code: 'CETES',
      recipient_query: 'Ana Silva',
      language: 'en',
    });
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'get_intent_help') {
        throw new Error('generic menu should not be used for PIX-funded cross-asset payment');
      }
      if (name === 'list_contacts') {
        return JSON.stringify({
          success: true,
          contacts: [
            {
              contact_name: 'Ana Silva',
              stellar_public_key: contactPublicKey,
              phone: '5575496918127',
            },
          ],
        });
      }

      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const result = await graph.processInput(createState('want to send 100 usdc pix to ana silva so they recieve in CETES'));
    const link = result.response_message.match(/https?:\/\/\S+/)?.[0] || '';
    const parsed = new URL(link);

    expect(result.detected_intent).toBe(IntentType.PIX);
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Ana Silva');
    expect(result.response_message).toContain('US$ 100.00');
    expect(result.response_message).toContain('to deliver in CETES');
    expect(parsed.pathname).toBe('/pix-on');
    expect(parsed.searchParams.get('flow')).toBe('fund_and_pay');
    expect(parsed.searchParams.get('amount')).toBe('100');
    expect(parsed.searchParams.get('currency')).toBe('USDC');
    expect(parsed.searchParams.get('asset')).toBe('USDC');
    expect(parsed.searchParams.get('target_asset')).toBe('USDC');
    expect(parsed.searchParams.get('lang')).toBe('en');
    expect(parsed.searchParams.get('receive_amount')).toBeNull();
    expect(parsed.searchParams.get('receive_asset')).toBeNull();
    expect(parsed.searchParams.get('recipient')).toBe('Ana Silva');
    expect(parsed.searchParams.get('recipient_public_key')).toBe(contactPublicKey);
    expect(parsed.searchParams.get('pay_amount')).toBe('100');
    expect(parsed.searchParams.get('pay_asset')).toBe('USDC');
    expect(parsed.searchParams.get('pay_source_amount')).toBe('100');
    expect(parsed.searchParams.get('pay_source_asset')).toBe('USDC');
    expect(parsed.searchParams.get('pay_destination_asset')).toBe('CETES');
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
  });

  it('asks one specific payment clarification instead of showing the generic menu', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_payment_intent', {
      recipient_query: 'Ana Silva',
      needs_clarification: true,
    });
    graph.llm.invoke.mockResolvedValue({
      content: JSON.stringify({
        recipient_query: 'Ana Silva',
        amount: '',
        asset_code: '',
        receive_asset_code: '',
        category: '',
        memo: '',
        is_payment_link: false,
        needs_clarification: true,
        clarification_question: '',
      }),
    });

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'get_intent_help') {
        throw new Error('generic menu should not be used for a clear payment intent');
      }
      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const result = await graph.processInput(createState('quero mandar dinheiro para Ana Silva'));

    expect(routerInvoke).toHaveBeenCalledTimes(1);
    expect(graph.llm.invoke).not.toHaveBeenCalled();
    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.action_type).toBe(ActionType.BUILD_PAYMENT);
    expect(result.success).toBe(false);
    expect(result.response_message).toContain('Destino entendido: Ana Silva');
    expect(result.response_message).toContain('Falta só completar o envio');
    expect(result.response_message).toContain('valor e moeda');
    expect(result.response_message).toContain('Ana Silva');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
    expect(result.response_message).not.toContain('Diga o que quer fazer');
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
  });

  it('keeps payment clarification in English when the session language is English', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_payment_intent', {
      recipient_query: 'Ana Silva',
      needs_clarification: true,
      language: 'en',
    });
    graph.llm.invoke.mockResolvedValue({
      content: JSON.stringify({
        recipient_query: 'Ana Silva',
        amount: '',
        asset_code: '',
        receive_asset_code: '',
        is_payment_link: false,
        needs_clarification: true,
        clarification_question: '',
      }),
    });

    const state = createState('send money to Ana Silva');
    state.action_params = {
      ...state.action_params,
      language: 'en',
    };

    const result = await graph.processInput(state);

    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.success).toBe(false);
    expect(result.response_message).toContain('Recipient understood: Ana Silva');
    expect(result.response_message).toContain('amount and currency');
    expect(result.response_message).toContain('send 3 USDC to Ana Silva');
    expect(result.response_message).not.toContain('Falta só');
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

  it('routes send requests with amount, asset, and saved contact as payments', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_payment_intent', {
      amount: '7',
      asset_code: 'CETES',
      recipient_query: 'Marina Costa',
    });
    const contactPublicKey = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'list_contacts') {
        return JSON.stringify({
          success: true,
          contacts: [
            {
              contact_name: 'Marina Costa',
              stellar_public_key: contactPublicKey,
              email: 'marina@example.com',
            },
          ],
        });
      }

      if (name === 'prepare_payment_confirmation') {
        return JSON.stringify({
          success: true,
          url: 'https://app.example.com/confirm-payment?token=abc',
        });
      }

      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const result = await graph.processInput(createState('qro enviar 7 cetes para marina costa'));

    expect(routerInvoke).toHaveBeenCalled();
    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.action_type).toBe(ActionType.BUILD_PAYMENT);
    expect(executeToolMock).toHaveBeenCalledWith('prepare_payment_confirmation', expect.objectContaining({
      session_id: 'eval-session',
      owner_id: 'eval-user',
      amount: '7',
      asset_code: 'CETES',
      destination: contactPublicKey,
      destination_name: 'Marina Costa',
    }));
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('7.00 CETES');
    expect(result.response_message).toContain('Marina Costa');
    expect(result.response_message).toContain('/confirm-payment?');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
  });

  it('keeps cross-asset payment quote copy in English for English external sessions', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const contactPublicKey = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
    mockRouteIntent(graph, 'route_payment_intent', {
      amount: '100',
      asset_code: 'USDC',
      dest_asset_code: 'CETES',
      recipient_query: 'Ana Silva',
      language: 'pt-BR',
    });

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'list_contacts') {
        return JSON.stringify({
          success: true,
          contacts: [
            {
              contact_name: 'Ana Silva',
              stellar_public_key: contactPublicKey,
              email: 'ana@example.com',
            },
          ],
        });
      }
      if (name === 'get_balance') {
        return JSON.stringify({
          success: true,
          balances: [
            { asset: 'USDC', balance: '250.0000000' },
          ],
        });
      }
      if (name === 'get_saldo_tecnico') {
        return JSON.stringify({
          success: true,
          balances: [
            { asset: 'USDC', asset_issuer: 'USDCISSUER' },
            { asset: 'CETES', asset_issuer: 'CETESISSUER' },
          ],
        });
      }
      if (name === 'get_best_route') {
        return JSON.stringify({
          success: true,
          quote: {
            sourceAmount: '100',
            sourceAsset: { code: 'USDC', issuer: 'USDCISSUER' },
            destinationAmount: '1540.11',
            destinationAsset: { code: 'CETES', issuer: 'CETESISSUER' },
            quote_ttl_seconds: 900,
          },
          fee_breakdown: {
            total_fee_display: '0.00001 XLM',
          },
          quote_ttl_seconds: 900,
        });
      }
      if (name === 'prepare_payment_confirmation') {
        return JSON.stringify({
          success: true,
          url: 'https://app.example.com/confirm-payment?token=ana-cetes',
        });
      }

      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const state = createState('ant to send 100 usdc to ana silva so they recieve in CETES');
    state.action_params = {
      ...state.action_params,
      language: 'en',
      external_provider: 'whatsapp',
      external_provider_user_id: '5575496918127',
      external_source: 'whatsapp',
    };

    const result = await graph.processInput(state);

    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.action_type).toBe(ActionType.BUILD_PAYMENT);
    expect(result.success).toBe(true);
    expect(executeToolMock).toHaveBeenCalledWith('prepare_payment_confirmation', expect.objectContaining({
      language: 'en',
      provider: 'whatsapp',
      provider_user_id: '5575496918127',
      source: 'whatsapp',
      source_amount: '100',
      source_asset_code: 'USDC',
      amount: '1540.11',
      asset_code: 'CETES',
    }));
    expect(result.response_message).toContain('Estimate before confirmation');
    expect(result.response_message).toContain('you send US$ 100.00');
    expect(result.response_message).toContain('Ana Silva receives approximately 1540.11 CETES');
    expect(result.response_message).toContain('Estimated fee: 0.00001 XLM.');
    expect(result.response_message).toContain('Quote valid for 15 minutes.');
    expect(result.response_message).toContain('To confirm, open the link:');
    expect(result.response_message).toContain('/confirm-payment?token=ana-cetes');
    expect(result.response_message).not.toContain('Estimativa antes de confirmar');
    expect(result.response_message).not.toContain('Taxa estimada');
    expect(result.response_message).not.toContain('Cotação válida');
    expect(result.response_message).not.toContain('Para confirmar');
  });

  it('keeps cross-asset payment quote copy in Portuguese when stored preference is Portuguese', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const contactPublicKey = 'GDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD';
    mockRouteIntent(graph, 'route_payment_intent', {
      amount: '10',
      asset_code: 'USDC',
      dest_asset_code: 'XLM',
      recipient_query: 'Rodrigo Camargo',
      language: 'en',
    });

    executeToolMock.mockImplementation(async (name: string) => {
      if (name === 'list_contacts') {
        return JSON.stringify({
          success: true,
          contacts: [
            {
              contact_name: 'Rodrigo Camargo',
              stellar_public_key: contactPublicKey,
              email: 'rodrigooobfcdog@gmail.com',
            },
          ],
        });
      }
      if (name === 'get_balance') {
        return JSON.stringify({
          success: true,
          balances: [
            { asset: 'USDC', balance: '50.0000000' },
          ],
        });
      }
      if (name === 'get_saldo_tecnico') {
        return JSON.stringify({
          success: true,
          balances: [
            { asset: 'USDC', asset_issuer: 'USDCISSUER' },
            { asset: 'XLM', asset_issuer: '' },
          ],
        });
      }
      if (name === 'get_best_route') {
        return JSON.stringify({
          success: true,
          quote: {
            sourceAmount: '10',
            sourceAsset: { code: 'USDC', issuer: 'USDCISSUER' },
            destinationAmount: '15.3254281',
            destinationAsset: { code: 'XLM', issuer: '' },
            quote_ttl_seconds: 900,
          },
          fee_breakdown: {
            total_fee_display: '0.00001 XLM',
          },
          quote_ttl_seconds: 900,
        });
      }
      if (name === 'prepare_payment_confirmation') {
        return JSON.stringify({
          success: true,
          url: 'https://app.example.com/confirm-payment?token=rodrigo-xlm',
        });
      }

      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const state = createState('quero mandar 10 usdc pro rodrigooobfcdog@gmail.com receber em xlm');
    state.action_params = {
      ...state.action_params,
      language: 'en',
      preferred_language: 'pt-BR',
      external_provider: 'whatsapp',
      external_provider_user_id: '5575496918127',
      external_source: 'whatsapp',
    };

    const result = await graph.processInput(state);

    expect(result.detected_intent).toBe(IntentType.PAYMENT);
    expect(result.action_type).toBe(ActionType.BUILD_PAYMENT);
    expect(result.success).toBe(true);
    expect(executeToolMock).toHaveBeenCalledWith('prepare_payment_confirmation', expect.objectContaining({
      language: 'pt-BR',
      provider: 'whatsapp',
      provider_user_id: '5575496918127',
      source: 'whatsapp',
      source_amount: '10',
      source_asset_code: 'USDC',
      amount: '15.3254281',
      asset_code: 'XLM',
    }));
    expect(result.response_message).toContain('Estimativa antes de confirmar');
    expect(result.response_message).toContain('você envia US$ 10.00');
    expect(result.response_message).toContain('Rodrigo Camargo recebe aproximadamente 15.32 XLM');
    expect(result.response_message).not.toContain('15.3254281 XLM');
    expect(result.response_message).toContain('Taxa estimada: 0.00001 XLM.');
    expect(result.response_message).toContain('Cotação válida por 15 minutos.');
    expect(result.response_message).toContain('Para confirmar, abra o link:');
    expect(result.response_message).not.toContain('Estimate before confirmation');
    expect(result.response_message).not.toContain('Estimated fee');
    expect(result.response_message).not.toContain('To confirm');
  });

  it('routes PIX send wording through the product intent router instead of generic help', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';

    const routerInvoke = mockRouteIntent(graph, 'route_pix_onramp_intent', {
      amount: '100',
      asset_code: 'BRL',
    });
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

  it('routes own-account PIX top-up help wording to on-ramp instead of asking for a contact', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';

    const routerInvoke = mockRouteIntent(graph, 'route_pix_onramp_intent', {
      amount: '100',
      asset_code: 'BRL',
    });
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    try {
      const result = await graph.processInput(createState('me ajude com o colocar 100 reais via pix'));

      expect(routerInvoke).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('/pix-on?');
      expect(result.response_message).toContain('amount=100');
      expect(result.response_message).toContain('currency=BRL');
      expect(result.response_message).toContain('receive_amount=100');
      expect(result.response_message).toContain('receive_asset=BRL');
      expect(result.response_message).not.toContain('Me diga a chave');
      expect(result.response_message).not.toContain('email, telefone ou public key');
      expect(result.response_message).not.toContain('Posso ajudar com:');
      expect(executeToolMock.mock.calls.some(([name]) => name === 'list_contacts')).toBe(false);
      expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('routes own-account PIX USDC wording to exact USDC receive instead of BRL quote reference', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';

    const routerInvoke = mockRouteIntent(graph, 'route_pix_onramp_intent', {
      amount: '100',
      asset_code: 'USDC',
    });
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    try {
      const result = await graph.processInput(createState('uero mandar um pix pra chegar 100 usdc na minha conta'));

      expect(routerInvoke).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('/pix-on?');
      expect(result.response_message).toContain('asset=USDC');
      expect(result.response_message).toContain('target_asset=USDC');
      expect(result.response_message).toContain('receive_amount=100');
      expect(result.response_message).toContain('receive_asset=USDC');
      expect(result.response_message).toContain('currency=BRL');
      expect(result.response_message).not.toContain('quote_amount=100');
      expect(result.response_message).not.toContain('quote_asset=USDC');
      expect(result.response_message).toContain('US$ 100.00');
      expect(result.response_message).toContain('saldo entrar como USDC');
      expect(result.response_message).not.toContain('Não encontrei "chegar"');
      expect(result.response_message).not.toContain('contatos salvos');
      expect(result.response_message).not.toContain('Me diga a chave');
      expect(executeToolMock.mock.calls.some(([name]) => name === 'list_contacts')).toBe(false);
      expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('routes own-account PIX two-asset wording to receive first asset then convert', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';

    const routerInvoke = mockRouteIntent(graph, 'route_pix_onramp_intent', {
      amount: '100',
      asset_code: 'XLM',
      dest_asset_code: 'USDC',
    });
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    try {
      const result = await graph.processInput(createState('uero colocar 100 xlm pra eu receber em usdc'));

      expect(routerInvoke).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('/pix-on?');
      expect(result.response_message).toContain('asset=XLM');
      expect(result.response_message).toContain('target_asset=XLM');
      expect(result.response_message).toContain('receive_amount=100');
      expect(result.response_message).toContain('receive_asset=XLM');
      expect(result.response_message).toContain('flow=fund_and_convert');
      expect(result.response_message).toContain('post_conversion_asset=USDC');
      expect(result.response_message).toContain('convert_to_asset=USDC');
      expect(result.response_message).toContain('100.00 XLM');
      expect(result.response_message).toContain('converter para USDC');
      expect(result.response_message).not.toContain('Ana Silva');
      expect(result.response_message).not.toContain('US$ 100.00');
      expect(result.response_message).not.toContain('Me diga a chave');
      expect(executeToolMock.mock.calls.some(([name]) => name === 'list_contacts')).toBe(false);
      expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('routes outside-PIX wording to off-ramp copy and URL instead of on-ramp copy', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.example.com';

    const routerInvoke = mockRouteIntent(graph, 'route_pix_offramp_intent', {
      amount: '50',
      asset_code: 'BRL',
      source_asset_code: 'BRL',
    });
    graph.externalService = {
      shortenPublicUrl: jest.fn(async ({ url }: { url: string }) => url),
    };

    try {
      const result = await graph.processInput(createState('quero mandar pra fora 50 reais em pix'));

      expect(routerInvoke).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('/pix-off?');
      expect(result.response_message).toContain('mode=offramp');
      expect(result.response_message).toContain('fiat_amount=50');
      expect(result.response_message).toContain('target_brl=50');
      expect(result.response_message).toContain('Para retirar');
      expect(result.response_message).toContain('taxa de retirada aproximada');
      expect(result.response_message).toContain('quanto chega em reais no seu PIX');
      expect(result.response_message).not.toContain('/pix-on?');
      expect(result.response_message).not.toContain('o PIX a pagar');
      expect(result.response_message).not.toContain('Posso ajudar com:');
      expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
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
              arguments: '{"confidence":0.96,"reason":"explicit conversion","needs_clarification":false,"language":"pt-BR","risk":"high"}',
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
        optimization_criteria: 'melhor cotação disponível para o valor de envio informado',
        message: 'Cotação atual.',
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

  it('opens the conversion selector for generic conversion requests instead of generic help', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    const routerInvoke = mockRouteIntent(graph, 'route_conversion_intent');
    graph.extractConversionIntentWithLlm = jest.fn().mockResolvedValue({
      sourceAmount: '',
      sourceAssetCode: '',
      destAssetCode: '',
      needs_clarification: true,
      clarification_question: '',
    });

    executeToolMock.mockImplementation(async (name: string, args: any) => {
      if (name === 'get_intent_help') {
        throw new Error('generic menu should not be used for a clear conversion intent');
      }
      if (name === 'open_conversion_interface') {
        return JSON.stringify({
          success: true,
          frontend_url: `https://app.example.com/convert?source=${args.source_asset_code}&dest=${args.dest_asset_code}`,
        });
      }
      return JSON.stringify({ success: false, error: `unexpected tool ${name}` });
    });

    const result = await graph.processInput(createState('quero converter dinheiro'));

    expect(routerInvoke).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.detected_intent).toBe(IntentType.CONVERSION);
    expect(result.action_type).toBe(ActionType.CONVERT_ASSETS);
    expect(executeToolMock).toHaveBeenCalledWith('open_conversion_interface', expect.objectContaining({
      source_asset_code: 'BRL',
      dest_asset_code: 'USDC',
      language: 'pt-BR',
    }));
    expect(executeToolMock).not.toHaveBeenCalledWith('get_intent_help', {});
    expect(result.response_message).toContain('Abra a tela de conversão');
    expect(result.response_message).toContain('/convert?');
    expect(result.response_message).not.toContain('Posso ajudar com sua conta TalkToStellar');
    expect(result.response_message).not.toContain('Diga o que quer fazer');
  });

  it('routes yield deposits to prepare_yield_action with BRL normalized from reais', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent', {
      amount: '250',
      asset_code: 'BRL',
      yield_action: 'deposit',
      yield_mode: 'prepare',
    });

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

  it('routes yield balance checks to the secure screen without exposing amounts in chat', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent', {
      asset_code: 'CETES',
      yield_action: 'deposit',
      yield_mode: 'balance',
      risk: 'low',
    });

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      frontend_url: 'https://app.example.com/rendimentos?asset=CETES',
      message: 'Current position: 70 dollars.',
    }));

    const result = await graph.processInput(createState('quero ver meus investimentos'));

    expect(executeToolMock).toHaveBeenCalledWith('get_yield_balance', {
      session_id: 'eval-session',
      session_token: 'eval-session-token',
      asset_code: 'CETES',
      language: 'pt-BR',
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('https://app.example.com/rendimentos?asset=CETES');
    expect(result.response_message).toContain('PIN');
    expect(result.response_message).not.toContain('Current position');
    expect(result.response_message).not.toContain('70');
    expect(result.response_message).not.toContain('dollars');
  });

  it('routes explicit yield confirmations with PIN to confirm_yield_action', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'production prompt') as any;
    mockRouteIntent(graph, 'route_yield_intent', {
      amount: '100',
      asset_code: 'BRL',
      yield_action: 'deposit',
      yield_mode: 'confirm',
      pin: '1234',
    });

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
    mockRouteIntent(graph, 'route_yield_intent', {
      amount: '100',
      asset_code: 'BRL',
      yield_action: 'deposit',
      yield_mode: 'prepare',
    });

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

  it('does not route broad keep-asset navigation through a local parser', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Posso ajudar com saldo, PIX, conversão, rendimentos, pagamentos e histórico.',
    }));

    const result = await graph.processInput(createState('manter 50 cetes'));

    expect(executeToolMock).toHaveBeenCalledWith('get_intent_help', {});
    expect(executeToolMock).not.toHaveBeenCalledWith('open_asset_interface', expect.anything());
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('rendimentos');
  });

  it('does not route send-out navigation with dynamic PIX key through a local parser', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'production prompt');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: true,
      message: 'Posso ajudar com saldo, PIX, conversão, rendimentos, pagamentos e histórico.',
    }));

    const result = await graph.processInput(createState('mandar embora 100 reais para user@example.com'));

    expect(executeToolMock).toHaveBeenCalledWith('get_intent_help', {});
    expect(executeToolMock).not.toHaveBeenCalledWith('open_asset_interface', expect.anything());
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('PIX');
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
    expect(source).toContain('taxa de retirada aproximada');
    expect(source).toContain('Do not expose SQL, schema cache, provider stack traces');
  });
});
