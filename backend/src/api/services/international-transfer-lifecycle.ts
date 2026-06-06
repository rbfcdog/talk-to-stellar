import {
  InternationalTransfer,
  InternationalTransferState,
  TransferReconciliation,
  TransferWorkflowAction,
  TransferWorkflowSnapshot,
  TransferWorkflowStep,
} from './international-transfer.types';

export const INTERNATIONAL_TRANSFER_LIFECYCLE: ReadonlyArray<{
  state: InternationalTransferState;
  label: string;
  phase: TransferWorkflowStep['phase'];
  description: string;
}> = [
  {
    state: 'QUOTE_CREATED',
    label: 'Route accepted',
    phase: 'quote',
    description: 'The BRL/USD quote is attached to a persisted transfer record.',
  },
  {
    state: 'PIX_PENDING',
    label: 'PIX funding pending',
    phase: 'funding',
    description: 'The funding intent exists and waits for the source payment event.',
  },
  {
    state: 'PIX_RECEIVED',
    label: 'PIX funding received',
    phase: 'funding',
    description: 'The source payment is confirmed and eligible for settlement.',
  },
  {
    state: 'BRL_TO_USDC_PENDING',
    label: 'BRL to USDC prepared',
    phase: 'settlement',
    description: 'The route is preparing the USDC exposure used by the Stellar leg.',
  },
  {
    state: 'USDC_SETTLEMENT_PENDING',
    label: 'Stellar settlement pending',
    phase: 'settlement',
    description: 'The Stellar transaction is being prepared or submitted.',
  },
  {
    state: 'USDC_SETTLED',
    label: 'USDC settled',
    phase: 'settlement',
    description: 'Stellar settlement evidence is attached to the transfer.',
  },
  {
    state: 'PAYOUT_INSTRUCTION_CREATED',
    label: 'Payout instruction created',
    phase: 'payout',
    description: 'The destination adapter has created a payout instruction.',
  },
  {
    state: 'PAYOUT_PENDING',
    label: 'Payout pending',
    phase: 'payout',
    description: 'The destination provider is processing the payout instruction.',
  },
  {
    state: 'PAYOUT_COMPLETED',
    label: 'Route completed',
    phase: 'reconciliation',
    description: 'The route reached terminal success and is ready for evidence export.',
  },
] as const;

const STATE_RANK = new Map(
  INTERNATIONAL_TRANSFER_LIFECYCLE.map((step, index) => [step.state, index]),
);

export function transferStateRank(state: InternationalTransferState): number {
  return STATE_RANK.get(state) ?? -1;
}

export function hasReachedTransferState(
  state: InternationalTransferState,
  target: InternationalTransferState,
): boolean {
  const current = transferStateRank(state);
  const expected = transferStateRank(target);
  return current >= 0 && expected >= 0 && current >= expected;
}

export function transferNextAction(transfer: InternationalTransfer): TransferWorkflowAction {
  const sameNameBlocked = transfer.same_name_payout_required &&
    transfer.same_name_match_status !== 'MATCHED' &&
    hasReachedTransferState(transfer.status, 'USDC_SETTLED');

  if (sameNameBlocked) {
    return {
      code: 'resolve_identity_alignment',
      label: 'Resolve same-name payout alignment',
      description: 'The payout cannot be created until the destination account holder matches the verified route identity.',
      actor: 'operator',
      requires_ops_authorization: true,
      blocked: true,
      blocked_reason: `Same-name status is ${transfer.same_name_match_status}.`,
    };
  }

  switch (transfer.status) {
    case 'QUOTE_CREATED':
      return {
        code: 'create_pix_intent',
        label: 'Create PIX funding intent',
        description: 'Create a payment-backed PIX intent and attach its provider reference.',
        actor: 'application',
        requires_ops_authorization: false,
        blocked: false,
      };
    case 'PIX_PENDING':
      return {
        code: 'await_pix_confirmation',
        label: 'Wait for PIX confirmation',
        description: 'The next state must come from the provider funding event.',
        actor: 'provider',
        requires_ops_authorization: false,
        blocked: false,
      };
    case 'PIX_RECEIVED':
    case 'BRL_TO_USDC_PENDING':
    case 'USDC_SETTLEMENT_PENDING':
      return {
        code: 'settle_stellar',
        label: 'Settle USDC on Stellar',
        description: 'Submit or verify the configured Stellar settlement and persist its evidence.',
        actor: 'operator',
        requires_ops_authorization: true,
        blocked: false,
      };
    case 'USDC_SETTLED':
      return {
        code: 'create_payout_instruction',
        label: 'Create payout instruction',
        description: 'Route the settled value into the configured destination adapter.',
        actor: 'operator',
        requires_ops_authorization: true,
        blocked: false,
      };
    case 'PAYOUT_INSTRUCTION_CREATED':
    case 'PAYOUT_PENDING':
      return {
        code: 'refresh_payout_status',
        label: 'Refresh payout status',
        description: 'Poll the destination adapter and persist the latest provider state.',
        actor: 'operator',
        requires_ops_authorization: true,
        blocked: false,
      };
    case 'FAILED':
      return {
        code: 'manual_review',
        label: 'Review failure and refund path',
        description: 'Inspect the recorded failure before retrying or moving the transfer to refund.',
      actor: 'operator',
      requires_ops_authorization: true,
      blocked: true,
      blocked_reason: 'The transfer has recorded failure evidence. Inspect the redacted orchestration log before retry or refund.',
      };
    case 'REFUNDED':
      return {
        code: 'done',
        label: 'Refund complete',
        description: 'The transfer is closed in a terminal refund state.',
        actor: 'none',
        requires_ops_authorization: false,
        blocked: false,
      };
    case 'PAYOUT_COMPLETED':
    default:
      return {
        code: 'export_evidence',
        label: 'Export reviewer evidence',
        description: 'Capture the reviewer package, reconciliation JSON, logs, and settlement references.',
        actor: 'reviewer',
        requires_ops_authorization: false,
        blocked: false,
      };
  }
}

