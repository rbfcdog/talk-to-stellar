export function isProductionLikeEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  return Boolean(
    nodeEnv === 'production' ||
      env.RAILWAY_PUBLIC_DOMAIN ||
      env.RENDER_EXTERNAL_URL ||
      env.FLY_APP_NAME ||
      env.VERCEL_URL
  );
}

export function readBooleanEnv(value: unknown): boolean {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}
