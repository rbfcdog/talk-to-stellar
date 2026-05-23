import { PinResetController } from '../src/api/controllers/pin-reset.controller';
import { PinResetService } from '../src/api/services/core/pin-reset.service';
import { supabase } from '../src/config/supabase';

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
      '11111111-1111-4111-8111-111111111111'
    );
    const payload = (res.json as jest.Mock).mock.calls[0][0];
    expect(payload.reset_url).toContain('/change-pin');
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
});
