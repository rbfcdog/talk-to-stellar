import { EmailConfirmationService } from '../src/api/services/email-confirmation.service';
import { supabase } from '../src/config/supabase';

describe('EmailConfirmationService', () => {
  const originalEnv = { ...process.env };
  const fetchMock = jest.fn();
  const defaultSupabaseFrom = (supabase.from as jest.Mock).getMockImplementation();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as any;

    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-only-jwt-secret-with-enough-entropy';
    delete process.env.EMAIL_CONFIRMATION_ENABLED;
    delete process.env.ENABLE_EMAIL_CONFIRMATION;
    delete process.env.REQUIRE_EMAIL_CONFIRMATION;
    delete process.env.EMAIL_CONFIRMATION_PROVIDER;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.EMAIL_CONFIRMATION_WEBHOOK_URL;
    delete process.env.EMAIL_WEBHOOK_URL;
    delete process.env.AWS_SES_REGION;
    delete process.env.SES_REGION;
    delete process.env.AWS_SES_ACCESS_KEY_ID;
    delete process.env.AWS_SES_SECRET_ACCESS_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;
    delete process.env.AWS_SES_SESSION_TOKEN;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    process.env.EMAIL_CONFIRMATION_ALLOW_DEV_CODE = 'false';
    process.env.EMAIL_CONFIRMATION_COOLDOWN_SECONDS = '0';
    process.env.EMAIL_FROM = 'TalkToStellar <no-reply@talktostellar.com>';
    (supabase.from as jest.Mock).mockImplementation(defaultSupabaseFrom as any);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('stays disabled by default in tests', async () => {
    const result = await EmailConfirmationService.requireVerified({
      email: 'User@Test.com',
      purpose: 'login',
      language: 'pt-BR',
    });

    expect(result).toMatchObject({
      verified: true,
      email: 'user@test.com',
      maskedEmail: 'u**r@test.com',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends confirmation codes through Resend when enabled', async () => {
    process.env.EMAIL_CONFIRMATION_ENABLED = 'true';
    process.env.RESEND_API_KEY = 're_test_key';
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    const result = await EmailConfirmationService.requireVerified({
      email: 'User@Test.com',
      purpose: 'create_account',
      language: 'pt-BR',
      metadata: { provider: 'whatsapp' },
    });

    expect(result.verified).toBe(false);
    expect(result.email).toBe('user@test.com');
    expect(result.maskedEmail).toBe('u**r@test.com');
    expect(result.devCode).toMatch(/^\d{6}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer re_test_key');
    const body = JSON.parse(init.body);
    expect(body.from).toBe('TalkToStellar <no-reply@talktostellar.com>');
    expect(body.to).toEqual(['user@test.com']);
    expect(body.subject).toContain('TalkToStellar');
    expect(body.text).toContain(result.devCode);
  });

  it('sends confirmation codes through AWS SES v2 in sa-east-1', async () => {
    process.env.EMAIL_CONFIRMATION_ENABLED = 'true';
    process.env.EMAIL_CONFIRMATION_PROVIDER = 'ses';
    process.env.AWS_SES_REGION = 'sa-east-1';
    process.env.AWS_SES_ACCESS_KEY_ID = 'AKIATEST';
    process.env.AWS_SES_SECRET_ACCESS_KEY = 'test-secret';
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    const result = await EmailConfirmationService.requireVerified({
      email: 'user@test.com',
      purpose: 'login',
      language: 'en',
    });

    expect(result.verified).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://email.sa-east-1.amazonaws.com/v2/email/outbound-emails');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toContain('AWS4-HMAC-SHA256 Credential=AKIATEST/');
    expect(init.headers.authorization).toContain('/sa-east-1/ses/aws4_request');
    expect(init.headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);

    const body = JSON.parse(init.body);
    expect(body.FromEmailAddress).toBe('TalkToStellar <no-reply@talktostellar.com>');
    expect(body.Destination.ToAddresses).toEqual(['user@test.com']);
    expect(body.Content.Simple.Body.Text.Data).toContain(result.devCode);
  });

  it('treats pre-cutoff sessions as already verified legacy accounts', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      expect(table).toBe('agent_sessions');
      return createSupabaseSelectChain([
        {
          session_id: 'legacy-session',
          user_id: 'legacy@example.com',
          email: 'legacy@example.com',
          email_verified: false,
          email_verification_source: null,
          created_at: '2026-06-01T12:00:00Z',
          updated_at: '2026-06-01T12:00:00Z',
        },
      ]);
    });

    await expect(EmailConfirmationService.isAccountEmailVerified({
      email: 'legacy@example.com',
      sessionId: 'legacy-session',
      userId: 'legacy@example.com',
    })).resolves.toBe(true);
  });

  it('treats legacy backfill source as verified even when the row was updated later', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      expect(table).toBe('agent_sessions');
      return createSupabaseSelectChain([
        {
          session_id: 'legacy-session',
          user_id: 'legacy@example.com',
          email: 'legacy@example.com',
          email_verified: false,
          email_verification_source: 'legacy_backfill_20260602_external_channel',
          created_at: '2026-06-02T16:50:00Z',
          updated_at: '2026-06-02T16:50:00Z',
        },
      ]);
    });

    await expect(EmailConfirmationService.isAccountEmailVerified({
      email: 'legacy@example.com',
      sessionId: 'legacy-session',
      userId: 'legacy@example.com',
    })).resolves.toBe(true);
  });

  it('fails closed in production-like environments when no provider is configured', async () => {
    process.env.NODE_ENV = 'production';
    process.env.EMAIL_CONFIRMATION_ENABLED = 'true';
    process.env.EMAIL_CONFIRMATION_ALLOW_DEV_CODE = 'false';

    await expect(EmailConfirmationService.requireVerified({
      email: 'user@test.com',
      purpose: 'login',
      language: 'en',
    })).rejects.toMatchObject({
      code: 'EMAIL_PROVIDER_MISSING',
      statusCode: 500,
    });
  });
});

function createSupabaseSelectChain(rows: any[]) {
  const builder: any = {};
  const chain = () => builder;
  ['select', 'eq', 'order', 'limit'].forEach((method) => {
    builder[method] = jest.fn(chain);
  });
  builder.then = (onFulfilled: any, onRejected: any) => (
    Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected)
  );
  return builder;
}
