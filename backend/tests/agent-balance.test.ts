import { AgentGraph } from '../src/agent/graph';
import { ActionType, AgentState, IntentType } from '../src/agent/types';
import { executeTool } from '../src/agent/tools';

jest.mock('../src/agent/tools', () => ({
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
    expect(result.response_message).toContain('BRL: 12.3400000');
    expect(result.response_message).toContain('USDC: 8.9000000');
  });
});
