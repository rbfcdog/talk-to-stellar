import { redactSensitive, safeRedactedJson } from './redaction';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readString(value: unknown): string {
  return String(value || '').trim();
}

function truncate(value: string, max = 3000): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function pickNestedMessage(value: unknown): string {
  if (!isObject(value)) return readString(value);
  const record = value as Record<string, unknown>;
  return readString(
    record.message ||
      record.error ||
      record.detail ||
      record.details ||
      (isObject(record.data) ? (record.data as Record<string, unknown>).message || (record.data as Record<string, unknown>).error : '') ||
      (isObject(record.body) ? (record.body as Record<string, unknown>).message || (record.body as Record<string, unknown>).error : ''),
  );
}

export function errorLogDetails(error: unknown): Record<string, unknown> {
  if (!isObject(error)) {
    return { value: readString(error) || 'Unknown error' };
  }

  const err = error as any;
  const details: Record<string, unknown> = {};

  if (error instanceof Error) {
    details.name = error.name;
    details.message = error.message;
  }

  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === 'stack') continue;
    const value = err[key];
    if (value === undefined || value === null || value === '') continue;
    details[key] = value;
  }

  const knownKeys = [
    'code',
    'status',
    'statusCode',
    'statusText',
    'message',
    'error',
    'errors',
    'detail',
    'details',
    'data',
    'body',
    'response',
    'cause',
  ];
  for (const key of knownKeys) {
    if (err[key] !== undefined && err[key] !== null && err[key] !== '') {
      details[key] = err[key];
    }
  }

  if (isObject(err.response)) {
    const response = err.response as Record<string, unknown>;
    details.response = {
      status: response.status,
      statusCode: response.statusCode,
      statusText: response.statusText,
      data: response.data,
      body: response.body,
      error: response.error,
      message: response.message,
    };
  }

  if (!Object.keys(details).length) {
    return { value: safeRedactedJson(error) };
  }
  return redactSensitive(details) as Record<string, unknown>;
}

export function errorLogMessage(error: unknown): string {
  if (error instanceof Error && error.message && error.message !== '[object Object]') {
    return truncate(error.message);
  }

  if (isObject(error)) {
    const err = error as any;
    const candidates = [
      err.message,
      err.error,
      err.detail,
      err.details,
      err.response?.data?.message,
      err.response?.data?.error,
      err.response?.body?.message,
      err.response?.body?.error,
      err.data?.message,
      err.data?.error,
      err.body?.message,
      err.body?.error,
      pickNestedMessage(err.response?.data),
      pickNestedMessage(err.response?.body),
    ];
    for (const candidate of candidates) {
      const text = readString(candidate);
      if (text && text !== '[object Object]') return truncate(text);
    }
  }

  const text = readString(error);
  if (text && text !== '[object Object]') return truncate(text);
  return truncate(safeRedactedJson(errorLogDetails(error)));
}

export function errorLogFields(error: unknown): Record<string, unknown> {
  const err = error as any;
  const details = errorLogDetails(error);
  const status = err?.statusCode || err?.status || err?.response?.status || err?.response?.statusCode;
  const code = err?.code || err?.response?.code || (isObject(details) ? details.code : undefined);
  return {
    error_code: code ? String(code) : undefined,
    status,
    error: errorLogMessage(error),
    error_details: details,
  };
}
