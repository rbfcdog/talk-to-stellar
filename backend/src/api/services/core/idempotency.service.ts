import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../../../config/supabase';
import { logger } from '../../../utils/logger';
import { normalizeHumanAmountText } from '../../../utils/amount';
import { redactSensitive } from '../../../utils/redaction';

type IdempotencyStatus = 'processing' | 'completed' | 'failed';

type IdempotencyRow = {
  idempotency_key: string;
  request_hash: string;
  method: string;
  route: string;
  status: IdempotencyStatus;
  response_status?: number | null;
  response_body?: any;
  session_id?: string | null;
  user_id?: string | null;
  locked_at?: string | null;
  updated_at?: string | null;
};

function getProcessingTtlSeconds(): number {
  const parsed = Number(String(process.env.IDEMPOTENCY_PROCESSING_TTL_SECONDS || '120').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 120;
  return Math.trunc(parsed);
}

function isProcessingLockStale(row: IdempotencyRow): boolean {
  const ttlMs = getProcessingTtlSeconds() * 1000;
  const lockAtRaw = String(row.locked_at || row.updated_at || '').trim();
  const lockAtMs = Date.parse(lockAtRaw);
  if (!Number.isFinite(lockAtMs)) return false;
  return Date.now() - lockAtMs > ttlMs;
}

function normalizeForHash(value: any): any {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, any>, key) => {
        acc[key] = normalizeForHash(value[key]);
        return acc;
      }, {});
  }
  return value;
}

export function stableHash(value: any): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizeForHash(value)))
    .digest('hex');
}

export function buildOperationFingerprint(input: {
  sourceSessionId?: string | null;
  sourceUserId?: string | null;
  destination?: string | null;
  amount?: string | number | null;
  assetCode?: string | null;
  tokenHash?: string | null;
  operationType?: string | null;
  quoteId?: string | null;
  invoiceId?: string | number | null;
}): string {
  return stableHash({
    sourceSessionId: input.sourceSessionId || '',
    sourceUserId: input.sourceUserId || '',
    destination: String(input.destination || '').trim(),
    amount: normalizeHumanAmountText(input.amount),
    assetCode: String(input.assetCode || '').trim().toUpperCase(),
    tokenHash: input.tokenHash || '',
    operationType: String(input.operationType || '').trim().toUpperCase(),
    quoteId: input.quoteId || '',
    invoiceId: input.invoiceId || '',
  });
}

function extractSessionId(req: Request): string | null {
  return String(req.body?.session_id || req.body?.sessionId || req.query?.session_id || req.params?.session_id || '').trim() || null;
}

function extractUserId(req: Request): string | null {
  return String(req.body?.user_id || req.body?.userId || req.query?.user_id || '').trim() || null;
}

