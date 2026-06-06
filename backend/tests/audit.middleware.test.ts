import { NextFunction, Response } from 'express';
import { AuditRequest, auditMiddleware } from '../src/api/middlewares/audit.middleware';

function request(headers: Record<string, string> = {}, query: Record<string, unknown> = {}): AuditRequest {
  return {
    query,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as AuditRequest;
}

describe('audit middleware', () => {
  it('captures explicit session context', () => {
    const req = request({
      'x-session-id': 'session-1',
      'user-agent': 'test-agent',
    });
    const next = jest.fn() as NextFunction;

    auditMiddleware(req, {} as Response, next);

    expect(req).toMatchObject({
      auditSession: 'session-1',
      auditUserAgent: 'test-agent',
      auditIpAddress: '127.0.0.1',
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('never persists an authorization credential as the audit session ID', () => {
    const req = request({ authorization: 'Bearer secret-token' });
    const next = jest.fn() as NextFunction;

    auditMiddleware(req, {} as Response, next);

    expect(req.auditSession).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
