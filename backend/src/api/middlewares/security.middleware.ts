import { NextFunction, Request, Response } from 'express';
import type { CorsOptions } from 'cors';
import { isProductionLikeEnvironment } from '../../config/runtime';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalBuckets = new Map<string, RateLimitBucket>();
const sensitiveBuckets = new Map<string, RateLimitBucket>();

function splitCsv(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function isLocalOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const productionLike = isProductionLikeEnvironment(env);
  const configured = splitCsv(env.CORS_ORIGINS);
  const derived = splitCsv([
    env.PUBLIC_APP_URL,
    env.FRONTEND_URL,
    env.CREATE_ACCOUNT_BASE,
    env.PAYMENT_CONFIRM_BASE,
  ].filter(Boolean).join(','));
  const allowedOrigins = new Set([...configured, ...derived].map((origin) => origin.replace(/\/$/, '')));

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = origin.replace(/\/$/, '');
      if (allowedOrigins.has(normalizedOrigin) || (!productionLike && isLocalOrigin(normalizedOrigin))) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin denied'));
    },
  };
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (isProductionLikeEnvironment()) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

export function createRateLimitMiddleware(options: {
  windowMs: number;
  max: number;
  bucket?: Map<string, RateLimitBucket>;
  keyPrefix?: string;
}) {
  const bucket = options.bucket || globalBuckets;
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const rawIp = String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();
    const key = `${options.keyPrefix || 'global'}:${rawIp}:${req.method}:${req.path}`;
    const current = bucket.get(key);

    if (!current || current.resetAt <= now) {
      bucket.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
      return;
    }

    next();
  };
}

export const globalRateLimit = createRateLimitMiddleware({
  windowMs: positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  max: positiveNumber(process.env.RATE_LIMIT_MAX, 300),
  keyPrefix: 'global',
});

export const sensitiveRateLimit = createRateLimitMiddleware({
  windowMs: positiveNumber(process.env.SENSITIVE_RATE_LIMIT_WINDOW_MS, 60_000),
  max: positiveNumber(process.env.SENSITIVE_RATE_LIMIT_MAX, 30),
  bucket: sensitiveBuckets,
  keyPrefix: 'sensitive',
});
