const mockShortenPublicUrl = jest.fn();
const mockResolveShortLink = jest.fn();
const mockResolveShortLinkRecord = jest.fn();
const mockExpireShortLink = jest.fn();
const mockSupabase = {
  from: jest.fn(),
};

jest.mock('../src/api/services/core/external.service', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    shortenPublicUrl: mockShortenPublicUrl,
    resolveShortLink: mockResolveShortLink,
    resolveShortLinkRecord: mockResolveShortLinkRecord,
    expireShortLink: mockExpireShortLink,
  })),
}));

jest.mock('../src/config/supabase', () => ({
  supabase: mockSupabase,
}));

import { ShortLinkController } from '../src/api/controllers/short-link.controller';

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(body: Record<string, any>, headers: Record<string, string> = {}, params: Record<string, string> = {}, query: Record<string, string> = {}) {
  return {
    body,
    params,
    query,
    get(name: string) {
      return headers[name.toLowerCase()] || headers[name] || '';
    },
  } as any;
}

describe('ShortLinkController security validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShortenPublicUrl.mockResolvedValue('https://app.example.com/r/abc123');
    mockResolveShortLinkRecord.mockReset();
    mockExpireShortLink.mockReset();
    mockSupabase.from.mockReset();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      PUBLIC_APP_URL: 'https://app.example.com',
      INTERNAL_API_SECRET: '',
      SHORT_LINK_PROXY_SECRET: '',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects arbitrary external redirect targets', async () => {
    const req = createRequest({
      url: 'https://evil.example/login?token=steal',
      purpose: 'login_passkey_qr',
    });
    const res = createResponse();

    await ShortLinkController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockShortenPublicUrl).not.toHaveBeenCalled();
  });

  it('allows a trusted frontend proxy to shorten same-origin passkey URLs', async () => {
    process.env.PUBLIC_APP_URL = '';
    process.env.INTERNAL_API_SECRET = 'internal-secret-value';
    const req = createRequest(
      {
        url: 'https://frontend.example.com/login?token=abc',
        purpose: 'login_passkey_qr',
        expires_in_hours: 6,
      },
      {
        'x-internal-api-secret': 'internal-secret-value',
        'x-frontend-origin': 'https://frontend.example.com',
      }
    );
    const res = createResponse();

    await ShortLinkController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockShortenPublicUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://frontend.example.com/login?token=abc',
      purpose: 'login_passkey_qr',
      expiresInHours: 6,
    }));
  });

  it('rejects unsupported public short-link purposes', async () => {
    const req = createRequest({
      url: 'https://app.example.com/login?token=abc',
      purpose: 'open_redirect',
    });
    const res = createResponse();

    await ShortLinkController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockShortenPublicUrl).not.toHaveBeenCalled();
  });

  it('reattaches and refreshes expired WhatsApp sessions for trusted short-link handoff', async () => {
    process.env.INTERNAL_API_SECRET = 'internal-secret-value';
    mockResolveShortLinkRecord.mockResolvedValue({
      url: 'https://app.example.com/rendimentos?source=chat&session_scope=whatsapp',
      purpose: 'rendimentos',
      session_id: 'session-1',
      user_id: 'user-1',
    });

    const maybeSingle = jest.fn().mockResolvedValue({
      data: {
        session_id: 'session-1',
        session_token: 'token-1',
        user_id: 'user-1',
        last_activity: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-01-01T00:00:00.000Z',
        created_at: '2020-01-01T00:00:00.000Z',
      },
      error: null,
    });
    const sessionEq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq: sessionEq }));
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq: updateEq }));
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'agent_sessions') return { select, update };
      if (table === 'external_accounts') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              in: jest.fn(() => ({
                order: jest.fn(() => ({
                  limit: jest.fn().mockResolvedValue({
                    data: [{ provider: 'whatsapp' }],
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }
      return { select: jest.fn(), update: jest.fn() };
    });

    const req = createRequest(
      {},
      { 'x-internal-api-secret': 'internal-secret-value' },
      { code: 'abc123' },
      { include_session: '1' }
    );
    const res = createResponse();

    await ShortLinkController.resolve(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      url: 'https://app.example.com/rendimentos?source=chat&session_scope=whatsapp',
      session_id: 'session-1',
      session_token: 'token-1',
      session_source: 'whatsapp',
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      last_activity: expect.any(String),
      updated_at: expect.any(String),
    }));
    expect(updateEq).toHaveBeenCalledWith('session_id', 'session-1');
  });

  it('expires a short link when the frontend consumes it after completion', async () => {
    mockResolveShortLinkRecord.mockResolvedValue({
      url: 'https://app.example.com/pix-ramp?short_link_code=abc123',
      purpose: 'pix_onramp',
      session_id: 'session-1',
      user_id: 'user-1',
    });
    mockExpireShortLink.mockResolvedValue(true);
    const req = createRequest({ session_id: 'session-1' }, {}, { code: 'abc123' });
    const res = createResponse();

    await ShortLinkController.consume(req, res);

    expect(mockExpireShortLink).toHaveBeenCalledWith('abc123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Link marcado como usado.',
    }));
  });

  it('rejects consume attempts from a different session', async () => {
    mockResolveShortLinkRecord.mockResolvedValue({
      url: 'https://app.example.com/pix-ramp?short_link_code=abc123',
      purpose: 'pix_onramp',
      session_id: 'session-1',
      user_id: 'user-1',
    });
    const req = createRequest({ session_id: 'session-2' }, {}, { code: 'abc123' });
    const res = createResponse();

    await ShortLinkController.consume(req, res);

    expect(mockExpireShortLink).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('does not resolve an already expired or consumed short link', async () => {
    mockResolveShortLinkRecord.mockResolvedValue(null);
    const req = createRequest({}, {}, { code: 'used-link' });
    const res = createResponse();

    await ShortLinkController.resolve(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Link não encontrado ou expirado.',
    }));
  });
});
