const mockShortenPublicUrl = jest.fn();
const mockResolveShortLink = jest.fn();

jest.mock('../src/api/services/core/external.service', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    shortenPublicUrl: mockShortenPublicUrl,
    resolveShortLink: mockResolveShortLink,
  })),
}));

jest.mock('../src/config/supabase', () => ({
  supabase: {},
}));

import { ShortLinkController } from '../src/api/controllers/short-link.controller';

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createRequest(body: Record<string, any>, headers: Record<string, string> = {}) {
  return {
    body,
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
});
