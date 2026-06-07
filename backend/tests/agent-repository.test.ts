import { AgentRepository } from '../src/api/repository/core/agent.repository';

function baseSessionData(overrides: Record<string, unknown> = {}) {
  return {
    session_token: 'session-token',
    user_id: 'user@example.com',
    email: 'user@example.com',
    created_at: '2026-06-01T00:00:00.000Z',
    last_activity: '2026-06-01T00:00:00.000Z',
    ...overrides,
  } as any;
}

function createSupabaseForUpsert(results: Array<{ error: any }>) {
  const upsert = jest.fn(async (_record: Record<string, unknown>, _options?: Record<string, unknown>) => (
    results.shift() || { error: null }
  ));
  const from = jest.fn(() => ({ upsert }));
  return {
    supabase: { from },
    from,
    upsert,
  };
}

describe('AgentRepository', () => {
  it('persists language and amount privacy preferences on session save', async () => {
    const db = createSupabaseForUpsert([{ error: null }]);
    const repository = new AgentRepository(db.supabase as any);

    await repository.saveSession('session-1', baseSessionData({
      preferred_language: 'en',
      language: 'en',
      hide_amounts: true,
      amounts_hidden: true,
      value_privacy: 'hidden',
    }));

    expect(db.from).toHaveBeenCalledWith('agent_sessions');
    expect(db.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'session-1',
        preferred_language: 'en',
        language: 'en',
        hide_amounts: true,
      }),
      { onConflict: 'session_id' }
    );
    const saved = db.upsert.mock.calls[0][0];
    expect(saved).not.toHaveProperty('amounts_hidden');
    expect(saved).not.toHaveProperty('value_privacy');
  });

  it('falls back when amount privacy columns are not migrated yet', async () => {
    const db = createSupabaseForUpsert([
      {
        error: {
          message: "Could not find the 'hide_amounts' column of 'agent_sessions' in the schema cache",
        },
      },
      { error: null },
    ]);
    const repository = new AgentRepository(db.supabase as any);

    await repository.saveSession('session-1', baseSessionData({
      preferred_language: 'pt-BR',
      language: 'pt-BR',
      hide_amounts: true,
    }));

    expect(db.upsert).toHaveBeenCalledTimes(2);
    expect(db.upsert.mock.calls[0][0]).toEqual(expect.objectContaining({
      hide_amounts: true,
      preferred_language: 'pt-BR',
    }));
    expect(db.upsert.mock.calls[1][0]).not.toHaveProperty('hide_amounts');
    expect(db.upsert.mock.calls[1][0]).toEqual(expect.objectContaining({
      preferred_language: 'pt-BR',
      language: 'pt-BR',
    }));
  });
});
