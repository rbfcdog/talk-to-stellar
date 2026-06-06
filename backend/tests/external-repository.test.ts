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
  it('keeps generic phone lookup separate from WhatsApp aliases', async () => {
    const { supabase } = createSupabaseMock([
      {
        provider: 'phone',
        provider_user_id: '5519997624114',
        session_id: null,
        user_id: null,
        data: { remote_jid: '5519997624114@s.whatsapp.net' },
      },
      {
        provider: 'whatsapp',
        provider_user_id: '5519997624114',
        session_id: null,
        user_id: null,
        data: { email: 'rodrigo@example.com' },
      },
    ]);
    const repo = new ExternalRepository(supabase as any);

    const row = await repo.findByProviderAndId('phone', '5519997624114@s.whatsapp.net');

    expect(row).toEqual(expect.objectContaining({
      provider: 'phone',
      data: expect.objectContaining({ remote_jid: '5519997624114@s.whatsapp.net' }),
    }));
  });

  it('does not treat a generic phone mapping as a WhatsApp account', async () => {
    const { supabase } = createSupabaseMock([
      {
        provider: 'phone',
        provider_user_id: '5519997624114',
        session_id: 'web-session',
        user_id: 'web@example.com',
        data: { phone_number: '5519997624114' },
      },
    ]);
    const repo = new ExternalRepository(supabase as any);

    const row = await repo.findByProviderAndId('whatsapp', '5519997624114');

    expect(row).toBeNull();
  });

  it('keeps legacy WhatsApp-origin phone mappings usable for WhatsApp', async () => {
    const { supabase } = createSupabaseMock([
      {
        provider: 'phone',
        provider_user_id: '5519997624114',
        session_id: 'whatsapp-session',
        user_id: 'whatsapp@example.com',
        data: { remote_jid: '5519997624114@s.whatsapp.net' },
      },
    ]);
    const repo = new ExternalRepository(supabase as any);

    const row = await repo.findByProviderAndId('whatsapp', '5519997624114');

    expect(row).toEqual(expect.objectContaining({
      provider: 'phone',
      session_id: 'whatsapp-session',
    }));
  });

  it('does not copy identity data or ownership from another provider alias into a new alias row', async () => {
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
      session_id: null,
      user_id: null,
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
