export class InternationalTransferError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'InternationalTransferError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function transferValidationError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return new InternationalTransferError(code, message, 400, details);
}

export function transferConflictError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return new InternationalTransferError(code, message, 409, details);
}

export function transferNotFoundError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return new InternationalTransferError(code, message, 404, details);
}
