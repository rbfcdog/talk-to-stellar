const checkExternalAccountMock = jest.fn();
const createOnboardUrlMock = jest.fn();
const createLoginUrlMock = jest.fn();
const getWalletBySessionMock = jest.fn();
const getSessionMock = jest.fn();
const getUserPasskeysMock = jest.fn();
const createExternalMappingMock = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {},
}));

jest.mock('../src/api/services/core/external.service', () => ({
  __esModule: true,
	  default: jest.fn().mockImplementation(() => ({
	    checkExternalAccount: checkExternalAccountMock,
	    createOnboardUrl: createOnboardUrlMock,
	    createOnboardUrlWithShortLink: createOnboardUrlMock,
	    createLoginUrlWithShortLink: createLoginUrlMock,
	  })),
	}));

jest.mock('../src/api/repository/core/wallet.repository', () => ({
  WalletRepository: jest.fn().mockImplementation(() => ({
    getWalletBySession: getWalletBySessionMock,
  })),
}));

jest.mock('../src/api/repository/core/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    getSession: getSessionMock,
  })),
}));

jest.mock('../src/api/repository/core/external.repository', () => ({
  normalizeExternalProvider: jest.fn((provider: string) => String(provider || '').trim().toLowerCase()),
  normalizeExternalProviderUserId: jest.fn((provider: string, providerUserId: string) => {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    const raw = String(providerUserId || '').trim();
    return ['whatsapp', 'phone'].includes(normalizedProvider) ? raw.replace(/\D+/g, '') : raw;
  }),
  externalProviderAliases: jest.fn((provider: string) => {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    return ['whatsapp', 'phone'].includes(normalizedProvider) ? ['whatsapp', 'phone'] : [normalizedProvider];
  }),
  isPhoneProvider: jest.fn((provider: string) => ['whatsapp', 'phone'].includes(String(provider || '').trim().toLowerCase())),
  ExternalRepository: jest.fn().mockImplementation(() => ({
    createMapping: createExternalMappingMock,
    findByProviderAndId: jest.fn(async () => null),
  })),
}));

jest.mock('../src/api/services/core/passkey.service', () => ({
  __esModule: true,
  default: {
    getUserPasskeys: getUserPasskeysMock,
  },
}));

describe('ExternalController', () => {
  beforeEach(() => {
    checkExternalAccountMock.mockReset();
    createOnboardUrlMock.mockReset();
    createLoginUrlMock.mockReset();
    getWalletBySessionMock.mockReset();
    getSessionMock.mockReset();
    getUserPasskeysMock.mockReset();
    createExternalMappingMock.mockReset();
    createExternalMappingMock.mockResolvedValue({});
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
    expect(createOnboardUrlMock).toHaveBeenCalledWith('telegram', '555', expect.objectContaining({
      source: 'telegram',
    }));
    expect(createLoginUrlMock).not.toHaveBeenCalled();
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
    expect(createLoginUrlMock).not.toHaveBeenCalled();
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
    expect(createLoginUrlMock).not.toHaveBeenCalled();
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

  it('does not write a generic phone alias during WhatsApp login discovery', async () => {
    checkExternalAccountMock.mockResolvedValue({
      session_id: 'session-123',
      user_id: 'rodrigo@example.com',
      data: { source: 'whatsapp' },
    });
    getWalletBySessionMock.mockResolvedValue({
      session_id: 'session-123',
      public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    });
    getSessionMock.mockResolvedValue({
      session_id: 'session-123',
      user_id: 'rodrigo@example.com',
      email: 'rodrigo@example.com',
      password_hash: 'hashed-pin',
      last_activity: new Date().toISOString(),
    });
    createExternalMappingMock
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "idx_external_accounts_data_phone_unique"'))
      .mockResolvedValue({});

    const { ExternalController } = await import('../src/api/controllers/external.controller');
    const req = {
      body: {
        provider: 'whatsapp',
        provider_user_id: '+55 19 99762-1114',
        phone_number: '+55 19 99762-1114',
      },
    } as any;
    const res = createResponse();

    await ExternalController.checkAccount(req, res);

    expect(createExternalMappingMock).toHaveBeenCalledTimes(2);
    expect(createExternalMappingMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      provider: 'whatsapp',
      data: expect.objectContaining({ phone_number: '5519997621114' }),
    }));
    expect(createExternalMappingMock.mock.calls[1][0]).toEqual(expect.objectContaining({
      provider: 'whatsapp',
      data: expect.not.objectContaining({ phone_number: expect.anything() }),
    }));
    expect(createExternalMappingMock).not.toHaveBeenCalledWith(expect.objectContaining({ provider: 'phone' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      exists: true,
      sessionId: 'session-123',
      userId: 'rodrigo@example.com',
    }));
  });
});

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
