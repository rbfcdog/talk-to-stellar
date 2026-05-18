import { getRequiredJwtSecret } from '../src/config/secrets';

describe('runtime secret validation', () => {
  it('rejects missing JWT secrets outside test fallback mode', () => {
    expect(() => getRequiredJwtSecret({ NODE_ENV: 'production' } as any)).toThrow('JWT_SECRET is required');
  });

  it('rejects known insecure JWT fallback values', () => {
    expect(() =>
      getRequiredJwtSecret({
        NODE_ENV: 'development',
        JWT_SECRET: 'your-secret-key',
      } as any)
    ).toThrow('insecure development fallback');
  });

  it('requires a long JWT secret in hosted environments', () => {
    expect(() =>
      getRequiredJwtSecret({
        NODE_ENV: 'production',
        JWT_SECRET: 'short-secret',
      } as any)
    ).toThrow('at least 32 characters');
  });
});
