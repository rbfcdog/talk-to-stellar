export type JsonRecord = Record<string, any>;

export type TransferState =
  | "QUOTE_CREATED"
  | "PIX_PENDING"
  | "PIX_RECEIVED"
  | "BRL_TO_USDC_PENDING"
  | "USDC_SETTLEMENT_PENDING"
  | "USDC_SETTLED"
  | "PAYOUT_INSTRUCTION_CREATED"
  | "PAYOUT_PENDING"
  | "PAYOUT_COMPLETED"
  | "FAILED"
  | "REFUNDED";

export type WorkflowStep = {
  index: number;
  state: TransferState;
  label: string;
  phase: "quote" | "funding" | "settlement" | "payout" | "reconciliation";
  description: string;
  status: "completed" | "current" | "pending" | "failed" | "skipped";
};

export type WorkflowSnapshot = {
  schema_version: 1;
  generated_at: string;
  transfer_id: string;
  current_state: TransferState;
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
    status: "MATCHED" | "MISMATCHED" | "UNKNOWN";
    payout_allowed: boolean;
    risk_notes: string[];
  };
  next_action: {
    code: string;
    label: string;
    description: string;
    actor: string;
    requires_ops_authorization: boolean;
    blocked: boolean;
    blocked_reason?: string;
  };
  steps: WorkflowStep[];
};

export type ConsoleForm = {
  brlAmount: string;
  senderName: string;
  senderEmail: string;
  recipientName: string;
  accountHolderType: "individual" | "business";
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: "checking" | "savings";
  country: string;
  providerLabel: "wise" | "mercury" | "revolut" | "other";
  payoutProvider: "mock" | "etherfuse" | "circle" | "bridge";
  mockPix: boolean;
  runEtherfuseOffRamp: boolean;
  manualSessionId: string;
  manualSessionToken: string;
  walletPin: string;
  opsSecret: string;
};

export type ConsoleEvent = {
  id: string;
  at: string;
  title: string;
  detail: string;
  state: "running" | "ok" | "error" | "info";
  path?: string;
};

export type ApiLogEntry = {
  id: string;
  label: string;
  method: string;
  path: string;
  request_id?: string;
  correlation_id?: string;
  status?: number;
  duration_ms?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

export type RouteEconomics = {
  sourceBrl: number;
  fxRate: number;
  grossUsd: number;
  destinationUsd: number;
  platformFeeBrl: number;
  platformFeeUsd: number;
  onRampFeeBrl: number;
  onRampFeeUsd: number;
  offRampFeeBrl: number;
  offRampFeeUsd: number;
  totalFeeBrl: number;
  totalFeeUsd: number;
  retainedPct: number;
  feePct: number;
  feeVarianceUsd: number;
  metricsValid: boolean;
};

export type ConsoleTab = "overview" | "evidence" | "api";
