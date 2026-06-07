import { PinResetController } from '../src/api/controllers/pin-reset.controller';
import { PinResetService } from '../src/api/services/core/pin-reset.service';
import { supabase } from '../src/config/supabase';
import jwt from 'jsonwebtoken';

function mockResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockSessionRow(session: Record<string, unknown> | null) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: session, error: null });
  (supabase.from as jest.Mock).mockReturnValue(chain);
}

function mockLatestSessionRow(session: Record<string, unknown> | null) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: session, error: null });
  (supabase.from as jest.Mock).mockReturnValue(chain);
}

function createQueryChain(result: any) {
  const chain: any = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe('PinResetController security', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.INTERNAL_API_SECRET = 'internal-secret';
    jest.clearAllMocks();
    jest.spyOn(PinResetService, 'generateResetToken').mockResolvedValue({
      token: 'raw-reset-token',
      reset_url: 'http://localhost:3000/change-pin?token=raw-reset-token&user_id=user-1',
      expires_in_minutes: 15,
      email_sent: true,
      masked_email: 'u**r@example.com',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('does not initiate PIN reset without session token or internal authorization', async () => {
    mockSessionRow({
      session_id: '11111111-1111-4111-8111-111111111111',
      user_id: 'user-1',
      email: 'user@example.com',
      session_token: 'valid-session-token',
      last_activity: new Date().toISOString(),
    });

    const req: any = {
      body: {
        session_id: '11111111-1111-4111-8111-111111111111',
        user_id: 'user-1',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.initiatePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(PinResetService.generateResetToken).not.toHaveBeenCalled();
  });

  it('initiates PIN reset with a valid session token but never returns the raw token field', async () => {
    mockSessionRow({
      session_id: '11111111-1111-4111-8111-111111111111',
      user_id: 'user-1',
      email: 'user@example.com',
      session_token: 'valid-session-token',
      last_activity: new Date().toISOString(),
    });

    const req: any = {
      body: {
        session_id: '11111111-1111-4111-8111-111111111111',
        user_id: 'user-1',
        session_token: 'valid-session-token',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.initiatePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(PinResetService.generateResetToken).toHaveBeenCalledWith(
      'user-1',
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        email: 'user@example.com',
        language: 'pt-BR',
      })
    );
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.reset_url).toContain('/change-pin');
    expect(payload.email_sent).toBe(true);
    expect(payload.masked_email).toBe('u**r@example.com');
    expect(payload).not.toHaveProperty('token');
  });

  it('rejects reset attempts for a different user identity than the authenticated session', async () => {
    mockSessionRow({
      session_id: '11111111-1111-4111-8111-111111111111',
      user_id: 'user-1',
      email: 'user@example.com',
      session_token: 'valid-session-token',
      last_activity: new Date().toISOString(),
    });

    const req: any = {
      body: {
        session_id: '11111111-1111-4111-8111-111111111111',
        user_id: 'attacker',
        session_token: 'valid-session-token',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.initiatePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(PinResetService.generateResetToken).not.toHaveBeenCalled();
  });

  it('initiates login recovery by email without returning a reset URL', async () => {
    mockLatestSessionRow({
      session_id: '22222222-2222-4222-8222-222222222222',
      user_id: 'user@example.com',
      email: 'user@example.com',
      session_token: 'stale-session-token',
      last_activity: '2024-01-01T00:00:00.000Z',
    });

    const req: any = {
      body: {
        forgot_pin: true,
        login_recovery: true,
        email: 'user@example.com',
        language: 'en',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.initiatePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(PinResetService.generateResetToken).toHaveBeenCalledWith(
      'user@example.com',
      '22222222-2222-4222-8222-222222222222',
      expect.objectContaining({
        email: 'user@example.com',
        language: 'en',
      })
    );
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.message).toContain('If this account exists');
    expect(payload.masked_email).toBe('u**r@example.com');
    expect(payload).not.toHaveProperty('reset_url');
    expect(payload).not.toHaveProperty('token');
  });

  it('returns a generic login recovery response when no account is found', async () => {
    mockLatestSessionRow(null);

    const req: any = {
      body: {
        forgot_pin: true,
        login_recovery: true,
        email: 'missing@example.com',
        language: 'en',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.initiatePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(PinResetService.generateResetToken).not.toHaveBeenCalled();
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.message).toBe('If this account exists, we sent the password and PIN setup link by email.');
    expect(payload).not.toHaveProperty('reset_url');
    expect(payload).not.toHaveProperty('token');
  });

  it('finalizes recovery with a separate login password and numeric PIN', async () => {
    jest.spyOn(PinResetService, 'applyNewPin').mockResolvedValue({
      success: true,
      message: 'PIN changed successfully',
    });

    const req: any = {
      body: {
        token: 'reset-token',
        user_id: 'user@example.com',
        new_password: 'new-password-123',
        new_pin: '1234',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.finalizePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(PinResetService.applyNewPin).toHaveBeenCalledWith(
      'reset-token',
      'user@example.com',
      expect.any(String),
      'new-password-123'
    );
  });

  it('rejects weak recovery login passwords before changing the PIN', async () => {
    jest.spyOn(PinResetService, 'applyNewPin').mockResolvedValue({
      success: true,
      message: 'PIN changed successfully',
    });

    const req: any = {
      body: {
        token: 'reset-token',
        user_id: 'user@example.com',
        new_password: 'short',
        new_pin: '1234',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.finalizePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Password must contain at least 8 characters.',
    }));
    expect(PinResetService.applyNewPin).not.toHaveBeenCalled();
  });

  it('rejects non-numeric recovery PIN values before changing credentials', async () => {
    jest.spyOn(PinResetService, 'applyNewPin').mockResolvedValue({
      success: true,
      message: 'PIN changed successfully',
    });

    const req: any = {
      body: {
        token: 'reset-token',
        user_id: 'user@example.com',
        new_password: 'new-password-123',
        new_pin: 'abcd',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.finalizePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'PIN must contain numbers only',
    }));
    expect(PinResetService.applyNewPin).not.toHaveBeenCalled();
  });

  it('can recover from an external login token that carries the linked session', async () => {
    const token = jwt.sign({
      sub: 'external_onboard',
      provider: 'whatsapp',
      provider_user_id: '5575496918127',
      session_id: '33333333-3333-4333-8333-333333333333',
    }, process.env.JWT_SECRET || 'test-only-jwt-secret-with-enough-entropy');
    mockSessionRow({
      session_id: '33333333-3333-4333-8333-333333333333',
      user_id: 'ana@example.com',
      email: 'ana@example.com',
      session_token: 'expired-session-token',
      last_activity: '2024-01-01T00:00:00.000Z',
    });

    const req: any = {
      body: {
        forgot_pin: true,
        login_recovery: true,
        token,
        provider: 'whatsapp',
        provider_user_id: '5575496918127',
        language: 'en',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.initiatePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(PinResetService.generateResetToken).toHaveBeenCalledWith(
      'ana@example.com',
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({
        email: 'ana@example.com',
        language: 'en',
      })
    );
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload).not.toHaveProperty('reset_url');
  });

  it('sends PIN setup email when the recovery email belongs to a users row and the session stores only user_id', async () => {
    let agentSessionLookup = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'agent_sessions') {
        return createQueryChain({
          data: ++agentSessionLookup === 3
            ? {
                session_id: '44444444-4444-4444-8444-444444444444',
                user_id: 'auth-user-id',
                email: '',
                session_token: 'stale-session-token',
                last_activity: '2024-01-01T00:00:00.000Z',
              }
            : null,
          error: null,
        });
      }
      if (table === 'external_accounts') {
        return createQueryChain({ data: [], error: null });
      }
      if (table === 'users') {
        return createQueryChain({
          data: { id: 'auth-user-id', email: 'other@example.com' },
          error: null,
        });
      }
      return createQueryChain({ data: null, error: null });
    });

    const req: any = {
      body: {
        forgot_pin: true,
        login_recovery: true,
        email: 'other@example.com',
        language: 'en',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.initiatePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(PinResetService.generateResetToken).toHaveBeenCalledWith(
      'auth-user-id',
      '44444444-4444-4444-8444-444444444444',
      expect.objectContaining({
        email: 'other@example.com',
        language: 'en',
      })
    );
  });

  it('sends PIN setup email when the recovery email is stored on external account data', async () => {
    let agentSessionLookup = 0;
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'agent_sessions') {
        return createQueryChain({
          data: ++agentSessionLookup === 3
            ? {
                session_id: '55555555-5555-4555-8555-555555555555',
                user_id: 'external-user-id',
                email: 'old@example.com',
                session_token: 'stale-session-token',
                last_activity: '2024-01-01T00:00:00.000Z',
              }
            : null,
          error: null,
        });
      }
      if (table === 'external_accounts') {
        return createQueryChain({
          data: [{
            session_id: '55555555-5555-4555-8555-555555555555',
            user_id: 'external-user-id',
            data: { email: 'mapped@example.com' },
          }],
          error: null,
        });
      }
      return createQueryChain({ data: null, error: null });
    });

    const req: any = {
      body: {
        forgot_pin: true,
        login_recovery: true,
        email: 'mapped@example.com',
        language: 'en',
      },
      headers: {},
    };
    const res = mockResponse();

    await PinResetController.initiatePinReset(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(PinResetService.generateResetToken).toHaveBeenCalledWith(
      'external-user-id',
      '55555555-5555-4555-8555-555555555555',
      expect.objectContaining({
        email: 'mapped@example.com',
        language: 'en',
      })
    );
  });
});