function stepStatus(
  transfer: InternationalTransfer,
  stepState: InternationalTransferState,
): TransferWorkflowStep['status'] {
  if (transfer.status === 'FAILED') {
    const failedAt = transferStateRank(
      String(transfer.error_logs?.at(-1)?.stage || '').includes('payout')
        ? 'PAYOUT_PENDING'
        : String(transfer.error_logs?.at(-1)?.stage || '').includes('stellar')
          ? 'USDC_SETTLEMENT_PENDING'
          : String(transfer.error_logs?.at(-1)?.stage || '').includes('pix')
            ? 'PIX_PENDING'
            : 'QUOTE_CREATED',
    );
    const stepRank = transferStateRank(stepState);
    if (stepRank < failedAt) return 'completed';
    if (stepRank === failedAt) return 'failed';
    return 'pending';
  }
  if (transfer.status === 'REFUNDED') return 'skipped';

  const currentRank = transferStateRank(transfer.status);
  const stepRank = transferStateRank(stepState);
  if (stepRank < currentRank) return 'completed';
  if (stepRank === currentRank) return transfer.status === 'PAYOUT_COMPLETED' ? 'completed' : 'current';
  return 'pending';
}

export function buildTransferWorkflowSnapshot(input: {
  transfer: InternationalTransfer;
  reconciliation?: TransferReconciliation | null;
}): TransferWorkflowSnapshot {
  const { transfer } = input;
  const reconciliation = input.reconciliation || null;
  const metadata = transfer.reconciliation_metadata || {};
  const settlement = metadata.stellar_settlement as Record<string, unknown> | undefined;
  const payout = metadata.payout_instruction as Record<string, unknown> | undefined;
  const steps = INTERNATIONAL_TRANSFER_LIFECYCLE.map((definition, index) => ({
    ...definition,
    index,
    status: stepStatus(transfer, definition.state),
  }));
  const completed = steps.filter((step) => step.status === 'completed').length;
  const evidence = {
    quote: Boolean(transfer.quote_id),
    pix_intent: Boolean(transfer.pix_order_id || transfer.pix_payment_id),
    pix_confirmation: Boolean(transfer.pix_received_at || hasReachedTransferState(transfer.status, 'PIX_RECEIVED')),
    stellar_settlement: Boolean(transfer.stellar_tx_hash || settlement?.stellar_tx_hash),
    payout_instruction: Boolean(transfer.payout_instruction_id || payout?.payout_instruction_id),
    reconciliation: Boolean(reconciliation),
  };
  const evidenceReady = Object.values(evidence).filter(Boolean).length;

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    transfer_id: transfer.transfer_id,
    current_state: transfer.status,
    terminal: transfer.status === 'PAYOUT_COMPLETED' || transfer.status === 'FAILED' || transfer.status === 'REFUNDED',
    successful: transfer.status === 'PAYOUT_COMPLETED',
    progress: {
      completed_steps: completed,
      total_steps: steps.length,
      percent: Math.round((completed / steps.length) * 100),
    },
    evidence: {
      ...evidence,
      ready_count: evidenceReady,
      required_count: Object.keys(evidence).length,
    },
    identity_control: {
      required: transfer.same_name_payout_required,
      status: transfer.same_name_match_status,
      payout_allowed: !transfer.same_name_payout_required || transfer.same_name_match_status === 'MATCHED',
      risk_notes: transfer.identity_risk_notes || [],
    },
    next_action: transferNextAction(transfer),
    steps,
  };
}
