import { LoginPasswordService } from '../src/api/services/login-password.service';
import { hashWalletPin } from '../src/utils/pin-hash';

describe('LoginPasswordService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      LOGIN_PASSWORD_MAX_ATTEMPTS: '2',
      LOGIN_PASSWORD_LOCK_MINUTES: '10',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('validates dedicated login passwords when present', () => {
    const loginHash = LoginPasswordService.hash('correct horse');

    expect(LoginPasswordService.verify('correct horse', { login_password_hash: loginHash })).toEqual({
      valid: true,
      usedLegacyPinFallback: false,
    });
    expect(LoginPasswordService.verify('wrong horse', { login_password_hash: loginHash }).valid).toBe(false);
  });

  it('accepts the wallet PIN as login password for legacy accounts without login_password_hash', () => {
    const pinHash = hashWalletPin('123456');

    expect(LoginPasswordService.verify('123456', { session_password_hash: pinHash })).toEqual({
      valid: true,
      usedLegacyPinFallback: true,
    });
    expect(LoginPasswordService.verify('000000', { session_password_hash: pinHash }).valid).toBe(false);
  });

  it('locks login after too many failed attempts', async () => {
    const updates: any[] = [];
    const db: any = {
      from: () => ({
        update: (patch: any) => ({
          eq: () => {
            updates.push(patch);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    };

    const first = await LoginPasswordService.recordFailure(db, {
      session_id: 'session-1',
      login_failed_attempts: 0,
    });
    const second = await LoginPasswordService.recordFailure(db, {
      session_id: 'session-1',
      login_failed_attempts: first.failedAttempts,
    });

    expect(first.locked).toBe(false);
    expect(second.locked).toBe(true);
    expect(second.lockedUntil).toBeTruthy();
    expect(updates.at(-1).login_locked_until).toBeTruthy();
  });
});
