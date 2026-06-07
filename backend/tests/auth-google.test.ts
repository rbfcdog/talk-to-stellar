jest.mock('../src/config/supabase', () => ({
  supabase: {},
}));

jest.mock('../src/api/repository/core/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({})),
}));

import {
  googleExistingLoginPayload,
  selectGoogleSessionCandidate,
  sessionHasPin,
} from '../src/api/routes/auth.router';

describe('Google auth PIN gate', () => {
  it('requires PIN setup when a reusable Google email session has no PIN hash', () => {
    expect(sessionHasPin({})).toBe(false);
    expect(sessionHasPin({ password_hash: '', session_password_hash: '' })).toBe(false);
    expect(sessionHasPin({ phone_number: '+5511999999999', email: 'ana@example.com' })).toBe(false);
  });

  it('allows Google sign-in only when an existing session already has a PIN hash', () => {
    expect(sessionHasPin({ password_hash: 'legacy-pin-hash' })).toBe(true);
    expect(sessionHasPin({ session_password_hash: 'current-pin-hash' })).toBe(true);
  });

  it('prefers an older Google session with PIN over a newer incomplete session', () => {
    const selected = selectGoogleSessionCandidate([
      {
        session_id: 'newer-without-pin',
        email: 'ana@example.com',
        updated_at: '2026-06-07T10:00:00.000Z',
      },
      {
        session_id: 'older-with-pin',
        email: 'ana@example.com',
        session_password_hash: 'hash',
        updated_at: '2026-06-06T10:00:00.000Z',
      },
    ]);

    expect(selected?.session_id).toBe('older-with-pin');
  });

  it('sends existing Google accounts without credentials to login instead of account creation', () => {
    const payload = googleExistingLoginPayload({
      email: 'ana@example.com',
      displayName: 'Ana',
      reason: 'pin_setup_required',
      language: 'pt-BR',
    });

    expect(payload.existing_account).toBe(true);
    expect(payload.login_required).toBe(true);
    expect(payload.requires_pin_setup).toBe(false);
    expect(payload.message).toContain('senha');
  });
});
