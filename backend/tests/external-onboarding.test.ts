import jwt from 'jsonwebtoken';
import { ExternalService } from '../src/services/external.service';

describe('External onboarding service', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.CREATE_ACCOUNT_BASE = 'https://app.example.com';
  });

  it('creates a 24-hour onboarding token and dynamic creation URL', () => {
    const service = new ExternalService({} as any);
    const { token, url } = service.createOnboardUrl('telegram', '123456');

    expect(url).toBe('https://app.example.com/create-account?token=' + encodeURIComponent(token));

    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    expect(decoded).toBeTruthy();
    expect(decoded?.provider).toBe('telegram');
    expect(decoded?.provider_user_id).toBe('123456');
    expect(typeof decoded?.exp).toBe('number');
    expect(typeof decoded?.iat).toBe('number');
    expect((decoded!.exp as number) - (decoded!.iat as number)).toBe(60 * 60 * 24);
  });

  it('defaults to the local frontend base url when env is missing', () => {
    const previousCreateAccountBase = process.env.CREATE_ACCOUNT_BASE;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    delete process.env.CREATE_ACCOUNT_BASE;
    delete process.env.FRONTEND_URL;

    const service = new ExternalService({} as any);
    const { url } = service.createOnboardUrl('telegram', '123456');

    expect(url.startsWith('http://localhost:3000/create-account?token=')).toBe(true);

    process.env.CREATE_ACCOUNT_BASE = previousCreateAccountBase;
    process.env.FRONTEND_URL = previousFrontendUrl;
  });
});
