const sourceRows: Record<string, Array<Record<string, unknown>>> = {};
const sourceErrors: Record<string, { message: string } | null> = {};

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: jest.fn((source: string) => {
      const builder: Record<string, jest.Mock> = {};
      builder.select = jest.fn(() => builder);
      builder.order = jest.fn(() => builder);
      builder.range = jest.fn(async () => ({
        data: sourceRows[source] || [],
        error: sourceErrors[source] || null,
      }));
      return builder;
    }),
  },
}));

import {
  OpsHistoryRepository,
  mapOpsHistoryRow,
} from '../src/api/repository/ops-history.repository';

describe('OpsHistoryRepository', () => {
  beforeEach(() => {
    for (const key of Object.keys(sourceRows)) delete sourceRows[key];
    for (const key of Object.keys(sourceErrors)) delete sourceErrors[key];
  });

  it('normalizes all authoritative transaction tables and sorts newest first', async () => {
    sourceRows.transfers = [{
      id: 'normalized-1',
      public_ref: 'TTS-2026-000001',
      state: 'PIX_FUNDED',
      amount_brl_in: '100',
      quote: {
        fee_breakdown: [
          { label: 'provider fee', amount: '0.25', currency: 'BRL' },
          { label: 'TalkToStellar platform fee', amount: '1.50', currency: 'BRL' },
        ],
      },
      pix: { charge_id: 'pix-charge-1' },
      created_at: '2026-06-13T20:00:00.000Z',
      updated_at: '2026-06-13T20:02:00.000Z',
    }];
    sourceRows.international_transfers = [{
      id: 'international-1',
      status: 'PAYOUT_COMPLETED',
      brl_amount: '560',
      quoted_usd_amount: '99',
      stellar_tx_hash: 'international-hash',
      created_at: '2026-06-13T19:00:00.000Z',
      updated_at: '2026-06-13T21:00:00.000Z',
    }];
    sourceRows.operations = [{
      id: 'operation-1',
      user_id: 'user-1',
      type: 'PIX_ONRAMP',
      status: 'COMPLETED',
      amount: '50',
      asset_code: 'BRL',
      created_at: '2026-06-13T22:00:00.000Z',
      updated_at: '2026-06-13T22:01:00.000Z',
    }];
    sourceRows.payment_logs = [{
      id: '7',
      user_id: 'user-1',
      payment_hash: 'payment-hash',
      operation_type: 'conversion',
      status: 'success',
      source_amount: '10',
      source_asset_code: 'USDC',
      destination_amount: '55',
      destination_asset_code: 'BRL',
      created_at: '2026-06-13T18:00:00.000Z',
      completed_at: '2026-06-13T18:01:00.000Z',
    }];

    const result = await new OpsHistoryRepository().list();

    expect(result.records.map((record) => record.source)).toEqual([
      'operations',
      'transfers',
      'international_transfers',
      'payment_logs',
    ]);
    expect(result.source_counts).toEqual({
      transfers: 1,
      international_transfers: 1,
      operations: 1,
      payment_logs: 1,
    });
    expect(result.records.find((record) => record.source === 'transfers')).toMatchObject({
      lifecycle_transfer_id: 'normalized-1',
      reference: 'TTS-2026-000001',
      category: 'active',
      fee_amount: '1.50',
      fee_asset: 'BRL',
      fee_label: 'TalkToStellar platform fee',
    });
    expect(result.records.find((record) => record.source === 'international_transfers')).toMatchObject({
      category: 'completed',
      transaction_hash: 'international-hash',
    });
  });

  it('keeps available history and reports a source-specific database error', async () => {
    sourceRows.operations = [{
      id: 'operation-1',
      type: 'SEND',
      status: 'FAILED',
      created_at: '2026-06-13T22:00:00.000Z',
      updated_at: '2026-06-13T22:00:00.000Z',
    }];
    sourceErrors.transfers = { message: 'relation transfers does not exist' };

    const result = await new OpsHistoryRepository().list({ category: 'failed' });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      source: 'operations',
      category: 'failed',
    });
    expect(result.source_errors).toEqual({
      transfers: 'relation transfers does not exist',
    });
  });

  it('maps payment log amounts and route without requiring a database query', () => {
    expect(mapOpsHistoryRow('payment_logs', {
      id: 9,
      status: 'success',
      operation_type: 'conversion',
      source_amount: '10',
      source_asset_code: 'USDC',
      destination_amount: '55',
      destination_asset_code: 'BRL',
      payment_hash: 'hash-9',
      created_at: '2026-06-13T18:00:00.000Z',
    })).toMatchObject({
      id: 'payment_logs:9',
      reference: 'hash-9',
      route: 'USDC -> BRL',
      source_amount: '10',
      destination_amount: '55',
      category: 'completed',
    });
  });
});
