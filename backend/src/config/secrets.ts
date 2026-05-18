import { isProductionLikeEnvironment } from './runtime';

const KNOWN_INSECURE_JWT_SECRETS = new Set([
  '',
  'your-secret-key',
  'dev-secret-change-me',
  'dev-email-confirmation-secret',
  'test-secret',
]);

export function getRequiredJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.JWT_SECRET || '').trim();

  if (env.NODE_ENV === 'test' && !configured) {
    return 'test-only-jwt-secret-not-for-runtime';
  }

  const productionLike = isProductionLikeEnvironment(env);
  if (!configured) {
    throw new Error('JWT_SECRET is required.');
  }

  if (KNOWN_INSECURE_JWT_SECRETS.has(configured)) {
    throw new Error('JWT_SECRET is using an insecure development fallback value.');
  }

  if (productionLike && configured.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in hosted/production environments.');
  }

  return configured;
}

export function getRequiredSecret(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env[name] || '').trim();
  if (!configured) {
    throw new Error(`${name} is required.`);
  }
  return configured;
}
