import { buildCorsOptions, isOpsBrowserRoutePath } from '../src/api/middlewares/security.middleware';

function checkOrigin(env: NodeJS.ProcessEnv, origin: string): Promise<Error | null> {
  const options = buildCorsOptions(env);
  return new Promise((resolve) => {
    const originHandler = options.origin;
    if (typeof originHandler !== 'function') {
      resolve(new Error('CORS origin handler is not configured.'));
      return;
    }
    originHandler(origin, (error) => resolve(error || null));
  });
}

describe('security middleware', () => {
  it('keeps hosted CORS strict for unknown origins', async () => {
    const error = await checkOrigin({
      NODE_ENV: 'production',
      RAILWAY_ENVIRONMENT: 'production',
      CORS_ORIGINS: 'https://app.talktostellar.com',
    } as NodeJS.ProcessEnv, 'https://unexpected.example');

    expect(error?.message).toBe('CORS origin denied');
  });

  it('identifies server-rendered ops browser routes for CORS bypass', () => {
    expect(isOpsBrowserRoutePath('/ops')).toBe(true);
    expect(isOpsBrowserRoutePath('/ops/login')).toBe(true);
    expect(isOpsBrowserRoutePath('/ops/transfers/transfer-1')).toBe(true);
    expect(isOpsBrowserRoutePath('/ops/login?return_to=%2Fops')).toBe(true);

    expect(isOpsBrowserRoutePath('/api/ops/history')).toBe(false);
    expect(isOpsBrowserRoutePath('/api/transfers')).toBe(false);
    expect(isOpsBrowserRoutePath('/ops-api')).toBe(false);
  });
});
