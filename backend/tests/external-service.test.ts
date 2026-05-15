import { ExternalService } from '../src/services/external.service';

function createQuery(data: any[] = [], error: any = null) {
  const result = { data, error };
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => ({ data: data[0] || null, error })),
    single: jest.fn(async () => ({ data: data[0] || null, error })),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function createSupabaseMock(input: {
  externalAccounts?: any[];
  agentStates?: any[];
  agentSessions?: any[];
}) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'external_accounts') return createQuery(input.externalAccounts || []);
      if (table === 'agent_states') return createQuery(input.agentStates || []);
      if (table === 'agent_sessions') return createQuery(input.agentSessions || []);
      return createQuery([]);
    }),
  };
}

describe('ExternalService.checkExternalAccount', () => {
  it('returns a linked Telegram account from external_accounts', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [
        {
          provider: 'telegram',
          provider_user_id: '6405034913',
          session_id: '21804a36-08bf-4abf-8854-039429571e5d',
          user_id: 'rodrigo@example.com',
          data: { telegram_chat_id: '6405034913' },
        },
      ],
    });

    const service = new ExternalService(supabase as any);
    const account = await service.checkExternalAccount('telegram', '6405034913');

    expect(account).toMatchObject({
      provider: 'telegram',
      provider_user_id: '6405034913',
      session_id: '21804a36-08bf-4abf-8854-039429571e5d',
      user_id: 'rodrigo@example.com',
    });
  });

  it('does not treat agent state as a Telegram account link when external_accounts is only a placeholder', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [
        {
          provider: 'telegram',
          provider_user_id: '6405034913',
          session_id: null,
          user_id: null,
          data: { telegram_chat_id: '6405034913' },
        },
      ],
      agentStates: [
        {
          session_id: '21804a36-08bf-4abf-8854-039429571e5d',
          action_params: {
            external_provider: 'telegram',
            external_provider_user_id: '6405034913',
          },
          updated_at: '2026-05-15T12:00:00.000Z',
        },
      ],
      agentSessions: [
        {
          session_id: '21804a36-08bf-4abf-8854-039429571e5d',
          user_id: 'rodrigo@example.com',
          email: 'rodrigo@example.com',
        },
      ],
    });

    const service = new ExternalService(supabase as any);
    const account = await service.checkExternalAccount('telegram', '6405034913');

    expect(account).toBeNull();
  });

  it('does not recover a Telegram account from agent state when external_accounts has no row yet', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [],
      agentStates: [
        {
          session_id: 'session-from-chat',
          action_params: {
            external_provider: 'telegram',
            external_provider_user_id: '6405034913',
          },
          updated_at: '2026-05-15T12:00:00.000Z',
        },
      ],
      agentSessions: [
        {
          session_id: 'session-from-chat',
          user_id: 'rodrigo@example.com',
          email: 'rodrigo@example.com',
        },
      ],
    });

    const service = new ExternalService(supabase as any);
    const account = await service.checkExternalAccount('telegram', '6405034913');

    expect(account).toBeNull();
  });

  it('returns null when there is no linked mapping and no matching chat state', async () => {
    const supabase = createSupabaseMock({
      externalAccounts: [],
      agentStates: [],
      agentSessions: [],
    });

    const service = new ExternalService(supabase as any);
    const account = await service.checkExternalAccount('telegram', '6405034913');

    expect(account).toBeNull();
  });
});
