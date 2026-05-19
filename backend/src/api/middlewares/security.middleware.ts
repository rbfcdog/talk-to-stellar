import { NextFunction, Request, Response } from 'express';
import type { CorsOptions } from 'cors';
import { isProductionLikeEnvironment, readBooleanEnv } from '../../config/runtime';

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

function readRedisRestConfig(env: NodeJS.ProcessEnv = process.env): { url: string; token: string } | null {
  if (readBooleanEnv(env.RATE_LIMIT_REDIS_DISABLED)) return null;
  const url = String(env.UPSTASH_REDIS_REST_URL || env.REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

async function redisRateLimitHit(key: string, windowMs: number, max: number): Promise<RateLimitDecision | null> {
  const config = readRedisRestConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['PEXPIRE', key, windowMs, 'NX'],
      ['PTTL', key],
    ]),
  });

  if (!response.ok) {
    throw new Error(`Redis REST rate limit failed with HTTP ${response.status}`);
  }

  const payload = await response.json() as Array<{ result?: unknown; error?: string }>;
  if (!Array.isArray(payload) || payload[0]?.error || payload[2]?.error) {
    throw new Error(payload?.find((item) => item?.error)?.error || 'Redis REST rate limit returned an invalid response');
  }

  const count = Number(payload[0]?.result || 0);
  const ttlMs = Number(payload[2]?.result || windowMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowMs) / 1000));
  return {
    allowed: count <= max,
    retryAfterSeconds,
    count,
  };
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
    void (async () => {
      const rawIp = String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || 'unknown')
        .split(',')[0]
        .trim();
      const key = `tts:rate-limit:${options.keyPrefix || 'global'}:${rawIp}:${req.method}:${req.path}`;
      let decision: RateLimitDecision | null = null;

      try {
        decision = await redisRateLimitHit(key, options.windowMs, options.max);
      } catch {
        decision = null;
      }

      decision = decision || memoryRateLimitHit(bucket, key, options.windowMs, options.max);
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - decision.count)));

      if (!decision.allowed) {
        const retryAfterSeconds = decision.retryAfterSeconds;
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
        return;
      }

      next();
    })().catch(next);
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
