import { AgentGraph } from '../src/api/agent/graph';
import { ActionType, AgentState, IntentType } from '../src/api/agent/types';

describe('Agent PIX off-ramp detection', () => {
  const createRepository = () => ({
    saveMessage: jest.fn().mockResolvedValue(undefined),
    saveState: jest.fn().mockResolvedValue(undefined),
  });

  const createState = (input: string): AgentState => ({
    session_id: 'session-pix-offramp',
    session_data: {
      session_token: 'session-pix-offramp',
      user_id: 'user-pix-offramp',
      email: 'rodrigo@example.com',
      public_key: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    },
    messages: [],
    current_input: input,
    detected_intent: IntentType.GENERAL,
    action_type: ActionType.NONE,
    action_params: {},
    response_message: '',
    success: false,
  });

  const mockRouteIntent = (graph: any, toolName: string, args: Record<string, any> = {}) => {
    const routerInvoke = jest.fn().mockResolvedValue({
      tool_calls: [{
        id: `call_${toolName}`,
        name: toolName,
        args: {
          confidence: 0.99,
          reason: 'test route',
          needs_clarification: false,
          language: 'pt-BR',
          risk: 'high',
          ...args,
        },
      }],
    });
    graph.llm = {
      bindTools: jest.fn().mockReturnValue({ invoke: routerInvoke }),
      invoke: jest.fn(),
    };
    return routerInvoke;
  };

  it('treats retirar para outro banco as PIX off-ramp even without saying PIX', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const intent = (graph as any).extractPixRampIntentFromText('quero retirar 5 brl daa minha conta pra mandar pra outro banco');

    expect(intent).toMatchObject({
      is_pix_ramp: true,
      direction: 'offramp',
      amount: '5',
      amount_currency: 'BRL',
      asset_code: 'BRL',
    });
  });

  it('treats retirar USDC via offramp as PIX off-ramp link intent', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const intent = (graph as any).extractPixRampIntentFromText('quero retirar 5 usdc via offramp');

    expect(intent).toMatchObject({
      is_pix_ramp: true,
      direction: 'offramp',
      amount: '5',
      amount_currency: 'USDC',
      asset_code: 'USDC',
    });
  });

  it('treats mandar USDC pra fora da minha conta as PIX off-ramp even without saying PIX', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const intent = (graph as any).extractPixRampIntentFromText('quero mandar 10 usdc pra fora da minha conta');

    expect(intent).toMatchObject({
      is_pix_ramp: true,
      direction: 'offramp',
      amount: '10',
      amount_currency: 'USDC',
      asset_code: 'USDC',
    });
  });

  it('treats mandar reais pra fora do pix as PIX off-ramp instead of a contact payment', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const intent = (graph as any).extractPixRampIntentFromText('uero mandar 100 reais pra fora do pix');

    expect(intent).toMatchObject({
      is_pix_ramp: true,
      direction: 'offramp',
      flow: 'fund_wallet',
      amount: '100',
      amount_currency: 'BRL',
      asset_code: 'BRL',
    });
    expect(intent.recipient_query).toBeUndefined();
  });

  it('treats mandar pra fora reais em pix as PIX off-ramp instead of a contact payment', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const intent = (graph as any).extractPixRampIntentFromText('quero mandar pra fora 50 reais em pix');

    expect(intent).toMatchObject({
      is_pix_ramp: true,
      direction: 'offramp',
      flow: 'fund_wallet',
      amount: '50',
      amount_currency: 'BRL',
      asset_code: 'BRL',
    });
    expect(intent.recipient_query).toBeUndefined();
  });

  it('parses pt-BR thousands in PIX off-ramp amounts', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const intent = (graph as any).extractPixRampIntentFromText('quero mandar 10.000 usdc pra fora da minha conta');

    expect(intent).toMatchObject({
      is_pix_ramp: true,
      direction: 'offramp',
      amount: '10000',
      amount_currency: 'USDC',
      asset_code: 'USDC',
    });
  });

  it('builds PIX off-ramp URL with fixed BRL receive amount from the parsed tool intent', async () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const url = await (graph as any).buildPixRampUrl({
        session_id: 'session-1',
        session_data: { email: 'rodrigo@example.com', user_id: 'user-1' },
      }, {
        direction: 'offramp',
        amount: '5',
        amount_currency: 'BRL',
        asset_code: 'BRL',
      });
      const parsed = new URL(url);

      expect(parsed.pathname).toBe('/pix-off');
      expect(parsed.searchParams.get('amount')).toBe('5');
      expect(parsed.searchParams.get('currency')).toBe('BRL');
      expect(parsed.searchParams.get('fiat_amount')).toBe('5');
      expect(parsed.searchParams.get('fiat_currency')).toBe('BRL');
      expect(parsed.searchParams.get('email')).toBe('rodrigo@example.com');
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('processes money-out wording as a PIX off-ramp link instead of asking for payment recipient', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'test prompt') as any;
    mockRouteIntent(graph, 'route_pix_intent');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const result = await graph.processInput(createState('quero mandar 10 usdc pra fora da minha conta'));

      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('US$ 10.00');
      expect(result.response_message).toContain('/pix-off?');
      expect(result.response_message).toContain('source_asset=USDC');
      expect(result.response_message).toContain('source_amount=10');
      expect(result.response_message).toContain('reais no seu PIX');
      expect(result.response_message).not.toContain('Para quem você deseja enviar');
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('answers fora do pix wording with an off-ramp page instead of a missing contact error', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'test prompt') as any;
    mockRouteIntent(graph, 'route_pix_intent');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const result = await graph.processInput(createState('uero mandar 100 reais pra fora do pix'));

      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('/pix-off?');
      expect(result.response_message).toContain('source_asset=BRL');
      expect(result.response_message).toContain('source_amount=100');
      expect(result.response_message).toContain('fiat_amount=100');
      expect(result.response_message).not.toContain('Não encontrei');
      expect(result.response_message).not.toContain('contatos');
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('answers mandar pra fora reais em pix with an off-ramp page instead of a missing contact error', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'test prompt') as any;
    mockRouteIntent(graph, 'route_pix_intent');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const result = await graph.processInput(createState('quero mandar pra fora 50 reais em pix'));

      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('/pix-off?');
      expect(result.response_message).toContain('source_asset=BRL');
      expect(result.response_message).toContain('source_amount=50');
      expect(result.response_message).toContain('fiat_amount=50');
      expect(result.response_message).toContain('saldo que sai da conta');
      expect(result.response_message).toContain('chega no seu PIX');
      expect(result.response_message).not.toContain('PIX a pagar');
      expect(result.response_message).not.toContain('entra na conta');
      expect(result.response_message).not.toContain('Não encontrei');
      expect(result.response_message).not.toContain('contatos');
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('builds PIX on-ramp URL with receive_amount when user asks to receive dollars', async () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const intent = (graph as any).extractPixRampIntentFromText('quero receber 10 dolares via pix');
      const url = await (graph as any).buildPixRampUrl({
        session_id: 'session-1',
        session_data: { email: 'rodrigo@example.com', user_id: 'user-1' },
      }, intent);
      const parsed = new URL(url);

      expect(parsed.pathname).toBe('/pix-on');
      expect(parsed.searchParams.get('amount')).toBeNull();
      expect(parsed.searchParams.get('receive_amount')).toBe('10');
      expect(parsed.searchParams.get('receive_asset')).toBe('USDC');
      expect(parsed.searchParams.get('currency')).toBe('USDC');
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('continues a pending PIX on-ramp when the user replies with only the amount', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'test prompt');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };
    const state = createState('100 reais');
    state.action_params = {
      pending_pix_ramp: {
        direction: 'onramp',
        flow: 'fund_wallet',
        amount_currency: 'BRL',
        asset_code: 'BRL',
        created_at: new Date().toISOString(),
      },
    };

    try {
      const result = await graph.processInput(state);
      const link = result.response_message.match(/https?:\/\/\S+/)?.[0] || '';
      const parsed = new URL(link);

      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.success).toBe(true);
      expect(result.response_message).toContain('Tudo finalizado. Aqui estão suas informações');
      expect(result.response_message).toContain('100');
      expect(result.response_message).not.toContain('Conta conectada');
      expect(result.response_message).not.toContain('Escolha o que quer fazer agora');
      expect(parsed.pathname).toBe('/pix-on');
      expect(parsed.searchParams.get('amount')).toBe('100');
      expect(parsed.searchParams.get('receive_amount')).toBe('100');
      expect(repository.saveMessage).toHaveBeenCalledWith(
        state.session_id,
        'user',
        '100 reais'
      );
      expect(repository.saveState).toHaveBeenCalledWith(
        state.session_id,
        expect.objectContaining({
          pending_pix_ramp: undefined,
        })
      );
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('opens Telegram PIX links directly once the account session is active', async () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    const shortenPublicUrl = jest.fn(async ({ url }) => url);
    (graph as any).externalService = {
      createLoginUrlWithShortLink: jest.fn(),
      shortenPublicUrl,
    };

    try {
      const url = await (graph as any).buildPixRampUrl({
        session_id: 'session-telegram',
        session_data: { email: 'rodrigo@example.com', user_id: 'user-telegram' },
        action_params: {
          external_provider: 'telegram',
          external_provider_user_id: '123456',
          external_source: 'telegram',
        },
      }, {
        direction: 'onramp',
        amount: '100',
        amount_currency: 'BRL',
        asset_code: 'BRL',
      });
      const parsed = new URL(url);

      expect((graph as any).externalService.createLoginUrlWithShortLink).not.toHaveBeenCalled();
      expect(shortenPublicUrl).toHaveBeenCalledWith(expect.objectContaining({
        purpose: 'pix_onramp',
        sessionId: 'session-telegram',
        userId: 'user-telegram',
      }));
      expect(parsed.pathname).toBe('/pix-on');
      expect(parsed.searchParams.get('amount')).toBe('100');
      expect(parsed.searchParams.get('asset')).toBe('BRL');
      expect(parsed.searchParams.get('currency')).toBe('BRL');
      expect(parsed.searchParams.get('provider')).toBe('telegram');
      expect(parsed.searchParams.get('provider_user_id')).toBe('123456');
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('keeps BRL as the PIX input asset when the top-up amount is in reais', async () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const url = await (graph as any).buildPixRampUrl({
        session_id: 'session-1',
        session_data: { email: 'rodrigo@example.com', user_id: 'user-1' },
      }, {
        direction: 'onramp',
        amount: '100',
        amount_currency: 'BRL',
        asset_code: 'USDC',
      });
      const parsed = new URL(url);

      expect(parsed.pathname).toBe('/pix-on');
      expect(parsed.searchParams.get('amount')).toBe('100');
      expect(parsed.searchParams.get('currency')).toBe('BRL');
      expect(parsed.searchParams.get('asset')).toBe('BRL');
      expect(parsed.searchParams.get('target_asset')).toBe('USDC');
      expect(parsed.searchParams.get('receive_amount')).toBeNull();
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('builds PIX fund-and-pay URL with top-up amount and final payment amount', async () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const url = await (graph as any).buildPixRampUrl({
        session_id: 'session-1',
        session_data: { email: 'rodrigo@example.com', user_id: 'user-1' },
      }, {
        direction: 'onramp',
        flow: 'fund_and_pay',
        amount: '40',
        amount_currency: 'USDC',
        asset_code: 'USDC',
        recipient_query: 'Carlos',
        pay_amount: '50',
        pay_asset_code: 'USDC',
      });
      const parsed = new URL(url);

      expect(parsed.pathname).toBe('/pix-on');
      expect(parsed.searchParams.get('flow')).toBe('fund_and_pay');
      expect(parsed.searchParams.get('auto_pay_after_ramp')).toBe('1');
      expect(parsed.searchParams.get('amount')).toBe('40');
      expect(parsed.searchParams.get('receive_amount')).toBe('50');
      expect(parsed.searchParams.get('receive_asset')).toBe('USDC');
      expect(parsed.searchParams.get('recipient')).toBe('Carlos');
      expect(parsed.searchParams.get('pay_amount')).toBe('50');
      expect(parsed.searchParams.get('pay_asset')).toBe('USDC');
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('extracts PIX-funded contact transfer from direct-to-recipient wording', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const depositThenTransfer = (graph as any).extractPixRampIntentFromText(
      'quero colocar 100 brl pra minha conta via pix e fazer essa trasacao direto pra ana silva'
    );
    const paidByPix = (graph as any).extractPixRampIntentFromText(
      'quero fazer uma transacao pra ana silva de 100 brl na qual eu pago via pix'
    );

    expect(depositThenTransfer).toMatchObject({
      is_pix_ramp: true,
      direction: 'onramp',
      flow: 'fund_and_pay',
      amount: '100',
      amount_currency: 'BRL',
      asset_code: 'BRL',
      recipient_query: 'ana silva',
    });
    expect(paidByPix).toMatchObject({
      is_pix_ramp: true,
      direction: 'onramp',
      flow: 'fund_and_pay',
      amount: '100',
      amount_currency: 'BRL',
      asset_code: 'BRL',
      recipient_query: 'ana silva',
    });

    const exactXlmByPix = (graph as any).extractPixRampIntentFromText(
      'uero fazer pix pra ana silva de 100 xlm'
    );

    expect(exactXlmByPix).toMatchObject({
      is_pix_ramp: true,
      direction: 'onramp',
      flow: 'fund_and_pay',
      amount: '100',
      amount_currency: 'XLM',
      asset_code: 'XLM',
      recipient_query: 'ana silva',
    });

    const exactNaturalXlmByPix = (graph as any).extractPixRampIntentFromText(
      'quero fazer pix pra ana silva de 100 xlm'
    );

    expect(exactNaturalXlmByPix).toMatchObject({
      is_pix_ramp: true,
      direction: 'onramp',
      flow: 'fund_and_pay',
      amount: '100',
      amount_currency: 'XLM',
      asset_code: 'XLM',
      recipient_query: 'ana silva',
    });
  });

  it('processes PIX-funded contact transfer as auto-pay link instead of wallet top-up', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'test prompt') as any;
    mockRouteIntent(graph, 'route_pix_intent', {
      amount: '100',
      asset_code: 'BRL',
      recipient_query: 'Ana Silva',
    });
    const anaPublicKey = 'GDRJSYKLLAJB57DCGYAAH4XMFPURAI5VP6FI3VXE5SC2SEKCDGGZUZUP';
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    jest.spyOn(graph as any, 'resolveOwnedPaymentContact').mockResolvedValue({
      contact: {
        contact_name: 'Ana Silva',
        email: 'ana.silva@example.com',
        stellar_public_key: anaPublicKey,
      },
      destination: anaPublicKey,
      destinationName: 'Ana Silva',
    });
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const result = await graph.processInput(createState(
        'quero fazer uma transacao pra ana silva de 100 brl na qual eu pago via pix'
      ));
      const url = String(result.response_message.match(/https?:\/\/\S+/)?.[0] || '');
      const parsed = new URL(url);

      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('Ana Silva');
      expect(result.response_message).toContain('via PIX');
      expect(result.response_message).toContain('envia para Ana Silva');
      expect(result.response_message).not.toContain('saldo entrar como dólar digital');
      expect(parsed.pathname).toBe('/pix-on');
      expect(parsed.searchParams.get('amount')).toBe('100');
      expect(parsed.searchParams.get('currency')).toBe('BRL');
      expect(parsed.searchParams.get('asset')).toBe('BRL');
      expect(parsed.searchParams.get('receive_amount')).toBe('100');
      expect(parsed.searchParams.get('receive_asset')).toBe('BRL');
      expect(parsed.searchParams.get('pay_amount')).toBe('100');
      expect(parsed.searchParams.get('pay_asset')).toBe('BRL');
      expect(parsed.searchParams.get('flow')).toBe('fund_and_pay');
      expect(parsed.searchParams.get('auto_pay_after_ramp')).toBe('1');
      expect(parsed.searchParams.get('recipient')).toBe('Ana Silva');
      expect(parsed.searchParams.get('recipient_key')).toBe('ana.silva@example.com');
      expect(parsed.searchParams.get('recipient_public_key')).toBe(anaPublicKey);
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('preserves exact XLM target for PIX-funded contact transfer links', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'test prompt') as any;
    mockRouteIntent(graph, 'route_pix_intent', {
      amount: '100',
      asset_code: 'XLM',
      recipient_query: 'Ana Silva',
    });
    const anaPublicKey = 'GDRJSYKLLAJB57DCGYAAH4XMFPURAI5VP6FI3VXE5SC2SEKCDGGZUZUP';
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    jest.spyOn(graph as any, 'resolveOwnedPaymentContact').mockResolvedValue({
      contact: {
        contact_name: 'Ana Silva',
        email: 'ana.silva@example.com',
        stellar_public_key: anaPublicKey,
      },
      destination: anaPublicKey,
      destinationName: 'Ana Silva',
    });
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const state = createState('quero fazer pix pra ana silva de 100 xlm');
      state.action_params = {
        external_provider: 'whatsapp',
        external_provider_user_id: '+5511999999999',
      };
      const result = await graph.processInput(state);
      const url = String(result.response_message.match(/https?:\/\/\S+/)?.[0] || '');
      const parsed = new URL(url);

      expect(result.success).toBe(true);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.action_params.llm_route).toMatchObject({
        tool_name: 'route_pix_intent',
        amount: '100',
        asset_code: 'XLM',
        recipient_query: 'Ana Silva',
      });
      expect(result.response_message).toContain('100 XLM');
      expect(result.response_message).toContain('Ana Silva');
      expect(result.response_message).toContain('Para mandar 100 XLM para Ana Silva via PIX');
      expect(result.response_message).toContain('envia para Ana Silva');
      expect(result.response_message).not.toContain('receber R$ 100.00 na sua conta');
      expect(result.response_message).not.toContain('saldo entrar como US$');
      expect(result.response_message).not.toContain('saldo entrar como dólar');
      expect(result.response_message).not.toContain('sua conta via PIX');
      expect(parsed.pathname).toBe('/pix-on');
      expect(parsed.searchParams.get('asset')).toBe('XLM');
      expect(parsed.searchParams.get('currency')).toBe('XLM');
      expect(parsed.searchParams.get('receive_amount')).toBe('100');
      expect(parsed.searchParams.get('receive_asset')).toBe('XLM');
      expect(parsed.searchParams.get('pay_amount')).toBe('100');
      expect(parsed.searchParams.get('pay_asset')).toBe('XLM');
      expect(parsed.searchParams.get('flow')).toBe('fund_and_pay');
      expect(parsed.searchParams.get('auto_pay_after_ramp')).toBe('1');
      expect(parsed.searchParams.get('recipient')).toBe('Ana Silva');
      expect(parsed.searchParams.get('recipient_key')).toBe('ana.silva@example.com');
      expect(parsed.searchParams.get('recipient_public_key')).toBe(anaPublicKey);
      expect(parsed.searchParams.get('provider')).toBe('whatsapp');
      expect(parsed.searchParams.get('session_scope')).toBe('whatsapp');
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('blocks PIX-funded recipient link when the recipient is not a saved real contact', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'live-openai-key', 'test prompt') as any;
    mockRouteIntent(graph, 'route_pix_intent');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    const contactLookup = jest.spyOn(graph as any, 'resolveOwnedPaymentContact').mockResolvedValue({
      destination: '',
      destinationName: 'ana sillva',
    });
    (graph as any).externalService = {
      shortenPublicUrl: jest.fn(async ({ url }) => url),
    };

    try {
      const state = createState('quero mandar 10 brl em pix pra ana sillva');

      const result = await graph.processInput(state);

      expect(contactLookup).toHaveBeenCalledWith('ana sillva', 'user-pix-offramp');
      expect(result.success).toBe(false);
      expect(result.detected_intent).toBe(IntentType.PIX);
      expect(result.action_type).toBe(ActionType.INITIATE_PIX);
      expect(result.response_message).toContain('Não encontrei');
      expect(result.response_message).toContain('ana sillva');
      expect(result.response_message).not.toContain('/pix-on');
    } finally {
      contactLookup.mockRestore();
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  it('extracts direct payment wording with insufficient balance as a normal payment intent', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const intent = (graph as any).extractDirectPaymentIntentFromText('manda 50 dólares pro Carlos mas não tenho saldo');

    expect(intent).toMatchObject({
      recipient_query: 'carlos',
      amount: '50',
      asset_code: 'USDC',
    });
  });

  it('detects monthly PIX ramp history questions deterministically', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    expect((graph as any).isRampHistoryRequest('quanto depositei esse mês?')).toBe(true);
    expect((graph as any).rampHistoryPeriodFromText('quanto depositei esse mês?')).toBe('month');
  });

  it('defaults ambiguous PIX amount in dollars to on-ramp receive amount instead of BRL payment amount', () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');

    const intent = (graph as any).extractPixRampIntentFromText('quero dar 10 dolares via pix');

    expect(intent).toMatchObject({
      is_pix_ramp: true,
      direction: 'onramp',
      amount: '10',
      amount_currency: 'USDC',
      asset_code: 'USDC',
    });
  });
});
