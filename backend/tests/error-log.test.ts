import { errorLogFields, errorLogMessage } from '../src/utils/error-log';

describe('error log serialization', () => {
  it('serializes plain object errors without [object Object]', () => {
    const error = {
      status: 400,
      response: {
        status: 400,
        data: {
          message: 'Vault asset mismatch',
          secret: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
      },
    };

    expect(errorLogMessage(error)).toBe('Vault asset mismatch');
    const fields = errorLogFields(error);
    expect(fields.error).toBe('Vault asset mismatch');
    expect(fields.status).toBe(400);
    expect(JSON.stringify(fields)).not.toContain('[object Object]');
    expect(JSON.stringify(fields)).not.toContain('SAAAAAAAA');
  });

  it('keeps useful properties from Error subclasses', () => {
    const error = new Error('Request failed') as Error & { code?: string; response?: unknown };
    error.code = 'BAD_REQUEST';
    error.response = { status: 400, data: { error: 'invalid caller' } };

    const fields = errorLogFields(error);
    expect(fields.error).toBe('Request failed');
    expect(fields.error_code).toBe('BAD_REQUEST');
    expect(fields.status).toBe(400);
    expect(JSON.stringify(fields)).toContain('invalid caller');
  });
});
