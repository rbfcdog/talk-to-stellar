/**
 * PagFinance API types.
 *
 * Every response uses the envelope `{ success, error, data }`. Error bodies
 * carry a stable `code` — route logic on HTTP status + code, never on the
 * (Portuguese) `error` message text.
 */

export type PagfinanceErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GONE'
  | 'SERVICE_UNAVAILABLE'
  | 'USER_NOT_FOUND'
  | 'USER_BLOCKED'
  | 'INSUFFICIENT_KYC'
  | 'QUOTE_PROCESSING'
  | string;

export class PagfinanceApiError extends Error {
  readonly status: number;
  readonly code: PagfinanceErrorCode;
  /** Seconds to wait before retrying (429 responses). */
  readonly retryAfter?: number;
  readonly response?: unknown;

  constructor(input: {
    status: number;
    code?: string;
    message?: string;
    retryAfter?: number;
    response?: unknown;
  }) {
    super(input.message || `PagFinance HTTP ${input.status}`);
    this.name = 'PagfinanceApiError';
    this.status = input.status;
    this.code = input.code || '';
    this.retryAfter = input.retryAfter;
    this.response = input.response;
  }
}

export interface PagfinanceEnvelope<T> {
  success: boolean;
  error: string | null;
  data: T;
}

export interface PagfinanceUser {
  uid: string;
  pubkey: string;
  partnerId: string;
  name?: string;
  email?: string;
  phone?: string;
  kycLevel: number;
  kycStatus: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'BLOCKED';
  createdAt?: string;
  updatedAt?: string;
}

export interface PagfinanceTokenData {
  token: string;
  expiresIn: string;
  tokenType: 'Bearer';
  user: Pick<PagfinanceUser, 'pubkey' | 'kycLevel' | 'kycStatus' | 'partnerId'>;
}

export interface CashinQuote {
  quoteId: string;
  expiresAt: string;
  ttlSeconds: number;
  valuesAndFees: {
    paymentInFiat: number;
    paymentInCrypto: number;
    totalFiat: number;
    totalCrypto: number;
    totalFeeFiat?: number;
    [key: string]: number | undefined;
  };
  priceContext?: Record<string, unknown>;
}

export interface CashinCustomer {
  name: string;
  taxID: string;
  email?: string;
  phone?: string;
}

export interface CreateCashinIntentInput {
  quoteId?: string;
  amount?: number;
  customer: CashinCustomer;
  expiresIn?: number;
  comment?: string;
  additionalInfo?: Array<{ key: string; value: string }>;
}

export interface CashinIntent {
  intentId: string;
  id?: string;
  correlationID?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | string;
  valueCents: number;
  brCode: string;
  qrCodeImage?: string;
  paymentLinkUrl?: string;
  expiresIn?: number;
  splitApplied?: boolean;
  splitValueCents?: number;
  quoteId?: string;
  cryptoEstimate?: number;
  createdAt?: string;
}

export interface CashinWebhookData {
  intentId: string;
  correlationID?: string;
  walletAddress: string;
  valueCents: number;
  transactionID?: string;
  splitApplied?: boolean;
  splitValueCents?: number;
  completedAt?: string;
}

export interface CashinWebhookEnvelope {
  event: 'CASHIN_COMPLETED' | string;
  intentId: string;
  status: string;
  timestamp: string;
  data: CashinWebhookData;
}

export interface WebhookConfig {
  url: string;
  events?: string[];
  headers?: Record<string, string>;
}

export interface PagfinanceUserProfile {
  name?: string;
  email?: string;
  phone?: string;
  taxId?: string;
}
