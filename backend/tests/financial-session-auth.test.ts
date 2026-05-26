const mockGetSession = jest.fn();
const mockGetPrimaryWallet = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {},
}));

jest.mock('../src/api/repository/core/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    getSession: mockGetSession,
  })),
}));

jest.mock('../src/api/services/mainnet-wallet.service', () => ({
  mainnetWalletService: {
    getStatus: jest.fn(() => ({ success: true })),
    getPrimaryWallet: mockGetPrimaryWallet,
  },
}));

import { FinancialController } from '../src/api/controllers/financial.controller';

describe('Financial controller session auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts session id and token forwarded in headers for GET account calls', async () => {
    const sessionId = '11111111-1111-4111-8111-111111111111';
    mockGetSession.mockResolvedValue({
      user_id: 'user@example.com',
      session_token: 'valid-token',
      last_activity: new Date().toISOString(),
    });
    mockGetPrimaryWallet.mockResolvedValue({
      public_key: 'G'.padEnd(56, 'A'),
    });

    const json = jest.fn();
    const status = jest.fn(() => ({ json }));

    await FinancialController.getMainnetWallet(
      {
        headers: {
          'x-session-id': sessionId,
          'x-session-token': 'valid-token',
        },
        body: {},
        query: {},
        params: {},
      } as any,
      { status } as any
    );

    expect(status).toHaveBeenCalledWith(200);
    expect(mockGetSession).toHaveBeenCalledWith(sessionId);
    expect(mockGetPrimaryWallet).toHaveBeenCalledWith(sessionId, 'user@example.com');
    expect(json.mock.calls[0][0]).toMatchObject({
      success: true,
      configured: true,
      wallet: { public_key: 'G'.padEnd(56, 'A') },
    });
  });
});
