import crypto from 'crypto';

const mockFrom = jest.fn();
const mockGetSession = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

jest.mock('../src/repositories/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    getSession: mockGetSession,
  })),
}));

type InsertedChallenge = {
  user_id: string;
  type: string;
  challenge: string;
  payload: any;
  expires_at: string;
};

describe('PasskeyService challenge generation', () => {
  let mockPasskeys: any[];
  let insertedChallenges: InsertedChallenge[];

  beforeEach(() => {
    jest.resetModules();
    mockFrom.mockReset();
    mockGetSession.mockReset();
    mockPasskeys = [];
    insertedChallenges = [];
    captureChallengeInserts();
  });

  function captureChallengeInserts() {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_passkeys') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockPasskeys, error: null }),
        };
      }

      if (table === 'passkey_challenges') {
        return {
          insert: jest.fn((row: InsertedChallenge) => {
            insertedChallenges.push(row);
            return {
              select: jest.fn(() => ({
                single: jest.fn().mockResolvedValue({
                  data: {
                    id: `challenge-${insertedChallenges.length}`,
                    ...row,
                  },
                  error: null,
                }),
              })),
            };
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
  }

  it('stores the exact registration challenge returned to the browser', async () => {
    const { default: PasskeyService } = await import('../src/services/passkey.service');

    const authorization = {
      userId: 'user-123',
      sessionId: 'session-123',
      sessionTokenHash: crypto.createHash('sha256').update('session-token').digest('hex'),
    };
    const result = await PasskeyService.generateRegistration(authorization);

    expect(insertedChallenges).toHaveLength(1);
    expect(insertedChallenges[0]).toMatchObject({
      user_id: 'user-123',
      type: 'registration',
      challenge: result.options.challenge,
      payload: {
        userId: 'user-123',
        authorization: {
          method: 'session',
          sessionId: 'session-123',
          sessionTokenHash: authorization.sessionTokenHash,
        },
      },
    });
    expect(Buffer.from(result.options.challenge, 'base64url')).toHaveLength(32);
  });

  it('requires a valid session token before registration', async () => {
    const { default: PasskeyService } = await import('../src/services/passkey.service');

    await expect(PasskeyService.authorizeRegistration({
      userId: 'user-123',
      sessionId: 'session-123',
    })).rejects.toThrow('session_id and session_token');
  });

  it('authorizes passkey registration for the authenticated session owner', async () => {
    mockGetSession.mockResolvedValue({
      user_id: 'user-123',
      email: 'user@example.com',
      session_token: 'session-token',
      last_activity: new Date().toISOString(),
    });
    const { default: PasskeyService } = await import('../src/services/passkey.service');

    await expect(PasskeyService.authorizeRegistration({
      email: 'user@example.com',
      sessionId: 'session-123',
      sessionToken: 'session-token',
    })).resolves.toMatchObject({
      userId: 'user-123',
      sessionId: 'session-123',
    });
  });

  it('rejects passkey registration when the requested user differs from the session owner', async () => {
    mockGetSession.mockResolvedValue({
      user_id: 'user-123',
      email: 'user@example.com',
      session_token: 'session-token',
      last_activity: new Date().toISOString(),
    });
    const { default: PasskeyService } = await import('../src/services/passkey.service');

    await expect(PasskeyService.authorizeRegistration({
      email: 'attacker@example.com',
      sessionId: 'session-123',
      sessionToken: 'session-token',
    })).rejects.toThrow('not authorized');
  });

  it('stores the exact login authentication challenge returned to the browser', async () => {
    mockPasskeys = [
      {
        id: 'passkey-1',
        user_id: 'user-123',
        credential_id: crypto.randomBytes(16).toString('base64url'),
        public_key: crypto.randomBytes(32).toString('base64url'),
        counter: 0,
        transports: ['internal'],
      },
    ];
    const { default: PasskeyService } = await import('../src/services/passkey.service');

    const result = await PasskeyService.generateLoginAuthentication('user-123');

    if (result.registrationRequired) {
      throw new Error('Expected authentication options for a user with passkeys');
    }
    if (!result.options) {
      throw new Error('Expected authentication options to be present');
    }

    expect(insertedChallenges).toHaveLength(1);
    expect(insertedChallenges[0]).toMatchObject({
      user_id: 'user-123',
      type: 'authentication',
      challenge: result.options.challenge,
    });
    expect(Buffer.from(result.options.challenge, 'base64url')).toHaveLength(32);
  });
});
