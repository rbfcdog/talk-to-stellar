export const INTERNATIONAL_TRANSFER_STATES = [
  'QUOTE_CREATED',
  'PIX_PENDING',
  'PIX_RECEIVED',
  'BRL_TO_USDC_PENDING',
  'USDC_SETTLEMENT_PENDING',
  'USDC_SETTLED',
  'PAYOUT_INSTRUCTION_CREATED',
  'PAYOUT_PENDING',
  'PAYOUT_COMPLETED',
  'FAILED',
  'REFUNDED',
] as const;

export type InternationalTransferState = typeof INTERNATIONAL_TRANSFER_STATES[number];
export type QuoteStatus = 'ACTIVE' | 'EXPIRED' | 'ACCEPTED' | 'CANCELLED';
export type SameNameMatchStatus = 'MATCHED' | 'MISMATCHED' | 'UNKNOWN';
export type PayoutProviderName = 'mock' | 'circle' | 'bridge' | 'etherfuse';
export type PayoutStatus = 'instruction_created' | 'pending' | 'completed' | 'failed' | 'cancelled';
export type QuoteSource = 'stellar_pathfinding' | 'etherfuse' | 'configured_fallback' | 'mock_sandbox';
export type QuoteProvenanceKind = 'live_path_quote' | 'etherfuse_quote' | 'configured_fallback' | 'mock_sandbox';

export type QuoteProvenance = {
  kind: QuoteProvenanceKind;
  label: string;
  source: string;
  fetched_at: string;
  live: boolean;
  sandbox: boolean;
  fallback: boolean;
  executable: boolean;
  details?: Record<string, unknown>;
};

export type CurrencyFee = {
  amount: string;
  currency: 'BRL' | 'USD' | 'USDC';
  bps?: number;
};

export type TransferFeeBreakdown = {
  platform_fee: CurrencyFee;
  estimated_provider_fee: CurrencyFee;
  total_fee: {
    amount_brl_equivalent: string;
    amount_usd_equivalent: string;
  };
};

export type IdentityProfile = {
  legal_name?: string;
  entity_name?: string;
  email?: string;
  tax_id?: string;
  country?: string;
  type?: 'individual' | 'business' | 'institution';
};

export type UsdBankDestination = {
  accountHolderName: string;
  accountHolderType: 'individual' | 'business';
  bankName?: string;
  routingNumber?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
  swiftBic?: string;
  iban?: string;
  country: string;
  providerLabel?: 'wise' | 'mercury' | 'revolut' | 'other';
};

export type InternationalTransferQuote = {
  quote_id: string;
  user_id?: string;
  institution_id?: string;
  source_currency: 'BRL';
  destination_currency: 'USD';
  brl_amount: string;
  estimated_usdc_amount: string;
  estimated_usd_amount: string;
  fx_rate: string;
  platform_fee: CurrencyFee;
  estimated_provider_fee: CurrencyFee;
  total_fee: TransferFeeBreakdown['total_fee'];
  expires_at: string;
  quote_status: QuoteStatus;
  quote_source: QuoteSource;
  provenance?: QuoteProvenance;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SettlementEvidence = {
  stellar_tx_hash: string;
  stellar_memo: string;
  stellar_source_account?: string;
  stellar_destination_account?: string;
  asset_code: string;
  asset_issuer?: string;
  amount: string;
  network: string;
  status: 'mocked' | 'submitted' | 'confirmed';
  execution_mode: 'mock' | 'testnet' | 'mainnet_validation';
  settled_at: string;
  metadata?: Record<string, unknown>;
};

export type PayoutInstruction = {
  payout_instruction_id: string;
  provider_name: PayoutProviderName;
  provider_payout_id: string;
  status: PayoutStatus;
  destination: UsdBankDestination;
  amount_usd: string;
  currency: 'USD';
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type InternationalTransfer = {
  transfer_id: string;
  quote_id: string;
  status: InternationalTransferState;
  user_id?: string;
  institution_id?: string;
  sender_identity: IdentityProfile;
  recipient_identity: IdentityProfile;
  brl_amount: string;
  quoted_usd_amount: string;
  fx_rate: string;
  fees: TransferFeeBreakdown;
  stellar_asset_code: string;
  stellar_asset_issuer?: string;
  stellar_tx_hash?: string;
  stellar_memo?: string;
  stellar_source_account?: string;
  stellar_destination_account?: string;
  payout_provider?: PayoutProviderName;
  payout_destination: UsdBankDestination;
  payout_instruction_id?: string;
  provider_payout_id?: string;
  payout_status?: PayoutStatus;
  pix_payment_id?: string;
  pix_order_id?: string;
  pix_status?: string;
  same_name_payout_required: boolean;
  same_name_match_status: SameNameMatchStatus;
  identity_risk_notes: string[];
  reconciliation_metadata: Record<string, unknown>;
  error_logs: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
  pix_received_at?: string;
  stellar_settled_at?: string;
  payout_completed_at?: string;
};

export type TransferReconciliation = {
  transfer_id: string;
  quote_id: string;
  pix_payment_id?: string;
  pix_order_id?: string;
  stellar_tx_hash?: string;
  stellar_memo?: string;
  payout_instruction_id?: string;
  provider_payout_id?: string;
  final_payout_status?: PayoutStatus;
  evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
