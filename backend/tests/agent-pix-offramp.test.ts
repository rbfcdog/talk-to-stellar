import { AgentGraph } from '../src/agent/graph';
import { ActionType, AgentState, IntentType } from '../src/agent/types';

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
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'test prompt');
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
      expect(result.response_message).toContain('BRL no seu PIX');
      expect(result.response_message).not.toContain('Para quem você deseja enviar');
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

  it('wraps Telegram PIX links in login and preserves the PIX operation as next path', async () => {
    const graph = new AgentGraph(createRepository() as any, 'test-openai-key', 'test prompt');
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.talktostellar.test';
    const createLoginUrlWithShortLink = jest.fn(async (_provider, _providerUserId, extra) => ({
      url: `https://app.talktostellar.test/login?token=test-token&next=${encodeURIComponent(extra.next_path)}`,
    }));
    (graph as any).externalService = {
      createLoginUrlWithShortLink,
      shortenPublicUrl: jest.fn(async ({ url }) => url),
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
      const nextPath = parsed.searchParams.get('next') || '';
      const nextUrl = new URL(`https://app.talktostellar.test${nextPath}`);

      expect(createLoginUrlWithShortLink).toHaveBeenCalledWith('telegram', '123456', expect.objectContaining({
        next_path: expect.stringContaining('/pix-on?'),
      }));
      expect(parsed.pathname).toBe('/login');
      expect(nextUrl.pathname).toBe('/pix-on');
      expect(nextUrl.searchParams.get('amount')).toBe('100');
      expect(nextUrl.searchParams.get('provider')).toBe('telegram');
      expect(nextUrl.searchParams.get('provider_user_id')).toBe('123456');
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
      expect(parsed.searchParams.get('receive_amount')).toBe('40');
      expect(parsed.searchParams.get('receive_asset')).toBe('USDC');
      expect(parsed.searchParams.get('recipient')).toBe('Carlos');
      expect(parsed.searchParams.get('pay_amount')).toBe('50');
      expect(parsed.searchParams.get('pay_asset')).toBe('USDC');
    } finally {
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
