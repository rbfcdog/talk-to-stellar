import { InternationalTransferState } from './international-transfer.types';
import { transferConflictError } from './international-transfer.errors';

const ALLOWED_TRANSITIONS: Record<InternationalTransferState, InternationalTransferState[]> = {
  QUOTE_CREATED: ['PIX_PENDING', 'FAILED', 'REFUNDED'],
  PIX_PENDING: ['PIX_RECEIVED', 'FAILED', 'REFUNDED'],
  PIX_RECEIVED: ['BRL_TO_USDC_PENDING', 'FAILED', 'REFUNDED'],
  BRL_TO_USDC_PENDING: ['USDC_SETTLEMENT_PENDING', 'FAILED', 'REFUNDED'],
  USDC_SETTLEMENT_PENDING: ['USDC_SETTLED', 'FAILED', 'REFUNDED'],
  USDC_SETTLED: ['PAYOUT_INSTRUCTION_CREATED', 'FAILED', 'REFUNDED'],
  PAYOUT_INSTRUCTION_CREATED: ['PAYOUT_PENDING', 'PAYOUT_COMPLETED', 'FAILED', 'REFUNDED'],
  PAYOUT_PENDING: ['PAYOUT_COMPLETED', 'FAILED', 'REFUNDED'],
  PAYOUT_COMPLETED: [],
  FAILED: ['REFUNDED'],
  REFUNDED: [],
};

export class InternationalTransferStateMachine {
  static canTransition(from: InternationalTransferState, to: InternationalTransferState): boolean {
    if (from === to) return true;
    return ALLOWED_TRANSITIONS[from]?.includes(to) || false;
  }

  static assertTransition(from: InternationalTransferState, to: InternationalTransferState) {
    if (!this.canTransition(from, to)) {
      throw transferConflictError(
        'invalid_transfer_transition',
        `Invalid international transfer state transition: ${from} -> ${to}`,
        { from, to, allowed: this.nextAllowedStates(from) },
      );
    }
  }

  static nextAllowedStates(from: InternationalTransferState): InternationalTransferState[] {
    return [...(ALLOWED_TRANSITIONS[from] || [])];
  }
}
