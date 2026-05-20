import { NextFunction, Request, Response } from 'express';
import type { CorsOptions } from 'cors';
import { isProductionLikeEnvironment } from '../../config/runtime';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const globalBuckets = new Map<string, RateLimitBucket>();
const sensitiveBuckets = new Map<string, RateLimitBucket>();

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  count: number;
};

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

function memoryRateLimitHit(
  bucket: Map<string, RateLimitBucket>,
  key: string,
  windowMs: number,
  max: number
): RateLimitDecision {
  const now = Date.now();
  const current = bucket.get(key);

  if (!current || current.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)), count: 1 };
  }

  current.count += 1;
  return {
    allowed: current.count <= max,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    count: current.count,
  };
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
    const rawIp = String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || 'unknown')
      .split(',')
      .shift()
      ?.trim() || 'unknown';
    const key = `${options.keyPrefix || 'global'}:${rawIp}:${req.method}:${req.path}`;
    const decision = memoryRateLimitHit(bucket, key, options.windowMs, options.max);
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - decision.count)));

    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
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
