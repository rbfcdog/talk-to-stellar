/**
 * SEP-24 Interactive Anchor Type Definitions
 *
 * Implements Stellar Ecosystem Proposals:
 *   SEP-1  — Stellar TOML (anchor metadata)
 *   SEP-10 — Stellar Web Authentication (challenge/transaction)
 *   SEP-24 — Hosted Deposit and Withdrawal (interactive flow)
 */

// ── SEP-1 TOML ─────────────────────────────────────────────────────

export interface StellarToml {
  ACCOUNTS?: string[];
  VERSION?: string;
  NETWORK_PASSPHRASE?: string;
  TRANSFER_SERVER?: string; // SEP-6
  TRANSFER_SERVER_SEP0024?: string; // SEP-24
  WEB_AUTH_ENDPOINT?: string; // SEP-10
  KYC_SERVER?: string; // SEP-12
  DOCUMENTATION?: Record<string, string>;
  CURRENCIES?: TomlCurrency[];
  SIGNING_KEY?: string;
}

export interface TomlCurrency {
  code: string;
  issuer?: string;
  status?: string;
  is_asset_anchored?: boolean;
  anchor_asset_type?: string;
  anchor_asset?: string;
  deposit?: boolean;
  withdraw?: boolean;
  deposit_fee_fixed?: number;
  deposit_fee_percent?: number;
  withdrawal_fee_fixed?: number;
  withdrawal_fee_percent?: number;
  min_amount?: number;
  max_amount?: number;
  name?: string;
  desc?: string;
}

// ── SEP-10 Auth ─────────────────────────────────────────────────────

export interface Sep10ChallengeResponse {
  transaction: string;
  network_passphrase: string;
}

export interface Sep10TokenResponse {
  token: string;
}

// ── SEP-24 Transaction ──────────────────────────────────────────────

export type Sep24Kind = 'deposit' | 'withdrawal';
export type Sep24Status =
  | 'incomplete'
  | 'pending_user_transfer_start'
  | 'pending_anchor'
  | 'pending_external'
  | 'pending_stellar'
  | 'pending_trust'
  | 'pending_user'
  | 'completed'
  | 'refunded'
  | 'expired'
  | 'no_market'
  | 'too_small'
  | 'too_large'
  | 'error';

export interface Sep24Transaction {
  id: string;
  kind: Sep24Kind;
  status: Sep24Status;
  status_eta?: number;
  more_info_url?: string;
  amount_in?: string;
  amount_in_asset?: string;
  amount_out?: string;
  amount_out_asset?: string;
  amount_fee?: string;
  amount_fee_asset?: string;
  from?: string;
  to?: string;
  external_extra?: string;
  external_extra_text?: string;
  deposit_memo?: string;
  deposit_memo_type?: string;
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  message?: string;
  refunded?: boolean;
  claimable_balance_id?: string;
  started_at: string;
  completed_at?: string;
}

export interface Sep24InteractiveResponse {
  type: 'interactive_customer_info_needed';
  url: string;
  id: string;
}

export interface Sep24TransactionsResponse {
  transactions: Sep24Transaction[];
}

export interface Sep24TransactionResponse {
  transaction: Sep24Transaction;
}

export interface Sep24InfoAsset {
  enabled: boolean;
  fee_fixed?: number;
  fee_percent?: number;
  min_amount?: number;
  max_amount?: number;
}

export interface Sep24InfoResponse {
  deposit: Record<string, Sep24InfoAsset>;
  withdraw: Record<string, Sep24InfoAsset>;
  fee: { enabled: boolean };
  features: { account_creation: boolean; claimable_balances: boolean };
}

// ── Anchor Session (our DB) ─────────────────────────────────────────

export interface AnchorSession {
  id: string;
  user_stellar_address: string;
  anchor_domain: string;
  jwt_token: string;
  expires_at: string;
  created_at: string;
}

export interface AnchorTransaction {
  id: string;
  session_id: string;
  sep24_transaction_id: string;
  anchor_domain: string;
  user_stellar_address: string;
  kind: Sep24Kind;
  asset_code: string;
  status: Sep24Status;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  interactive_url?: string;
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  started_at: string;
  completed_at?: string;
  last_synced_at: string;
  raw_response: Record<string, unknown>;
}

// ── Known Anchors ───────────────────────────────────────────────────

export interface KnownAnchor {
  name: string;
  domain: string;
  description: string;
  assets: string[];
  countries?: string[];
}
