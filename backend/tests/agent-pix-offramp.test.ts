import { AgentGraph } from '../src/agent/graph';

describe('Agent PIX off-ramp detection', () => {
  const createRepository = () => ({
    saveMessage: jest.fn().mockResolvedValue(undefined),
    saveState: jest.fn().mockResolvedValue(undefined),
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
});
