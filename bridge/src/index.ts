/**
 * Bridge.xyz Integration Module for TalkToStellar
 *
 * Stablecoin orchestration platform (Stripe-owned).
 * Provides PIX on/off-ramp, USD ACH, customer KYC, and more.
 *
 * @example
 * ```ts
 * import { getBridgeService } from './bridge';
 *
 * const bridge = getBridgeService();
 *
 * // PIX on-ramp: BRL → USDC on Stellar
 * const va = await bridge.createPixOnRamp(customerId, stellarAddress);
 *
 * // PIX off-ramp: USDC → BRL to PIX key
 * const transfer = await bridge.createPixOffRamp(customerId, stellarAddress, '100.00', externalAccountId);
 * ```
 */

export { BridgeClient } from './client';
export { loadBridgeConfig, validateBridgeConfig } from './config';
export type { BridgeConfig } from './config';
export { BridgeService, getBridgeService } from './service';
export type {
  BridgeApiError,
  BridgeCustomer,
  BridgeExchangeRate,
  BridgeExternalAccount,
  BridgeKycLink,
  BridgeLiquidationAddress,
  BridgeListResponse,
  BridgeTransfer,
  BridgeVirtualAccount,
  BridgeWebhookEvent,
  BridgeWebhookEventType,
  Currency,
  CustomerCreateInput,
  CustomerType,
  CustomerUpdateInput,
  DepositInstructions,
  ExternalAccountCreateInput,
  KycStatus,
  PaymentRail,
  TransferCreateInput,
  TransferState,
  VirtualAccountCreateInput,
} from './types';
