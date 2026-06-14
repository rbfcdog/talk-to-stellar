/**
 * Integration test: full normalized transfer lifecycle with an in-memory
 * repository double.
 */

import { orchestrator } from '../../src/orchestration/TransferOrchestrator';
import { transferRepository } from '../../src/api/repository/transfer.repository';
import {
  Transfer,
  TransferEvent,
  QuoteSnapshot,
  PixEvidence,
  StellarEvidence,
  PayoutEvidence,
} from '../../src/orchestration/types';

let mockTransfer: Transfer | null = null;
let mockEvents: TransferEvent[] = [];

const originals = {
  create: transferRepository.create.bind(transferRepository),
  getById: transferRepository.getById.bind(transferRepository),
  getByPublicRef: transferRepository.getByPublicRef.bind(transferRepository),
  transition: transferRepository.transition.bind(transferRepository),
  appendEvent: transferRepository.appendEvent.bind(transferRepository),
  getEvents: transferRepository.getEvents.bind(transferRepository),
  getByLegacyTransferId: transferRepository.getByLegacyTransferId.bind(transferRepository),
};

function pushEvent(event: Omit<TransferEvent, 'id' | 'created_at'>): TransferEvent {
  const ev: TransferEvent = {
    id: `event-${mockEvents.length + 1}`,
    ...event,
    correlation_id: event.correlation_id || null,
    created_at: new Date().toISOString(),
  };
  mockEvents.push(ev);
  return ev;
}

