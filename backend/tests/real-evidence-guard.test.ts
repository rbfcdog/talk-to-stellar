import { assertFinalRealTransferEvidence } from '../src/scripts/realEvidenceGuard';

function finalEvidence(overrides: Record<string, unknown> = {}) {
  return {
    exported_at: '2026-06-15T00:00:00.000Z',
    transfer: {
      id: 'transfer-1',
      public_ref: 'TTS-2026-000999',
      state: 'RECONCILED',
      pix: {
        charge_id: 'pix-charge-provider-123',
        e2e_id: 'E12345678901234567890123456789012',
      },
      stellar: {
        tx_hash: 'a'.repeat(64),
        ledger: 123456,
        network: 'testnet',
      },
      reconciliation: {
        reconciled_at: '2026-06-15T00:01:00.000Z',
      },
      ...overrides,
    },
    transfer_events: [],
  };
}

describe('real evidence guard', () => {
  it('accepts a reconciled transfer with provider evidence and Stellar ledger', () => {
    expect(() => assertFinalRealTransferEvidence(finalEvidence())).not.toThrow();
  });

  it('rejects generated local evidence values before export', () => {
    expect(() =>
      assertFinalRealTransferEvidence(
        finalEvidence({
          pix: { charge_id: 'mock_pix_123' },
          stellar: { tx_hash: 'mock-stellar-123', ledger: 0 },
        }),
      ),
    ).toThrow(/not final real transfer evidence/);
  });

  it('rejects non-reconciled transfers', () => {
    expect(() =>
      assertFinalRealTransferEvidence(finalEvidence({ state: 'PAYOUT_INSTRUCTED' })),
    ).toThrow(/must be RECONCILED/);
  });
});
