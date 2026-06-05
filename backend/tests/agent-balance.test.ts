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

  it('opens the secure balance screen without exposing values in chat', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'test prompt');
    const state = createState('');
    jest.spyOn(graph as any, 'buildBalanceUrl').mockResolvedValue('https://app.example/balance?lang=pt-BR');

    const result = await (graph as any).handleBalanceCheck(state);

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('Abra seu saldo aqui:');
    expect(result.response_message).toContain('https://app.example/balance?lang=pt-BR');
    expect(result.response_message).toContain('PIN');
    expect(result.response_message).not.toContain('12.3400000');
    expect(result.response_message).not.toContain('8.9000000');
  });

  it('does not call the raw balance tool for a chat balance request', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'test prompt');
    const state = createState('GTESTPUBLICKEY');
    jest.spyOn(graph as any, 'buildBalanceUrl').mockResolvedValue('https://app.example/balance?lang=pt-BR');

    const result = await (graph as any).handleBalanceCheck(state);

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.response_message).toContain('https://app.example/balance?lang=pt-BR');
    expect(result.response_message).not.toContain('Friendbot');
    expect(result.response_message).not.toContain('createAccountAlreadyExist');
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
