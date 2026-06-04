import crypto from 'crypto';

const mockFrom = jest.fn();
const mockGetSession = jest.fn();
const mockSaveSession = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

jest.mock('../src/api/repository/core/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    getSession: mockGetSession,
    saveSession: mockSaveSession,
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
    mockSaveSession.mockReset();
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
    const { default: PasskeyService } = await import('../src/api/services/core/passkey.service');

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

  it('accepts both apex and www origins for the production passkey domain', async () => {
    const previous = {
      PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN,
      PASSKEY_ORIGINS: process.env.PASSKEY_ORIGINS,
      WEBAUTHN_ORIGINS: process.env.WEBAUTHN_ORIGINS,
      FRONTEND_URL: process.env.FRONTEND_URL,
      NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL,
    };
    try {
      delete process.env.PASSKEY_ORIGINS;
      delete process.env.WEBAUTHN_ORIGINS;
      delete process.env.FRONTEND_URL;
      delete process.env.NEXT_PUBLIC_FRONTEND_URL;
      const { getExpectedOrigins } = await import('../src/api/services/core/passkey.service');
      delete process.env.PASSKEY_ORIGINS;
      delete process.env.WEBAUTHN_ORIGINS;
      delete process.env.FRONTEND_URL;
      delete process.env.NEXT_PUBLIC_FRONTEND_URL;
      process.env.PASSKEY_ORIGIN = 'https://talktostellar.com';

      expect(getExpectedOrigins()).toEqual([
        'https://talktostellar.com',
        'https://www.talktostellar.com',
      ]);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete (process.env as any)[key];
        else (process.env as any)[key] = value;
      }
    }
  });

  it('derives the apex RP ID when the configured passkey origin has www', async () => {
    const previous = {
      PASSKEY_RP_ID: process.env.PASSKEY_RP_ID,
      WEBAUTHN_RP_ID: process.env.WEBAUTHN_RP_ID,
      PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN,
      PASSKEY_ORIGINS: process.env.PASSKEY_ORIGINS,
      WEBAUTHN_ORIGINS: process.env.WEBAUTHN_ORIGINS,
      FRONTEND_URL: process.env.FRONTEND_URL,
      NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL,
    };
    try {
      delete process.env.PASSKEY_RP_ID;
      delete process.env.WEBAUTHN_RP_ID;
      delete process.env.PASSKEY_ORIGINS;
      delete process.env.WEBAUTHN_ORIGINS;
      delete process.env.FRONTEND_URL;
      delete process.env.NEXT_PUBLIC_FRONTEND_URL;
      const { getExpectedOrigins, getRpID } = await import('../src/api/services/core/passkey.service');
      delete process.env.PASSKEY_RP_ID;
      delete process.env.WEBAUTHN_RP_ID;
      delete process.env.PASSKEY_ORIGINS;
      delete process.env.WEBAUTHN_ORIGINS;
      delete process.env.FRONTEND_URL;
      delete process.env.NEXT_PUBLIC_FRONTEND_URL;
      process.env.PASSKEY_ORIGIN = 'https://www.talktostellar.com';

      expect(getRpID()).toBe('talktostellar.com');
      expect(getExpectedOrigins()).toEqual([
        'https://www.talktostellar.com',
        'https://talktostellar.com',
      ]);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete (process.env as any)[key];
        else (process.env as any)[key] = value;
      }
    }
  });

  it('requires a valid session token before registration', async () => {
    const { default: PasskeyService } = await import('../src/api/services/core/passkey.service');

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
    const { default: PasskeyService } = await import('../src/api/services/core/passkey.service');

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
    const { default: PasskeyService } = await import('../src/api/services/core/passkey.service');

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
    const { default: PasskeyService } = await import('../src/api/services/core/passkey.service');

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

  it('decodes WebAuthn P-256 COSE public keys for smart-account signer metadata', async () => {
    const { default: PasskeyService } = await import('../src/api/services/core/passkey.service');
    const x = Buffer.alloc(32, 1);
    const y = Buffer.alloc(32, 2);
    const cosePublicKey = Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
      x,
      Buffer.from([0x22, 0x58, 0x20]),
      y,
    ]);

    const decoded = PasskeyService.decodeCredentialPublicKeyForSmartAccount(cosePublicKey);

    expect(decoded).toMatchObject({
      kty: 'EC',
      crv: 'P-256',
      alg: 'ES256',
      cose_kty: 2,
      cose_alg: -7,
      cose_crv: 1,
      x: x.toString('base64url'),
      y: y.toString('base64url'),
      cose_public_key: cosePublicKey.toString('base64url'),
      public_key_uncompressed: Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url'),
    });
  });

  it('creates a hashed phone-to-computer login code for a valid passkey session', async () => {
    const storedRows: any[] = [];
    mockGetSession.mockResolvedValue({
      user_id: 'user-123',
      email: 'user@example.com',
      session_token: 'session-token',
      last_activity: new Date().toISOString(),
    });
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'passkey_login_pairing_codes') throw new Error(`Unexpected table ${table}`);
      return {
        upsert: jest.fn((row: any) => {
          storedRows.push(row);
          return Promise.resolve({ data: null, error: null });
        }),
      };
    });

    const { default: PasskeyService } = await import('../src/api/services/core/passkey.service');
    const result = await PasskeyService.createLoginPairingCode({
      pairId: 'pair-123456',
      sessionId: 'session-123',
      sessionToken: 'session-token',
      email: 'user@example.com',
    });

    expect(result.code).toMatch(/^\d{6}$/);
    expect(storedRows).toHaveLength(1);
    expect(storedRows[0]).toMatchObject({
      pair_id: 'pair-123456',
      user_id: 'user-123',
      email: 'user@example.com',
      session_id: 'session-123',
      used_at: null,
    });
    expect(storedRows[0].code_hash).not.toContain(result.code);
    expect(storedRows[0].session_token_hash).not.toContain('session-token');
  });

  it('redeems a phone-to-computer login code once and returns the session cookie payload', async () => {
    const pairId = 'pair-abcdef';
    const code = '123456';
    const session = {
      user_id: 'user-123',
      email: 'user@example.com',
      session_token: 'session-token',
      last_activity: new Date().toISOString(),
    };
    const codeHash = crypto.createHash('sha256').update(`${pairId}:${code}`).digest('hex');
    const tokenHash = crypto.createHash('sha256').update(session.session_token).digest('hex');
    const row = {
      id: 'row-1',
      pair_id: pairId,
      code_hash: codeHash,
      user_id: session.user_id,
      email: session.email,
      session_id: 'session-123',
      session_token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: null,
    };
    const updateCalls: any[] = [];
    mockGetSession.mockResolvedValue(session);
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'passkey_login_pairing_codes') throw new Error(`Unexpected table ${table}`);
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
        }),
        update: jest.fn((payload: any) => {
          updateCalls.push(payload);
          return {
            eq: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: { id: row.id }, error: null }),
          };
        }),
      };
    });

    const { default: PasskeyService } = await import('../src/api/services/core/passkey.service');
    const result = await PasskeyService.redeemLoginPairingCode({ pairId, code });

    expect(result).toMatchObject({
      verified: true,
      userId: 'user-123',
      email: 'user@example.com',
      sessionId: 'session-123',
      sessionToken: 'session-token',
      session_source: 'web',
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].used_at).toBeTruthy();
    expect(mockSaveSession).toHaveBeenCalledWith('session-123', session);
  });
});
