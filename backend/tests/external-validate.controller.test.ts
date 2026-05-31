import jwt from 'jsonwebtoken';

const validateSupabaseFromMock = jest.fn();
const validateGetSessionMock = jest.fn();
const validateFindByProviderAndIdMock = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: (...args: any[]) => validateSupabaseFromMock(...args),
  },
}));

jest.mock('../src/config/secrets', () => ({
  getRequiredJwtSecret: () => 'test-only-jwt-secret-with-enough-entropy',
}));

jest.mock('../src/api/repository/core/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    getSession: validateGetSessionMock,
  })),
}));

jest.mock('../src/api/repository/core/external.repository', () => ({
  normalizeExternalProvider: jest.fn((provider: string) => String(provider || '').trim().toLowerCase()),
  normalizeExternalProviderUserId: jest.fn((provider: string, providerUserId: string) => {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    const raw = String(providerUserId || '').trim();
    return ['whatsapp', 'phone'].includes(normalizedProvider) ? raw.replace(/\D+/g, '') : raw;
  }),
  ExternalRepository: jest.fn().mockImplementation(() => ({
    findByProviderAndId: validateFindByProviderAndIdMock,
  })),
}));

function createOnboardingStateChain(data: any = null, error: any = null) {
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn(async () => ({ data, error }));
  return chain;
}

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function signExternalToken(payload: Record<string, any>) {
  return jwt.sign(
    {
      sub: 'external_onboard',
      ...payload,
    },
    'test-only-jwt-secret-with-enough-entropy',
    { expiresIn: '1h' },
  );
}

describe('ExternalValidateController', () => {
  beforeEach(() => {
    validateSupabaseFromMock.mockReset();
    validateGetSessionMock.mockReset();
    validateFindByProviderAndIdMock.mockReset();
    validateSupabaseFromMock.mockReturnValue(createOnboardingStateChain(null));
    validateFindByProviderAndIdMock.mockResolvedValue(null);
  });

  it('resolves the linked email for WhatsApp login links so the UI can ask only for PIN', async () => {
    validateFindByProviderAndIdMock.mockResolvedValue({
      provider: 'whatsapp',
      provider_user_id: '5519997621114',
      session_id: 'session-whatsapp',
      user_id: 'rodrigo@example.com',
    });
    validateGetSessionMock.mockResolvedValue({
      session_id: 'session-whatsapp',
      user_id: 'rodrigo@example.com',
      email: 'rodrigo@example.com',
    });

    const token = signExternalToken({
      provider: 'whatsapp',
      provider_user_id: '+55 19 99762-1114',
    });
    const req = { query: { token }, body: {} } as any;
    const res = createResponse();

    const ExternalValidateController = (await import('../src/api/controllers/external-validate.controller')).default;
    await ExternalValidateController.validate(req, res);

    expect(validateFindByProviderAndIdMock).toHaveBeenCalledWith('whatsapp', '5519997621114');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      valid: true,
      pinOnly: true,
      email: 'rodrigo@example.com',
      resolvedLogin: 'rodrigo@example.com',
    }));
  });

  it('resolves WhatsApp PIN-only login from legacy mapping data email when session fields are missing', async () => {
    validateFindByProviderAndIdMock.mockResolvedValue({
      provider: 'whatsapp',
      provider_user_id: '5519997624114',
      session_id: null,
      user_id: null,
      data: {
        email: 'rodrigo@example.com',
        remote_jid: '5519997624114@s.whatsapp.net',
      },
    });

    const token = signExternalToken({
      provider: 'whatsapp',
      provider_user_id: '+55 19 99762-4114',
    });
    const req = { query: { token }, body: {} } as any;
    const res = createResponse();

    const ExternalValidateController = (await import('../src/api/controllers/external-validate.controller')).default;
    await ExternalValidateController.validate(req, res);

    expect(validateFindByProviderAndIdMock).toHaveBeenCalledWith('whatsapp', '5519997624114');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      valid: true,
      pinOnly: true,
      email: 'rodrigo@example.com',
      resolvedLogin: 'rodrigo@example.com',
    }));
  });

  it('resolves the linked email from Telegram token session context', async () => {
    validateGetSessionMock.mockResolvedValue({
      session_id: 'session-telegram',
      user_id: 'telegram-user@example.com',
      email: 'telegram-user@example.com',
    });

    const token = signExternalToken({
      provider: 'telegram',
      provider_user_id: '6405034913',
      session_id: 'session-telegram',
      user_id: 'telegram-user@example.com',
    });
    const req = { query: { token }, body: {} } as any;
    const res = createResponse();

    const ExternalValidateController = (await import('../src/api/controllers/external-validate.controller')).default;
    await ExternalValidateController.validate(req, res);

    expect(validateGetSessionMock).toHaveBeenCalledWith('session-telegram');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      valid: true,
      pinOnly: true,
      email: 'telegram-user@example.com',
      resolvedLogin: 'telegram-user@example.com',
    }));
  });
});
