jest.mock('../src/config/supabase', () => ({
  supabase: {},
}));

jest.mock('../src/api/repository/core/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({})),
}));

import { sessionHasPin } from '../src/api/routes/auth.router';

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
});
