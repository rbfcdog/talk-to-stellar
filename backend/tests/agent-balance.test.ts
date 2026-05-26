import { AgentGraph } from '../src/api/agent/graph';
import { ActionType, AgentState, IntentType } from '../src/api/agent/types';
import { executeTool } from '../src/api/agent/tools';

jest.mock('../src/api/agent/tools', () => ({
  ALL_TOOLS: [],
  executeTool: jest.fn(),
}));

describe('Agent balance flow', () => {
  const createRepository = () => ({
    saveMessage: jest.fn().mockResolvedValue(undefined),
    saveState: jest.fn().mockResolvedValue(undefined),
  });

  const createState = (publicKey = ''): AgentState => ({
    session_id: '11111111-1111-4111-8111-111111111111',
    session_data: {
      session_token: 'token',
      user_id: 'user-1',
      email: 'user@example.com',
      public_key: publicKey,
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    },
    messages: [],
    current_input: 'quero ver meu saldo',
    detected_intent: IntentType.BALANCE,
    action_type: ActionType.GET_BALANCE,
    action_params: {},
    response_message: '',
    success: false,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses session_id fallback when public_key is missing', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'test prompt');
    const state = createState('');

    (executeTool as jest.Mock).mockResolvedValue(
      JSON.stringify({
        success: true,
        balances: [
          { asset: 'BRL', balance: '12.3400000' },
          { asset: 'USDC', balance: '8.9000000' },
        ],
      })
    );

    const result = await (graph as any).handleBalanceCheck(state);

    expect(executeTool).toHaveBeenCalledWith('get_balance', {
      session_id: '11111111-1111-4111-8111-111111111111',
      public_key: undefined,
    });
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Saldo da sua conta TalkToStellar:');
    expect(result.response_message).toContain('R$: 12.3400000');
    expect(result.response_message).toContain('US$: 8.9000000');
  });

  it('does not expose account preparation internals when balance is unavailable', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'test prompt');
    const state = createState('GTESTPUBLICKEY');

    (executeTool as jest.Mock).mockResolvedValue(
      JSON.stringify({
        success: false,
        code: 'account_preparing',
        error: 'Failed to fund account using Friendbot: 400 createAccountAlreadyExist',
      })
    );

    const result = await (graph as any).handleBalanceCheck(state);

    expect(result.success).toBe(false);
    expect(result.response_message).toBe('Não consegui consultar seu saldo agora. Tente novamente em alguns segundos.');
    expect(result.response_message).not.toContain('Friendbot');
    expect(result.response_message).not.toContain('createAccountAlreadyExist');
    expect(result.response_message).not.toContain('sincronizando');
  });

  it('calculates spendable XLM when user asks to convert the whole balance', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'test prompt');
    const state = createState('GTESTPUBLICKEY');
    state.current_input = 'converta todo o xlm da conta pra usdc';

    (executeTool as jest.Mock).mockResolvedValue(
      JSON.stringify({
        success: true,
        balances: [
          { asset: 'XLM', balance: '9999.9999600' },
          { asset: 'USDC', balance: '0.0000000' },
        ],
      })
    );

    expect((graph as any).isFullBalanceConversionRequest(state.current_input)).toBe(true);

    const resolved = await (graph as any).resolveFullBalanceConversionAmount(state, 'XLM');

    expect(executeTool).toHaveBeenCalledWith('get_saldo_tecnico', {
      session_id: '11111111-1111-4111-8111-111111111111',
      public_key: 'GTESTPUBLICKEY',
    });
    expect(resolved).toMatchObject({
      success: true,
      amount: '9998.3999600',
      availableBalance: '9999.9999600',
      keptReserve: '1.6000000',
    });
  });
});
