/**
 * Orchestration domain types for the PIX-to-Stellar Transfer Lifecycle Engine.
 */

// ─── States ──────────────────────────────────────────────────────────────────

export const TRANSFER_STATES = [
  'CREATED',
  'QUOTED',
  'PIX_CHARGE_ISSUED',
  'PIX_FUNDED',
  'CONVERTING',
  'STELLAR_SETTLED',
  'PAYOUT_ROUTING',
  'PAYOUT_INSTRUCTED',
  'RECONCILED',
  'QUOTE_EXPIRED',
  'PIX_EXPIRED',
  'FAILED',
  'REFUND_REQUIRED',
] as const;

export type TransferState = typeof TRANSFER_STATES[number];

export const TERMINAL_STATES: TransferState[] = ['RECONCILED', 'REFUND_REQUIRED'];
export const FAILURE_STATES: TransferState[] = ['QUOTE_EXPIRED', 'PIX_EXPIRED', 'FAILED', 'REFUND_REQUIRED'];

// ─── Actors ──────────────────────────────────────────────────────────────────

export type TransferActor =
  | 'whatsapp_bot'
  | 'telegram_bot'
  | 'api'
  | 'system'
  | 'webhook:etherfuse'
  | 'poller:stellar'
  | 'dashboard';

// ─── Event types ─────────────────────────────────────────────────────────────

export type TransferEventType =
  | 'transfer_created'
  | 'quote_attached'
  | 'pix_charge_issued'
  | 'pix_funding_confirmed'
  | 'conversion_started'
  | 'stellar_settled'
  | 'payout_routing_started'
  | 'payout_instructed'
  | 'reconciled'
  | 'quote_expired'
  | 'pix_expired'
  | 'failed'
  | 'refund_required'
  | 'idempotent_replay';

// ─── JSONB payloads ──────────────────────────────────────────────────────────

export interface SourceEndpoint {
  institution_type: string;
  masked_identifier: string;
}

export interface DestinationEndpoint {
  provider_type: string;
  country: string;
  masked_account: string;
  account_holder_name?: string;
}

export interface QuoteSnapshot {
  rate: string;
  fee_breakdown: FeeItem[];
  expires_at: string;
  quoted_at: string;
  source: string;
}

export interface FeeItem {
  label: string;
  amount: string;
  currency: 'BRL' | 'USD' | 'USDC';
  bps?: number;
}

export interface PixEvidence {
  charge_id: string;
  e2e_id?: string;
  txid?: string;
  paid_at?: string;
  payer_masked?: string;
  provider: 'etherfuse';
}

export interface StellarEvidence {
  tx_hash: string;
  ledger: number;
  network: 'testnet' | 'mainnet';
  settled_at: string;
  source_account_masked: string;
  asset: string;
  path_used: string[];
}

export interface PayoutEvidence {
  routing_status: string;
  provider_hint: string;
  reference_id?: string;
  same_name_check: SameNameCheck;
}

export interface SameNameCheck {
  expected: string;
  provided: string;
  passed: boolean;
}

export interface ReconciliationEvidence {
  amounts_match: boolean;
  fees_total: FeeItem[];
  discrepancies: string[];
  reconciled_at?: string;
  reconciled_by: 'system' | 'manual';
}

// ─── Core domain entities ────────────────────────────────────────────────────

export interface Transfer {
  id: string;
  public_ref: string;
  state: TransferState;
  state_version: number;

  source_endpoint: SourceEndpoint | null;
  destination_endpoint: DestinationEndpoint | null;

  amount_brl_in: string | null;
  amount_usdc_settled: string | null;
  amount_usd_out_expected: string | null;

  quote: QuoteSnapshot | null;
  pix: PixEvidence | null;
  stellar: StellarEvidence | null;
  payout: PayoutEvidence | null;
  reconciliation: ReconciliationEvidence | null;

  legacy_transfer_id: string | null;
  actor: Record<string, string>;
  failure_reason: string | null;

  created_at: string;
  updated_at: string;
}

export interface TransferEvent {
  id: string;
  transfer_id: string;
  from_state: TransferState | null;
  to_state: TransferState;
  event_type: TransferEventType;
  payload: Record<string, unknown>;
  actor: TransferActor;
  correlation_id: string | null;
  created_at: string;
}

// ─── Intent (API input) ──────────────────────────────────────────────────────

export interface CreateTransferIntent {
  amount_brl_in: string;
  source_endpoint: SourceEndpoint;
  destination_endpoint: DestinationEndpoint;
  actor?: TransferActor;
  correlation_id?: string;
  legacy_transfer_id?: string;
}

// ─── Transfer with events (for detail views) ─────────────────────────────────

export interface TransferWithEvents extends Transfer {
  events: TransferEvent[];
}