function responsePayloadFromSend(body: any): any {
  if (body === undefined) return null;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function idempotencyRoute(req: Request): string {
  return String(req.originalUrl || req.url || '').split('?')[0];
}

function scopedStorageKey(req: Request, rawKey: string): string {
  return stableHash({
    key: rawKey,
    method: req.method.toUpperCase(),
    route: idempotencyRoute(req),
    sessionId: extractSessionId(req) || '',
    userId: extractUserId(req) || '',
  });
}

function shouldMinimizeStoredResponse(req: Request): boolean {
  const route = idempotencyRoute(req);
  return (
    route.startsWith('/api/passkeys') ||
    route.startsWith('/api/security') ||
    route.startsWith('/api/ramp') ||
    route === '/api/agent/login' ||
    route === '/api/agent/logout' ||
    route === '/api/external/finalize' ||
    route === '/api/external/link-existing' ||
    route === '/api/external/link-session' ||
    route === '/api/external/recovery-init' ||
    route === '/api/external/recovery-complete'
  );
}

function storedResponseBody(req: Request, statusCode: number, body: any): any {
  const redacted = redactSensitive(body);
  if (!shouldMinimizeStoredResponse(req)) return redacted;

  const message = typeof redacted === 'object' && redacted && 'message' in (redacted as any)
    ? String((redacted as any).message || '')
    : undefined;
  const error = typeof redacted === 'object' && redacted && 'error' in (redacted as any)
    ? String((redacted as any).error || '')
    : undefined;

  return {
    success: statusCode < 400 && !(typeof redacted === 'object' && redacted && (redacted as any).success === false),
    idempotency_response_redacted: true,
    ...(message ? { message } : {}),
    ...(error ? { error } : {}),
  };
}

export class IdempotencyService {
  static buildRequestHash(req: Request): string {
    return stableHash({
      method: req.method.toUpperCase(),
      route: req.originalUrl.split('?')[0],
      query: req.query || {},
      body: req.body || {},
    });
  }

  static async begin(req: Request, key: string): Promise<{ replay?: IdempotencyRow; conflict?: string; active?: boolean }> {
    const requestHash = this.buildRequestHash(req);
    const route = req.originalUrl.split('?')[0];
    const now = new Date().toISOString();
    const row = {
      idempotency_key: key,
      request_hash: requestHash,
      method: req.method.toUpperCase(),
      route,
      status: 'processing',
      session_id: extractSessionId(req),
      user_id: extractUserId(req),
      locked_at: now,
      created_at: now,
      updated_at: now,
    };

    const inserted = await supabase
      .from('idempotency_keys')
      .insert(row)
      .select('*')
      .single();

    if (!inserted.error) return { active: true };

    if (String((inserted.error as any)?.code || '') !== '23505') {
      throw inserted.error;
    }

    const { data: existing, error: existingError } = await supabase
      .from('idempotency_keys')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return { conflict: 'Chave de idempotência em estado inconsistente.' };

    const existingRow = existing as IdempotencyRow;
    if (existingRow.status === 'failed') {
      const retryAt = new Date().toISOString();
      const { data: retried, error: retryError } = await supabase
        .from('idempotency_keys')
        .update({
          request_hash: requestHash,
          method: req.method.toUpperCase(),
          route,
          status: 'processing',
          response_status: null,
          response_body: null,
          completed_at: null,
          locked_at: retryAt,
          updated_at: retryAt,
        })
        .eq('idempotency_key', key)
        .eq('status', 'failed')
        .select('idempotency_key')
        .limit(1)
        .maybeSingle();

      if (retryError) throw retryError;
      if (retried) return { active: true };
    }

    if (existingRow.request_hash !== requestHash) {
      return { conflict: 'Este link expirou ou ja foi usado. Gere um novo link para continuar.' };
    }

    if (existingRow.status === 'completed') {
      return { replay: existingRow };
    }

    if (isProcessingLockStale(existingRow)) {
      const takeoverAt = new Date().toISOString();
      const { data: reclaimed, error: reclaimError } = await supabase
        .from('idempotency_keys')
        .update({
          status: 'processing',
          response_status: null,
          response_body: null,
          completed_at: null,
          locked_at: takeoverAt,
          updated_at: takeoverAt,
        })
        .eq('idempotency_key', key)
        .eq('status', 'processing')
        .eq('request_hash', requestHash)
        .eq('locked_at', existingRow.locked_at || null)
        .select('idempotency_key')
        .limit(1)
        .maybeSingle();

      if (reclaimError) throw reclaimError;
      if (reclaimed) return { active: true };
    }

    return { conflict: 'Requisição idempotente já está em processamento.' };
  }

  static async complete(key: string, statusCode: number, responseBody: any): Promise<void> {
    const status: IdempotencyStatus = statusCode >= 400 ? 'failed' : 'completed';
    const { error } = await supabase
      .from('idempotency_keys')
      .update({
        status,
        response_status: statusCode,
        response_body: responseBody,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('idempotency_key', key);

    if (error) {
      logger.warn(`[idempotency] failed to persist response for ${key}: ${error.message}`);
    }
  }
}

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    return next();
  }

  const rawKey = String(req.header('Idempotency-Key') || '').trim();
  if (!rawKey) {
    return next();
  }
  const key = scopedStorageKey(req, rawKey);

  try {
    const begin = await IdempotencyService.begin(req, key);
    if (begin.replay) {
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(begin.replay.response_status || 200).json(begin.replay.response_body || {});
    }
    if (begin.conflict) {
      return res.status(409).json({ success: false, message: begin.conflict });
    }

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    let captured = false;

    res.json = ((body: any) => {
      if (!captured) {
        captured = true;
        void IdempotencyService.complete(key, res.statusCode, storedResponseBody(req, res.statusCode, body));
      }
      return originalJson(body);
    }) as any;

    res.send = ((body: any) => {
      if (!captured) {
        captured = true;
        const payload = responsePayloadFromSend(body);
        void IdempotencyService.complete(key, res.statusCode, storedResponseBody(req, res.statusCode, payload));
      }
      return originalSend(body);
    }) as any;

    return next();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[idempotency] middleware failed: ${message}`);
    return res.status(500).json({ success: false, message: 'Falha no controle de idempotência.' });
  }
}
