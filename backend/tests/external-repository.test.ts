import { ExternalRepository } from '../src/api/repository/core/external.repository';

function createSupabaseMock(existingRows: any[]) {
  let upsertPayload: any = null;
  const chain: any = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.upsert = jest.fn((payload: any) => {
    upsertPayload = payload;
    return chain;
  });
  chain.single = jest.fn(async () => ({ data: upsertPayload, error: null }));
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data: existingRows, error: null }).then(resolve, reject);

  return {
    supabase: { from: jest.fn(() => chain) },
    getUpsertPayload: () => upsertPayload,
  };
}

describe('ExternalRepository', () => {
  it('does not copy identity data from another provider alias into a new alias row', async () => {
    const { supabase, getUpsertPayload } = createSupabaseMock([
      {
        provider: 'whatsapp',
        provider_user_id: '5511999999999',
        session_id: 'session-1',
        user_id: 'user@example.com',
        data: {
          phone_number: '5511999999999',
          whatsapp_number: '5511999999999',
          email: 'user@example.com',
        },
      },
    ]);
    const repo = new ExternalRepository(supabase as any);

    await repo.createMapping({
      provider: 'phone',
      provider_user_id: '5511999999999',
      data: { language: 'pt-BR' },
    });

    expect(getUpsertPayload()).toEqual(expect.objectContaining({
      provider: 'phone',
      provider_user_id: '5511999999999',
      session_id: 'session-1',
      user_id: 'user@example.com',
      data: { language: 'pt-BR' },
    }));
  });

  it('keeps existing data when updating the same exact provider row', async () => {
    const { supabase, getUpsertPayload } = createSupabaseMock([
      {
        provider: 'phone',
        provider_user_id: '5511999999999',
        session_id: 'session-1',
        user_id: 'user@example.com',
        data: {
          phone_number: '5511999999999',
          language: 'pt-BR',
        },
      },
    ]);
    const repo = new ExternalRepository(supabase as any);

    await repo.createMapping({
      provider: 'phone',
      provider_user_id: '5511999999999',
      data: { last_message_id: 'm-1' },
    });

    expect(getUpsertPayload().data).toEqual({
      phone_number: '5511999999999',
      language: 'pt-BR',
      last_message_id: 'm-1',
    });
  });
});
