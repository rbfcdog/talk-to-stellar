const checkExternalAccountMock = jest.fn();
const createOnboardUrlMock = jest.fn();
const getWalletBySessionMock = jest.fn();
const getSessionMock = jest.fn();
const getUserPasskeysMock = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {},
}));

jest.mock('../src/services/external.service', () => ({
  __esModule: true,
	  default: jest.fn().mockImplementation(() => ({
	    checkExternalAccount: checkExternalAccountMock,
	    createOnboardUrl: createOnboardUrlMock,
	    createOnboardUrlWithShortLink: createOnboardUrlMock,
	  })),
	}));

jest.mock('../src/repositories/wallet.repository', () => ({
  WalletRepository: jest.fn().mockImplementation(() => ({
    getWalletBySession: getWalletBySessionMock,
  })),
}));

jest.mock('../src/repositories/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    getSession: getSessionMock,
  })),
}));

jest.mock('../src/services/passkey.service', () => ({
  __esModule: true,
  default: {
    getUserPasskeys: getUserPasskeysMock,
  },
}));

describe('ExternalController', () => {
  beforeEach(() => {
    checkExternalAccountMock.mockReset();
    createOnboardUrlMock.mockReset();
    getWalletBySessionMock.mockReset();
    getSessionMock.mockReset();
    getUserPasskeysMock.mockReset();
  });

  it('returns onboarding URL when external mapping exists but wallet is missing', async () => {
    checkExternalAccountMock.mockResolvedValue({
      session_id: 'session-123',
      user_id: 'user-123',
      data: { source: 'telegram' },
    });
    getWalletBySessionMock.mockResolvedValue(null);
    createOnboardUrlMock.mockReturnValue({
      token: 'jwt-token',
      url: 'https://app.example.com/create-account?token=jwt-token',
    });

    const { ExternalController } = await import('../src/api/controllers/external.controller');
    const req = {
      body: {
        provider: 'telegram',
        provider_user_id: '555',
      },
    } as any;
    const res = createResponse();

    await ExternalController.checkAccount(req, res);

    expect(checkExternalAccountMock).toHaveBeenCalledWith('telegram', '555');
    expect(getWalletBySessionMock).toHaveBeenCalledWith('session-123');
	    expect(createOnboardUrlMock).toHaveBeenCalledWith('telegram', '555', {});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        exists: false,
        creationUrl: 'https://app.example.com/create-account?token=jwt-token',
      })
    );
  });

  it('returns onboarding URL when external_accounts table is missing', async () => {
    checkExternalAccountMock.mockRejectedValue(
      new Error("Could not find the table 'public.external_accounts' in the schema cache")
    );
    createOnboardUrlMock.mockReturnValue({
      token: 'jwt-token',
      url: 'https://app.example.com/create-account?token=jwt-token',
    });

    const { ExternalController } = await import('../src/api/controllers/external.controller');
    const req = {
      body: {
        provider: 'telegram',
        provider_user_id: '555',
      },
    } as any;
    const res = createResponse();

    await ExternalController.checkAccount(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        exists: false,
        creationUrl: 'https://app.example.com/create-account?token=jwt-token',
      })
    );
  });

  it('returns onboarding URL when the linked account has no password or passkey', async () => {
    checkExternalAccountMock.mockResolvedValue({
      session_id: 'session-123',
      user_id: 'user-123',
      data: { source: 'telegram' },
    });
    getWalletBySessionMock.mockResolvedValue({
      session_id: 'session-123',
      public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });
    getSessionMock.mockResolvedValue({
      session_id: 'session-123',
      user_id: 'user-123',
      password_hash: null,
      last_activity: new Date().toISOString(),
    });
    getUserPasskeysMock.mockResolvedValue([]);
    createOnboardUrlMock.mockReturnValue({
      token: 'jwt-token',
      url: 'https://app.example.com/create-account?token=jwt-token',
    });

    const { ExternalController } = await import('../src/api/controllers/external.controller');
    const req = {
      body: {
        provider: 'telegram',
        provider_user_id: '555',
      },
    } as any;
    const res = createResponse();

    await ExternalController.checkAccount(req, res);

    expect(getSessionMock).toHaveBeenCalledWith('session-123');
    expect(getUserPasskeysMock).toHaveBeenCalledWith('user-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        exists: false,
        onboardingRequired: true,
        reason: 'missing_credentials',
        creationUrl: 'https://app.example.com/create-account?token=jwt-token',
      })
    );
  });
});

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
