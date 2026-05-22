jest.mock('../src/agent/tools', () => ({
  ALL_TOOLS: [],
  executeTool: jest.fn(),
}));

jest.mock('../src/config/supabase', () => ({
  supabase: {},
}));

import { AgentGraph } from '../src/agent/graph';
import { executeTool } from '../src/agent/tools';
import { ActionType, IntentType } from '../src/agent/types';

const executeToolMock = executeTool as jest.Mock;

describe('Agent conversion UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not expose routing internals when a conversion quote fails', async () => {
    const repository = {
      saveMessage: jest.fn().mockResolvedValue(undefined),
      saveState: jest.fn().mockResolvedValue(undefined),
    };
    const graph = new AgentGraph(repository as any, 'test-openai-key', 'system prompt') as any;
    graph.extractConversionIntentWithLlm = jest.fn().mockResolvedValue({
      sourceAmount: '5',
      sourceAssetCode: 'USDC',
      destAssetCode: 'BRL',
      needs_clarification: false,
      clarification_question: '',
    });
    graph.resolveWalletAssetIssuer = jest
      .fn()
      .mockResolvedValueOnce('GUSDC')
      .mockResolvedValueOnce('GBRL');

    executeToolMock.mockResolvedValue(JSON.stringify({
      success: false,
      error: 'Não foi encontrado caminho de conversão entre USDC e BRL. source_issuer=GUSDC; dest_issuer=GBRL. Sem rota de liquidez | Confirme trustline.',
    }));

    const result = await graph.handleAssetConversion({
      session_id: 'session-1',
      session_data: {
        user_id: 'user-1',
        public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
      messages: [],
      current_input: 'converter 5 dólares para reais',
      detected_intent: IntentType.CONVERSION,
      action_type: ActionType.CONVERT_ASSETS,
      action_params: {},
      response_message: '',
      success: false,
    });

    expect(result.success).toBe(false);
    expect(result.response_message).toContain('rota segura');
    expect(result.response_message).not.toContain('source_issuer');
    expect(result.response_message).not.toContain('dest_issuer');
    expect(result.response_message).not.toMatch(/trustline|liquidez|XLM|Horizon|XDR/i);
    expect(repository.saveMessage).toHaveBeenCalledWith('session-1', 'assistant', result.response_message);
  });
});
