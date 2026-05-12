import { AgentGraph } from '../src/agent/graph';
import { ActionType, AgentState, IntentType } from '../src/agent/types';

describe('Agent payment link flow', () => {
  const createRepository = () => ({
    saveMessage: jest.fn().mockResolvedValue(undefined),
    saveState: jest.fn().mockResolvedValue(undefined),
  });

  const createState = (): AgentState => ({
    session_id: 'session-payment-link',
    session_data: {
      session_token: 'session-payment-link',
      user_id: 'user-payment-link',
      email: 'user@example.com',
      public_key: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    },
    messages: [],
    current_input: 'quero criar um link de pagto',
    detected_intent: IntentType.PAYMENT_LINK,
    action_type: ActionType.CREATE_PAYMENT_LINK,
    action_params: {},
    response_message: '',
    success: false,
  });

  it('asks for an amount instead of generating a zero-value payment link', async () => {
    const repository = createRepository();
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'test prompt');
    const state = createState();

    (graph as any).extractPaymentIntentWithLlm = jest.fn().mockResolvedValue({
      recipient_query: '',
      amount: '',
      asset_code: 'USDC',
      receive_asset_code: '',
      category: '',
      memo: '',
      is_payment_link: true,
      needs_clarification: false,
      clarification_question: '',
    });

    const result = await (graph as any).handlePayAnyoneLinkRequest(state);

    expect(result.success).toBe(false);
    expect(result.response_message).toContain('Não foi informado o valor');
    expect(result.response_message).toContain('Qual valor');
    expect(result.response_message).not.toContain('/pay-anyone');
    expect(repository.saveMessage).toHaveBeenCalledWith(
      state.session_id,
      'assistant',
      result.response_message
    );
    expect(repository.saveState).toHaveBeenCalledWith(state.session_id, result);
  });
});
