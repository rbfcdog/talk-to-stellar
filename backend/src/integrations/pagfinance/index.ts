/**
 * PagFinance integration — Pix cash-in (Pix → USDC credit on Stellar).
 *
 * Usage:
 *   import { getPagfinanceService } from '../../integrations/pagfinance';
 *   const pagfinance = getPagfinanceService();
 *   if (pagfinance.enabled) {
 *     const intent = await pagfinance.createIntent(pubkey, input, key);
 *   }
 *
 * PagFinance handles the fiat leg only (Pix charge + confirmation webhook).
 * USDC crediting is OUR responsibility after CASHIN_COMPLETED (see credit.ts).
 */

export { loadPagfinanceConfig, validatePagfinanceConfig } from './config';
export type { PagfinanceConfig } from './config';
export { PagfinanceClient } from './client';
export { PagfinanceService, getPagfinanceService, initPagfinanceService } from './service';
export {
  creditUsdcToUser,
  ensureUsdcTrustlineForCredit,
  resolveCreditDestination,
  resolveTreasurySecret,
  validateCreditReadiness,
} from './credit';
export type { CreditDestination, CreditDestinationResult, CreditResult } from './credit';
export {
  buildAuthorizationHeader,
  canonicalString,
  deriveSigningKey,
  hashBody,
  signCanonical,
  verifyWebhookSignature,
} from './hmac';
export * from './types';
