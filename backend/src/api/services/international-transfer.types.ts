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

export type TransferWorkflowStep = {
  index: number;
  state: InternationalTransferState;
  label: string;
  phase: 'quote' | 'funding' | 'settlement' | 'payout' | 'reconciliation';
  description: string;
  status: 'completed' | 'current' | 'pending' | 'failed' | 'skipped';
};

export type TransferWorkflowAction = {
  code:
    | 'create_pix_intent'
    | 'await_pix_confirmation'
    | 'settle_stellar'
    | 'create_payout_instruction'
    | 'refresh_payout_status'
    | 'resolve_identity_alignment'
    | 'manual_review'
    | 'export_evidence'
    | 'done';
  label: string;
  description: string;
  actor: 'application' | 'provider' | 'operator' | 'reviewer' | 'none';
  requires_ops_authorization: boolean;
  blocked: boolean;
  blocked_reason?: string;
};

export type TransferWorkflowSnapshot = {
  schema_version: 1;
  generated_at: string;
  transfer_id: string;
  current_state: InternationalTransferState;
  terminal: boolean;
  successful: boolean;
  progress: {
    completed_steps: number;
    total_steps: number;
    percent: number;
  };
  evidence: {
    quote: boolean;
    pix_intent: boolean;
    pix_confirmation: boolean;
    stellar_settlement: boolean;
    payout_instruction: boolean;
    reconciliation: boolean;
    ready_count: number;
    required_count: number;
  };
  identity_control: {
    required: boolean;
    status: SameNameMatchStatus;
    payout_allowed: boolean;
    risk_notes: string[];
  };
  next_action: TransferWorkflowAction;
  steps: TransferWorkflowStep[];
};

export type OrchestrationEvidenceState =
  | 'missing'
  | 'pending'
  | 'captured'
  | 'failed'
  | 'mock'
  | 'sandbox'
  | 'real_testnet'
  | 'real_mainnet';

export type TransferOrchestrationLogEntry = {
  step: string;
  state: string;
  status: 'pending' | 'completed' | 'failed' | 'replayed' | 'captured';
  at?: string;
  summary: string;
  references?: Record<string, unknown>;
};

export type TransferOrchestrationLog = {
  generated_at: string;
  transfer_id: string;
  quote_id: string;
  current_status: InternationalTransferState;
  correlation_id?: string;
  request_ids: string[];
  quote_provenance?: QuoteProvenance;
  evidence_status: Record<string, OrchestrationEvidenceState>;
  redaction: {
    applied: true;
    notes: string[];
  };
  destination: {
    account_holder_hash?: string;
    account_holder_type?: string;
    country?: string;
    provider_label?: string;
    bank_name?: string;
    account_number_last4?: string;
    routing_number_last4?: string;
  };
  timeline: TransferOrchestrationLogEntry[];
  reconciliation_summary: {
    available: boolean;
    metrics_valid?: boolean;
    final_payout_status?: PayoutStatus;
    stellar_tx_hash?: string;
    payout_instruction_id?: string;
  };
  next_action?: string;
  error_count: number;
  errors: Array<{
    at?: string;
    stage?: string;
    message: string;
  }>;
};

export type ReviewerEvidenceStatus = 'ready' | 'pending' | 'blocked';

export type ReviewerEvidenceChecklistItem = {
  id: 'repository' | 'dashboard_screenshot' | 'orchestration_logs' | 'transfer_record';
  label: string;
  status: ReviewerEvidenceStatus;
  artifact: string;
  detail: string;
};

export type ReviewerTransferRecord = {
  transfer_id: string;
  quote_id: string;
  status: InternationalTransferState;
  subject: {
    user_id_hash?: string;
    institution_id_hash?: string;
    sender_name_hash?: string;
    sender_email_hash?: string;
    sender_country?: string;
    sender_type?: string;
    recipient_name_hash?: string;
    recipient_country?: string;
    recipient_type?: string;
  };
  value: {
    source_amount_brl: string;
    quoted_destination_usd: string;
    fx_rate_brl_per_usd: string;
    fees: TransferFeeBreakdown;
  };
  pix_funding: {
    status?: string;
    order_reference_hash?: string;
    payment_reference_hash?: string;
    received_at?: string;
  };
  stellar_settlement: {
    asset_code: string;
    network?: string;
    execution_mode?: string;
    transaction_hash?: string;
    memo?: string;
    settled_at?: string;
  };
  payout: {
    provider?: string;
    instruction_id?: string;
    provider_reference_hash?: string;
    status?: string;
    destination: TransferOrchestrationLog['destination'];
  };
  controls: {
    same_name_required: boolean;
    same_name_status: SameNameMatchStatus;
    identity_risk_note_count: number;
  };
  reconciliation: {
    available: boolean;
    metrics_valid?: boolean;
    updated_at?: string;
  };
  timestamps: {
    created_at: string;
    updated_at: string;
    payout_completed_at?: string;
  };
  error_count: number;
};

export type TransferReviewerEvidence = {
  schema_version: 1;
  generated_at: string;
  transfer_id: string;
  submission: {
    title: 'PIX-to-Stellar Transfer Lifecycle Engine';
    week: 1;
    ready_count: number;
    required_count: 4;
    status: 'ready' | 'pending';
  };
  repository: {
    url: string;
    branch: 'main';
    evidence_map_path: string;
  };
  dashboard: {
    path: '/institution-settlement';
    screenshot_target: string;
  };
  privacy: {
    redaction_applied: true;
    amounts_redacted: false;
    notes: string[];
  };
  checklist: ReviewerEvidenceChecklistItem[];
  transfer_record: ReviewerTransferRecord;
  orchestration_log: TransferOrchestrationLog;
  workflow?: TransferWorkflowSnapshot;
};
