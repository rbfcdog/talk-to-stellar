import {
  EarlyAccessSignupError,
  EarlyAccessSignupService,
} from '../src/api/services/early-access-signup.service';

function createDbMock(response: { data: any; error: any }) {
  const single = jest.fn().mockResolvedValue(response);
  const select = jest.fn(() => ({ single }));
  const upsert = jest.fn(() => ({ select }));
  const from = jest.fn(() => ({ upsert }));

  return {
    db: { from },
    from,
    upsert,
    select,
    single,
  };
}

describe('EarlyAccessSignupService', () => {
  it('normalizes email and upserts a subscribed early-access row', async () => {
    const mock = createDbMock({
      data: { id: 'signup-1', email: 'founder@example.com', status: 'subscribed' },
      error: null,
    });
    const service = new EarlyAccessSignupService(mock.db as any);

    const result = await service.subscribe({
      email: ' Founder@Example.COM ',
      locale: 'en-US',
      source: 'landing-reluca',
      campaign: 'private-beta',
      referrer: 'https://example.com',
      pageUrl: 'https://talktostellar.com',
      metadata: {
        component: 'cta-email-list',
        skip: undefined,
        fn: () => true,
      },
    });

    expect(result).toEqual({
      id: 'signup-1',
      email: 'founder@example.com',
      status: 'subscribed',
    });
    expect(mock.from).toHaveBeenCalledWith('early_access_signups');
    expect(mock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'founder@example.com',
        status: 'subscribed',
        locale: 'en',
        source: 'landing-reluca',
        campaign: 'private-beta',
        referrer: 'https://example.com',
        page_url: 'https://talktostellar.com',
        metadata_json: { component: 'cta-email-list' },
        unsubscribed_at: null,
      }),
      { onConflict: 'email' }
    );
    expect(mock.select).toHaveBeenCalledWith('id, email, status');
  });

  it('rejects invalid email without writing to Supabase', async () => {
    const mock = createDbMock({ data: null, error: null });
    const service = new EarlyAccessSignupService(mock.db as any);

    await expect(service.subscribe({ email: 'not-an-email' })).rejects.toMatchObject({
      code: 'EARLY_ACCESS_EMAIL_INVALID',
      statusCode: 400,
    } satisfies Partial<EarlyAccessSignupError>);
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('maps RLS failures to setup errors', async () => {
    const mock = createDbMock({
      data: null,
      error: { code: '42501', message: 'violates row-level security policy' },
    });
    const service = new EarlyAccessSignupService(mock.db as any);

    await expect(service.subscribe({ email: 'user@example.com' })).rejects.toMatchObject({
      code: 'EARLY_ACCESS_TABLE_INACCESSIBLE',
      statusCode: 500,
    } satisfies Partial<EarlyAccessSignupError>);
  });
});
