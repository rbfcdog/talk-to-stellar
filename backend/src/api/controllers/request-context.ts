import crypto from 'crypto';
import { Request, Response } from 'express';

export type ApiRequestContext = {
  request_id: string;
  correlation_id: string;
};

function firstHeaderValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

export function readApiRequestContext(req: Request): ApiRequestContext {
  const requestId = firstHeaderValue(req.headers['x-request-id']) ||
    firstHeaderValue(req.headers['x-correlation-id']) ||
    `req_${crypto.randomUUID()}`;
  const correlationId = firstHeaderValue(req.headers['x-correlation-id']) || requestId;
  return {
    request_id: requestId,
    correlation_id: correlationId,
  };
}

export function applyApiRequestContext(res: Response, context: ApiRequestContext) {
  res.setHeader('X-Request-Id', context.request_id);
  res.setHeader('X-Correlation-Id', context.correlation_id);
}

export function responseContext(context: ApiRequestContext) {
  return {
    request_id: context.request_id,
    correlation_id: context.correlation_id,
  };
}
