import jwt from 'jsonwebtoken';
import { ExternalService } from '../src/api/services/core/external.service';

describe('External onboarding service', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-only-jwt-secret-with-enough-entropy';
    process.env.CREATE_ACCOUNT_BASE = 'https://app.example.com';
  });

  it('creates a 24-hour onboarding token and dynamic creation URL', () => {
    const service = new ExternalService({} as any);
    const { token, url } = service.createOnboardUrl('telegram', '123456');

    const parsedUrl = new URL(url);
    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe('https://app.example.com/create-account');
    expect(parsedUrl.searchParams.get('token')).toBe(token);
    expect(parsedUrl.searchParams.get('provider')).toBe('telegram');
    expect(parsedUrl.searchParams.get('provider_user_id')).toBe('123456');
    expect(parsedUrl.searchParams.get('source')).toBe('telegram');

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

  it('creates Telegram login URL with session context and next path', () => {
    process.env.PAYMENT_CONFIRM_BASE = 'https://app.example.com';
    const service = new ExternalService({} as any);
    const { token, url } = service.createLoginUrl('telegram', '6405034913', {
      sessionId: 'session-123',
      userId: 'rodrigo@example.com',
      next_path: '/pix-on?amount=100&asset=BRL',
    });

    const parsedUrl = new URL(url);
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;

    expect(`${parsedUrl.origin}${parsedUrl.pathname}`).toBe('https://app.example.com/login');
    expect(parsedUrl.searchParams.get('token')).toBe(token);
    expect(parsedUrl.searchParams.get('provider')).toBe('telegram');
    expect(parsedUrl.searchParams.get('provider_user_id')).toBe('6405034913');
    expect(parsedUrl.searchParams.get('next')).toBe('/pix-on?amount=100&asset=BRL');
    expect(decoded?.session_id).toBe('session-123');
    expect(decoded?.sessionId).toBe('session-123');
    expect(decoded?.user_id).toBe('rodrigo@example.com');
    expect(decoded?.userId).toBe('rodrigo@example.com');
  });

  it('adds language preference to login and onboarding URLs', () => {
    process.env.PAYMENT_CONFIRM_BASE = 'https://app.example.com';
    process.env.CREATE_ACCOUNT_BASE = 'https://app.example.com';
    const service = new ExternalService({} as any);

    const login = service.createLoginUrl('telegram', '6405034913', { language: 'en' });
    const onboard = service.createOnboardUrl('telegram', '6405034913', { language: 'en' });

    expect(new URL(login.url).searchParams.get('lang')).toBe('en');
    expect(new URL(onboard.url).searchParams.get('lang')).toBe('en');
    expect((jwt.decode(login.token) as jwt.JwtPayload | null)?.language).toBe('en');
    expect((jwt.decode(onboard.token) as jwt.JwtPayload | null)?.language).toBe('en');
  });
});
