/**
 * Unit tests: State Machine transitions
 */

import {
  TransferStateMachine,
  IllegalTransitionError,
} from '../../src/orchestration/stateMachine';
import { TransferState } from '../../src/orchestration/types';

describe('TransferStateMachine', () => {
  describe('canTransition', () => {
    const happyPath: Array<[TransferState, TransferState]> = [
      ['CREATED', 'QUOTED'],
      ['QUOTED', 'PIX_CHARGE_ISSUED'],
      ['PIX_CHARGE_ISSUED', 'PIX_FUNDED'],
      ['PIX_FUNDED', 'CONVERTING'],
      ['CONVERTING', 'STELLAR_SETTLED'],
      ['STELLAR_SETTLED', 'PAYOUT_ROUTING'],
      ['PAYOUT_ROUTING', 'PAYOUT_INSTRUCTED'],
      ['PAYOUT_INSTRUCTED', 'RECONCILED'],
    ];

    test.each(happyPath)('%s → %s is allowed', (from, to) => {
      expect(TransferStateMachine.canTransition(from, to)).toBe(true);
    });

    test('identity transition is not a legal lifecycle transition', () => {
      expect(TransferStateMachine.canTransition('CREATED', 'CREATED')).toBe(false);
      expect(TransferStateMachine.canTransition('RECONCILED', 'RECONCILED')).toBe(false);
    });
  });

  describe('assertTransition', () => {
    test('throws on illegal transition', () => {
      expect(() => {
        TransferStateMachine.assertTransition('CREATED', 'STELLAR_SETTLED');
      }).toThrow(IllegalTransitionError);
    });

    test('throws on skip-ahead', () => {
      expect(() => {
        TransferStateMachine.assertTransition('CREATED', 'PIX_CHARGE_ISSUED');
      }).toThrow(IllegalTransitionError);
    });

    test('does not throw on legal transition', () => {
      expect(() => {
        TransferStateMachine.assertTransition('CREATED', 'QUOTED');
      }).not.toThrow();
    });
  });

  describe('nextAllowedStates', () => {
    test('CREATED has QUOTED, QUOTE_EXPIRED, FAILED', () => {
      const next = TransferStateMachine.nextAllowed('CREATED');
      expect(next).toContain('QUOTED');
      expect(next).toContain('QUOTE_EXPIRED');
      expect(next).toContain('FAILED');
      expect(next.length).toBe(3);
    });

    test('RECONCILED has no next states (terminal)', () => {
      expect(TransferStateMachine.nextAllowed('RECONCILED')).toEqual([]);
    });

    test('REFUND_REQUIRED is terminal', () => {
      expect(TransferStateMachine.nextAllowed('REFUND_REQUIRED')).toEqual([]);
    });
  });

  describe('isTerminal', () => {
    test('RECONCILED is terminal', () => {
      expect(TransferStateMachine.isTerminal('RECONCILED')).toBe(true);
    });

    test('FAILED is not terminal', () => {
      expect(TransferStateMachine.isTerminal('FAILED')).toBe(false);
    });
  });

  describe('isFailure', () => {
    test('FAILED is a failure state', () => {
      expect(TransferStateMachine.isFailure('FAILED')).toBe(true);
    });

    test('CONVERTING is not a failure state', () => {
      expect(TransferStateMachine.isFailure('CONVERTING')).toBe(false);
    });
  });
});
