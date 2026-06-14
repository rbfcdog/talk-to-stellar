/**
 * State machine for PIX-to-Stellar transfer lifecycle.
 * Single source of truth for all legal state transitions.
 */

import { TransferState, TRANSFER_STATES } from './types';

const ALLOWED_TRANSITIONS: Record<TransferState, TransferState[]> = {
  CREATED:              ['QUOTED', 'QUOTE_EXPIRED', 'FAILED'],
  QUOTED:               ['PIX_CHARGE_ISSUED', 'QUOTE_EXPIRED', 'FAILED'],
  PIX_CHARGE_ISSUED:    ['PIX_FUNDED', 'PIX_EXPIRED', 'FAILED'],
  PIX_FUNDED:           ['CONVERTING', 'FAILED'],
  CONVERTING:           ['STELLAR_SETTLED', 'FAILED'],
  STELLAR_SETTLED:      ['PAYOUT_ROUTING', 'FAILED'],
  PAYOUT_ROUTING:       ['PAYOUT_INSTRUCTED', 'FAILED'],
  PAYOUT_INSTRUCTED:    ['RECONCILED', 'REFUND_REQUIRED', 'FAILED'],
  RECONCILED:           [],
  QUOTE_EXPIRED:        ['FAILED'],
  PIX_EXPIRED:          ['FAILED'],
  FAILED:               ['REFUND_REQUIRED'],
  REFUND_REQUIRED:      [],
};

const TERMINAL_STATES: TransferState[] = ['RECONCILED', 'REFUND_REQUIRED'];

export class IllegalTransitionError extends Error {
  constructor(
    public readonly fromState: TransferState,
    public readonly toState: TransferState,
    public readonly allowed: TransferState[],
  ) {
    super(`Illegal transfer state transition: ${fromState} → ${toState}. Allowed: [${allowed.join(', ')}]`);
    this.name = 'IllegalTransitionError';
  }
}

export class TransferStateMachine {
  static ALLOWED = ALLOWED_TRANSITIONS;
  static TERMINAL = TERMINAL_STATES;
  static STATES = TRANSFER_STATES;

  static canTransition(from: TransferState, to: TransferState): boolean {
    return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransition(from: TransferState, to: TransferState): void {
    if (!this.canTransition(from, to)) {
      throw new IllegalTransitionError(from, to, this.nextAllowed(from));
    }
  }

  static nextAllowed(from: TransferState): TransferState[] {
    return [...(ALLOWED_TRANSITIONS[from] || [])];
  }

  static isTerminal(state: TransferState): boolean {
    return TERMINAL_STATES.includes(state);
  }

  static isFailure(state: TransferState): boolean {
    return ['QUOTE_EXPIRED', 'PIX_EXPIRED', 'FAILED', 'REFUND_REQUIRED'].includes(state);
  }

  static isActive(state: TransferState): boolean {
    return !this.isTerminal(state);
  }
}
