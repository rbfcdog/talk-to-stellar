/**
 * Bridge.xyz API Type Definitions
 *
 * Bridge is a Stripe-owned stablecoin orchestration platform.
 * Base URL: https://api.bridge.xyz/v0
 *
 * @see https://apidocs.bridge.xyz
 */

// ── Common ──────────────────────────────────────────────────────────

export type KycStatus = 'pending' | 'approved' | 'rejected' | 'not_started' | 'update_required';

export type TransferState =
  | 'awaiting_funds'
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type VirtualAccountStatus = 'activated' | 'deactivated';

export type CustomerType = 'individual' | 'business';

export type PaymentRail =
  | 'ach'
  | 'ach_push'
  | 'ach_same_day'
  | 'wire'
  | 'fednow'
  | 'sepa'
  | 'spei'
  | 'pix'
  | 'faster_payments'
  | 'stellar'
  | 'ethereum'
  | 'solana'
  | 'polygon'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'bridge_wallet';

export type Currency = 'usd' | 'brl' | 'eur' | 'gbp' | 'mxn' | 'cop' | 'usdc' | 'usdt' | 'usdb' | 'eurc' | 'pyusd';

// ── Customer ────────────────────────────────────────────────────────

export interface BridgeCustomer {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  type: CustomerType;
  kyc_status: KycStatus;
  country?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerCreateInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  type: CustomerType;
  country?: string;
}

export interface CustomerUpdateInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  /** Brazilian CPF or non-BR passport/national_id */
  identifying_information?: IdentifyingInfo[];
  /** Base64-encoded selfie images */
  selfies?: string[];
}

export interface IdentifyingInfo {
  type: 'cpf' | 'cnpj' | 'passport' | 'national_id' | 'ein';
  value: string;
  issuing_country?: string;
  /** Base64-encoded government ID image */
  image_front?: string;
}

// ── Transfers ───────────────────────────────────────────────────────

export interface BridgeTransfer {
  id: string;
  state: TransferState;
  on_behalf_of: string;
  amount: string;
  developer_fee?: string;
  developer_fee_percent?: string;
  source: TransferEndpoint;
  destination: TransferEndpoint;
  source_deposit_instructions?: DepositInstructions;
  receipt?: TransferReceipt;
  created_at: string;
  updated_at: string;
}

export interface TransferEndpoint {
  payment_rail: PaymentRail;
  currency: Currency;
  amount?: string;
  address?: string;
  to_address?: string;
  from_address?: string;
  external_account_id?: string;
  bridge_wallet_id?: string;
  ach_reference?: string;
  wire_message?: string;
}

export interface TransferReceipt {
  initial_amount: string;
  developer_fee: string;
  exchange_fee?: string;
  final_amount: string;
  destination_tx_hash?: string;
}

export interface TransferCreateInput {
  amount?: string;
  on_behalf_of: string;
  developer_fee_percent?: string;
  source: TransferEndpoint;
  destination: TransferEndpoint;
}

export interface DepositInstructions {
  currency: Currency;
  bank_name?: string;
  bank_address?: string;
  bank_routing_number?: string;
  bank_account_number?: string;
  bank_beneficiary_name?: string;
  bank_beneficiary_address?: string;
  payment_rail: PaymentRail;
  payment_rails?: PaymentRail[];
  amount?: string;
  deposit_message?: string;
  /** PIX key for BRL deposits */
  pix_key?: string;
  /** PIX QR code (base64 or URL) */
  pix_qr_code?: string;
}

// ── Virtual Accounts ────────────────────────────────────────────────

export interface BridgeVirtualAccount {
  id: string;
  status: VirtualAccountStatus;
  customer_id: string;
  developer_fee_percent?: string;
  source_deposit_instructions: DepositInstructions;
  destination: TransferEndpoint;
  created_at: string;
  updated_at: string;
}

export interface VirtualAccountCreateInput {
  source: { currency: Currency };
  destination: TransferEndpoint;
  developer_fee_percent?: string;
}

// ── External Accounts ───────────────────────────────────────────────

export interface BridgeExternalAccount {
  id: string;
  customer_id: string;
  active: boolean;
  currency: Currency;
  account_type: 'us' | 'pix_key' | 'iban' | 'clabe';
  account_owner_type?: 'individual' | 'business';
  account_owner_name?: string;
  first_name?: string;
  last_name?: string;
  business_name?: string;
  bank_name?: string;
  account?: {
    last_4: string;
    routing_number: string;
    checking_or_savings?: 'checking' | 'savings';
  };
  pix_key?: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalAccountCreateInput {
  currency: Currency;
  account_type: 'us' | 'pix_key';
  /** PIX key (email, CPF, phone, or random) */
  pix_key?: string;
  /** US bank details */
  account_owner_type?: 'individual' | 'business';
  account_owner_name?: string;
  first_name?: string;
  last_name?: string;
  bank_name?: string;
  account_name?: string;
  account?: {
    routing_number: string;
    account_number: string;
    checking_or_savings: 'checking' | 'savings';
  };
  address?: {
    street_line_1: string;
    street_line_2?: string;
    country: string;
    state: string;
    city: string;
    postal_code: string;
  };
}

// ── Liquidation Addresses ───────────────────────────────────────────

export interface BridgeLiquidationAddress {
  id: string;
  customer_id: string;
  address: string;
  payment_rail: PaymentRail;
  currency: Currency;
  external_account_id?: string;
  custom_developer_fee_percent?: string;
  created_at: string;
  updated_at: string;
}

// ── KYC Links ───────────────────────────────────────────────────────

export interface BridgeKycLink {
  id: string;
  customer_id: string;
  url: string;
  status: KycStatus;
  created_at: string;
  expires_at: string;
}

// ── Exchange Rates ──────────────────────────────────────────────────

export interface BridgeExchangeRate {
  from_currency: Currency;
  to_currency: Currency;
  rate: string;
  timestamp: string;
}

// ── Webhook Events ──────────────────────────────────────────────────

export type BridgeWebhookEventType =
  | 'transfer.completed'
  | 'transfer.failed'
  | 'transfer.awaiting_funds'
  | 'virtual_account.deposit_received'
  | 'virtual_account.activated'
  | 'virtual_account.deactivated'
  | 'customer.kyc_approved'
  | 'customer.kyc_rejected';

export interface BridgeWebhookEvent {
  id: string;
  type: BridgeWebhookEventType;
  data: Record<string, unknown>;
  created_at: string;
}

// ── API Response Wrappers ───────────────────────────────────────────

export interface BridgeListResponse<T> {
  data: T[];
  has_more: boolean;
  starting_after?: string;
}

export interface BridgeApiError {
  status: number;
  error: string;
  message?: string;
  response?: unknown;
}