beforeAll(() => {
  transferRepository.create = async (intent) => {
    const transfer: Transfer = {
      id: 'test-transfer-id',
      public_ref: 'TTS-2026-000001',
      state: 'CREATED',
      state_version: 1,
      source_endpoint: intent.source_endpoint,
      destination_endpoint: intent.destination_endpoint,
      amount_brl_in: intent.amount_brl_in,
      amount_usdc_settled: null,
      amount_usd_out_expected: null,
      quote: null,
      pix: null,
      stellar: null,
      payout: null,
      reconciliation: null,
      legacy_transfer_id: intent.legacy_transfer_id || null,
      actor: { created_by: intent.actor || 'api' },
      failure_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockTransfer = transfer;
    pushEvent({
      transfer_id: transfer.id,
      from_state: null,
      to_state: 'CREATED',
      event_type: 'transfer_created',
      payload: { intent },
      actor: intent.actor || 'api',
      correlation_id: intent.correlation_id || null,
    });
    return { ...transfer };
  };

  transferRepository.getById = async (id: string) => {
    if (mockTransfer && mockTransfer.id === id) return { ...mockTransfer };
    return null;
  };

  transferRepository.getByPublicRef = async (ref: string) => {
    if (mockTransfer && mockTransfer.public_ref === ref) return { ...mockTransfer };
    return null;
  };

  transferRepository.getByLegacyTransferId = async (legacyTransferId: string) => {
    if (mockTransfer && mockTransfer.legacy_transfer_id === legacyTransferId) return { ...mockTransfer };
    return null;
  };

  transferRepository.transition = async (input) => {
    if (!mockTransfer || mockTransfer.id !== input.transferId) throw new Error('not found');
    if (mockTransfer.state_version !== input.expectedVersion) throw new Error('version conflict');
    const from = mockTransfer.state;
    mockTransfer = {
      ...mockTransfer,
      ...input.updates,
      state: input.toState,
      state_version: input.expectedVersion + 1,
      updated_at: new Date().toISOString(),
    } as Transfer;
    pushEvent({
      transfer_id: input.transferId,
      from_state: from,
      to_state: input.toState,
      event_type: input.eventType,
      payload: input.payload,
      actor: input.actor,
      correlation_id: input.correlationId || null,
    });
    return { ...mockTransfer };
  };

  transferRepository.appendEvent = async (event) => pushEvent(event);
  transferRepository.getEvents = async () => [...mockEvents];
});

afterAll(() => {
  transferRepository.create = originals.create;
  transferRepository.getById = originals.getById;
  transferRepository.getByPublicRef = originals.getByPublicRef;
  transferRepository.transition = originals.transition;
  transferRepository.appendEvent = originals.appendEvent;
  transferRepository.getEvents = originals.getEvents;
  transferRepository.getByLegacyTransferId = originals.getByLegacyTransferId;
});

beforeEach(() => {
  mockTransfer = null;
  mockEvents = [];
});

describe('TransferOrchestrator full lifecycle', () => {
  it('runs CREATED -> RECONCILED with idempotent PIX and Stellar replays', async () => {
    let transfer = await orchestrator.createTransfer({
      amount_brl_in: '500.00',
      source_endpoint: { institution_type: 'whatsapp', masked_identifier: 'user_***' },
      destination_endpoint: { provider_type: 'us_bank', country: 'US', masked_account: '***1234', account_holder_name: 'John Supplier' },
      actor: 'api',
      correlation_id: 'test-run-1',
    });
    expect(transfer.state).toBe('CREATED');

    const quote: QuoteSnapshot = {
      rate: '5.20',
      fee_breakdown: [
        { label: 'Platform fee', amount: '0.50', currency: 'BRL', bps: 30 },
        { label: 'Provider fee', amount: '0.10', currency: 'USD' },
      ],
      expires_at: new Date(Date.now() + 300000).toISOString(),
      quoted_at: new Date().toISOString(),
      source: 'stellar_pathfinding',
    };
    transfer = await orchestrator.attachQuote(transfer.id, quote);
    expect(transfer.state).toBe('QUOTED');
    expect(transfer.amount_usd_out_expected).toBe('96.15');

    transfer = await orchestrator.issuePixCharge(transfer.id, {
      charge_id: 'pix_charge_abc123',
      provider: 'etherfuse',
    });
    expect(transfer.state).toBe('PIX_CHARGE_ISSUED');

    const pixEvidence: PixEvidence = {
      charge_id: 'pix_charge_abc123',
      e2e_id: 'E2E123456789',
      txid: 'TXID987654321',
      paid_at: new Date().toISOString(),
      payer_masked: '***masked***',
      provider: 'etherfuse',
    };
    transfer = await orchestrator.confirmPixFunding(transfer.id, pixEvidence);
    expect(transfer.state).toBe('PIX_FUNDED');

    const pixReplay = await orchestrator.confirmPixFunding(transfer.id, pixEvidence);
    expect(pixReplay.state).toBe('PIX_FUNDED');

    transfer = await orchestrator.beginConversion(transfer.id);
    expect(transfer.state).toBe('CONVERTING');

    const stellarEvidence: StellarEvidence = {
      tx_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
      ledger: 5500000,
      network: 'testnet',
      settled_at: new Date().toISOString(),
      source_account_masked: 'G***MASKED',
      asset: 'USDC',
      path_used: ['BRL', 'USDC'],
    };
    transfer = await orchestrator.confirmStellarSettlement(transfer.id, stellarEvidence);
    expect(transfer.state).toBe('STELLAR_SETTLED');
    expect(transfer.reconciliation?.amounts_match).toBe(true);

    const stellarReplay = await orchestrator.confirmStellarSettlement(transfer.id, stellarEvidence);
    expect(stellarReplay.state).toBe('STELLAR_SETTLED');

    const payoutEvidence: Pick<PayoutEvidence, 'provider_hint' | 'same_name_check'> = {
      provider_hint: 'bridge',
      same_name_check: { expected: 'John Supplier', provided: 'John Supplier', passed: true },
    };
    transfer = await orchestrator.routePayout(transfer.id, payoutEvidence);
    expect(transfer.state).toBe('PAYOUT_ROUTING');

    transfer = await orchestrator.instructPayout(transfer.id, 'payout_ref_xyz789');
    expect(transfer.state).toBe('PAYOUT_INSTRUCTED');

    transfer = await orchestrator.markReconciled(transfer.id);
    expect(transfer.state).toBe('RECONCILED');
    expect(transfer.reconciliation?.amounts_match).toBe(true);

    await expect(orchestrator.beginConversion(transfer.id)).rejects.toThrow('Illegal');

    const eventTypes = mockEvents.map((event) => event.event_type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'transfer_created',
      'quote_attached',
      'pix_charge_issued',
      'pix_funding_confirmed',
      'idempotent_replay',
      'conversion_started',
      'stellar_settled',
      'payout_routing_started',
      'payout_instructed',
      'reconciled',
    ]));
    expect(mockEvents.filter((event) => event.event_type === 'idempotent_replay')).toHaveLength(2);
  });

  it('rejects PIX replay with different evidence once funded', async () => {
    const transfer = await orchestrator.createTransfer({
      amount_brl_in: '100.00',
      source_endpoint: { institution_type: 'api', masked_identifier: 'api' },
      destination_endpoint: { provider_type: 'us_bank', country: 'US', masked_account: '***9999' },
    });
    await orchestrator.attachQuote(transfer.id, {
      rate: '5',
      fee_breakdown: [],
      expires_at: new Date(Date.now() + 300000).toISOString(),
      quoted_at: new Date().toISOString(),
      source: 'test',
    });
    await orchestrator.issuePixCharge(transfer.id, { charge_id: 'charge-1', provider: 'etherfuse' });
    await orchestrator.confirmPixFunding(transfer.id, {
      charge_id: 'charge-1',
      e2e_id: 'e2e-1',
      paid_at: new Date().toISOString(),
      provider: 'etherfuse',
    });

    await expect(orchestrator.confirmPixFunding(transfer.id, {
      charge_id: 'charge-2',
      e2e_id: 'e2e-2',
      paid_at: new Date().toISOString(),
      provider: 'etherfuse',
    })).rejects.toThrow('does not match');
  });
});
