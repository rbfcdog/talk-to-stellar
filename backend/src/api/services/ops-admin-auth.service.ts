import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase';
import { hashPassword, verifyPassword } from '../../utils/password';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_LOCK_MINUTES = 15;
const DUMMY_PASSWORD_HASH = hashPassword('invalid-ops-admin-password');

export type OpsAdminUser = {
  id: string;
  login: string;
  display_name: string | null;
  password_hash?: string | null;
  role: string;
  active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type OpsAdminLoginResult =
  | { ok: true; admin: OpsAdminUser }
  | { ok: false; reason: 'invalid' | 'locked' | 'inactive' | 'not_configured'; lockedUntil?: string };

function readPositiveInt(name: string, fallback: number): number {
  const parsed = Number(String(process.env[name] || '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function maxAttempts(): number {
  return readPositiveInt('OPS_ADMIN_MAX_FAILED_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
}

function lockMinutes(): number {
  return readPositiveInt('OPS_ADMIN_LOCK_MINUTES', DEFAULT_LOCK_MINUTES);
}

function normalizeLogin(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizePassword(value: unknown): string {
  return String(value || '');
}

function safeCount(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function lockState(admin: OpsAdminUser): { locked: boolean; lockedUntil?: string } {
  const raw = String(admin.locked_until || '').trim();
  if (!raw) return { locked: false };
  const lockedUntilMs = Date.parse(raw);
  if (!Number.isFinite(lockedUntilMs) || lockedUntilMs <= Date.now()) return { locked: false };
  return { locked: true, lockedUntil: new Date(lockedUntilMs).toISOString() };
}

export class OpsAdminAuthService {
  constructor(private readonly db: SupabaseClient = supabase) {}

  normalizeLogin(value: unknown): string {
    return normalizeLogin(value);
  }

  hashPassword(password: unknown): string {
    return hashPassword(normalizePassword(password));
  }

  async getByLogin(login: unknown): Promise<OpsAdminUser | null> {
    const normalized = normalizeLogin(login);
    if (!normalized) return null;

    const { data, error } = await this.db
      .from('ops_admin_users')
      .select('id, login, display_name, password_hash, role, active, failed_attempts, locked_until, last_login_at, created_at, updated_at')
      .eq('login', normalized)
      .maybeSingle();

    if (error) throw error;
    return data as OpsAdminUser | null;
  }

  async getActiveById(id: unknown): Promise<OpsAdminUser | null> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;

    const { data, error } = await this.db
      .from('ops_admin_users')
      .select('id, login, display_name, role, active, failed_attempts, locked_until, last_login_at, created_at, updated_at')
      .eq('id', normalizedId)
      .eq('active', true)
      .maybeSingle();

    if (error) throw error;
    return data as OpsAdminUser | null;
  }

  async verifyLogin(login: unknown, password: unknown): Promise<OpsAdminLoginResult> {
    const normalizedLogin = normalizeLogin(login);
    const normalizedPassword = normalizePassword(password);
    if (!normalizedLogin || !normalizedPassword) {
      verifyPassword(normalizedPassword, DUMMY_PASSWORD_HASH);
      return { ok: false, reason: 'invalid' };
    }

    const admin = await this.getByLogin(normalizedLogin);
    if (!admin) {
      verifyPassword(normalizedPassword, DUMMY_PASSWORD_HASH);
      return { ok: false, reason: 'invalid' };
    }

    const locked = lockState(admin);
    if (locked.locked) {
      return { ok: false, reason: 'locked', lockedUntil: locked.lockedUntil };
    }

    if (!admin.active) {
      verifyPassword(normalizedPassword, admin.password_hash || DUMMY_PASSWORD_HASH);
      return { ok: false, reason: 'inactive' };
    }

    const storedHash = String(admin.password_hash || '').trim();
    if (!storedHash) {
      verifyPassword(normalizedPassword, DUMMY_PASSWORD_HASH);
      return { ok: false, reason: 'not_configured' };
    }

    if (!verifyPassword(normalizedPassword, storedHash)) {
      await this.recordFailure(admin);
      return { ok: false, reason: 'invalid' };
    }

    await this.recordSuccess(admin);
    return {
      ok: true,
      admin: {
        ...admin,
        password_hash: undefined,
        failed_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
      },
    };
  }

  private async recordFailure(admin: OpsAdminUser): Promise<void> {
    const attempts = safeCount(admin.failed_attempts) + 1;
    const shouldLock = attempts >= maxAttempts();
    const lockedUntil = shouldLock
      ? new Date(Date.now() + lockMinutes() * 60 * 1000).toISOString()
      : null;

    const { error } = await this.db
      .from('ops_admin_users')
      .update({
        failed_attempts: attempts,
        last_failed_at: new Date().toISOString(),
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      })
      .eq('id', admin.id);

    if (error) throw error;
  }

  private async recordSuccess(admin: OpsAdminUser): Promise<void> {
    const { error } = await this.db
      .from('ops_admin_users')
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_failed_at: null,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', admin.id);

    if (error) throw error;
  }
}

export const opsAdminAuthService = new OpsAdminAuthService();
