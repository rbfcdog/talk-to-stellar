import type { SupabaseClient } from '@supabase/supabase-js';
import { hashPassword, verifyPassword } from '../../utils/password';
import { verifyWalletPinAgainstAny } from '../../utils/pin-hash';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type LoginSessionLike = {
  session_id?: string;
  login_password_hash?: string | null;
  login_failed_attempts?: number | string | null;
  login_locked_until?: string | null;
  password_hash?: string | null;
  session_password_hash?: string | null;
};

export type LoginPasswordVerification = {
  valid: boolean;
  usedLegacyPinFallback: boolean;
};

export type LoginFailureResult = {
  failedAttempts: number;
  locked: boolean;
  lockedUntil?: string;
};

export type LoginLockState = {
  locked: boolean;
  lockedUntil?: string;
  remainingSeconds?: number;
};

function readNumberEnv(name: string, fallback: number): number {
  const parsed = Number(String(process.env[name] || '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function maxAttempts(): number {
  return readNumberEnv('LOGIN_PASSWORD_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
}

function lockMinutes(): number {
  return readNumberEnv('LOGIN_PASSWORD_LOCK_MINUTES', DEFAULT_LOCK_MINUTES);
}

function safeAttemptCount(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function isMissingLoginColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('login_') &&
    (message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find'))
  );
}

function updateBySession(db: SupabaseClient, sessionId: string, patch: Record<string, unknown>) {
  return db
    .from('agent_sessions')
    .update(patch)
    .eq('session_id', sessionId);
}

export class LoginPasswordService {
  static normalizeSecret(value: unknown): string {
    return String(value || '').trim();
  }

  static validateNewPassword(password: unknown): { valid: boolean; message?: string } {
    const normalized = this.normalizeSecret(password);
    if (normalized.length < MIN_PASSWORD_LENGTH) {
      return {
        valid: false,
        message: 'Password must contain at least 8 characters.',
      };
    }
    if (normalized.length > MAX_PASSWORD_LENGTH) {
      return {
        valid: false,
        message: 'Password is too long.',
      };
    }
    return { valid: true };
  }

  static hash(password: unknown): string {
    return hashPassword(this.normalizeSecret(password));
  }

  static verify(secret: unknown, session: LoginSessionLike): LoginPasswordVerification {
    const normalized = this.normalizeSecret(secret);
    if (!normalized) return { valid: false, usedLegacyPinFallback: false };

    const loginPasswordHash = String(session?.login_password_hash || '').trim();
    if (loginPasswordHash) {
      return {
        valid: verifyPassword(normalized, loginPasswordHash),
        usedLegacyPinFallback: false,
      };
    }

    const legacyPin = verifyWalletPinAgainstAny(normalized, [
      session?.session_password_hash,
      session?.password_hash,
    ]);
    return {
      valid: legacyPin.valid,
      usedLegacyPinFallback: legacyPin.valid,
    };
  }

  static lockState(session: LoginSessionLike): LoginLockState {
    const raw = String(session?.login_locked_until || '').trim();
    if (!raw) return { locked: false };
    const lockedUntilMs = Date.parse(raw);
    if (!Number.isFinite(lockedUntilMs) || lockedUntilMs <= Date.now()) {
      return { locked: false };
    }
    return {
      locked: true,
      lockedUntil: new Date(lockedUntilMs).toISOString(),
      remainingSeconds: Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 1000)),
    };
  }

  static async recordFailure(db: SupabaseClient, session: LoginSessionLike): Promise<LoginFailureResult> {
    const sessionId = String(session?.session_id || '').trim();
    const attempts = safeAttemptCount(session?.login_failed_attempts) + 1;
    const shouldLock = attempts >= maxAttempts();
    const lockedUntil = shouldLock
      ? new Date(Date.now() + lockMinutes() * 60 * 1000).toISOString()
      : undefined;

    if (sessionId) {
      const patch = {
        login_failed_attempts: attempts,
        login_last_failed_at: new Date().toISOString(),
        login_locked_until: lockedUntil || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await updateBySession(db, sessionId, patch);
      if (error && !isMissingLoginColumnError(error)) {
        throw error;
      }
    }

    return {
      failedAttempts: attempts,
      locked: shouldLock,
      lockedUntil,
    };
  }

  static async clearFailures(db: SupabaseClient, session: LoginSessionLike): Promise<void> {
    const sessionId = String(session?.session_id || '').trim();
    if (!sessionId) return;
    const { error } = await updateBySession(db, sessionId, {
      login_failed_attempts: 0,
      login_locked_until: null,
      login_last_failed_at: null,
      updated_at: new Date().toISOString(),
    });
    if (error && !isMissingLoginColumnError(error)) {
      throw error;
    }
  }

  static async persistPasswordHash(db: SupabaseClient, session: LoginSessionLike, password: unknown): Promise<void> {
    const sessionId = String(session?.session_id || '').trim();
    if (!sessionId) return;
    const { error } = await updateBySession(db, sessionId, {
      login_password_hash: this.hash(password),
      updated_at: new Date().toISOString(),
    });
    if (error && !isMissingLoginColumnError(error)) {
      throw error;
    }
  }
}
