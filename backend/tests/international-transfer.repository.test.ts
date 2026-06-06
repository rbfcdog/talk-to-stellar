const mockUpdatePayloads: Array<{ table: string; patch: Record<string, unknown> }> = [];

function quoteRow() {
  const now = new Date().toISOString();
  return {
    id: 'quote-1',
    source_currency: 'BRL',
    destination_currency: 'USD',
    brl_amount: '500',
    estimated_usdc_amount: '99',
    estimated_usd_amount: '99',
    fx_rate: '5.05',
    platform_fee: { amount: '5', currency: 'BRL' },
    estimated_provider_fee: { amount: '0', currency: 'USD' },
    total_fee: { amount_brl_equivalent: '5', amount_usd_equivalent: '1' },
    expires_at: now,
    quote_status: 'CANCELLED',
    quote_source: 'stellar_pathfinding',
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

function transferRow() {
  const now = new Date().toISOString();
  return {
    id: 'transfer-1',
    quote_id: 'quote-1',
    status: 'PIX_PENDING',
    sender_identity: {},
    recipient_identity: {},
    brl_amount: '500',
    quoted_usd_amount: '99',
    fx_rate: '5.05',
    fees: {},
    stellar_asset_code: 'USDC',
    payout_destination: {},
    same_name_payout_required: false,
    same_name_match_status: 'UNKNOWN',
    identity_risk_notes: [],
    reconciliation_metadata: {},
    error_logs: [],
    created_at: now,
    updated_at: now,
  };
}

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      const builder: Record<string, jest.Mock> = {};
      builder.update = jest.fn((patch: Record<string, unknown>) => {
        mockUpdatePayloads.push({ table, patch });
        return builder;
      });
      builder.eq = jest.fn(() => builder);
      builder.select = jest.fn(() => builder);
      builder.single = jest.fn(async () => ({
        data: table === 'international_transfer_quotes' ? quoteRow() : transferRow(),
        error: null,
      }));
      return builder;
    }),
  },
}));

import { SupabaseInternationalTransferRepository } from '../src/api/repository/international-transfer.repository';

describe('SupabaseInternationalTransferRepository partial updates', () => {
  const repository = new SupabaseInternationalTransferRepository();

  beforeEach(() => {
    mockUpdatePayloads.length = 0;
  });

  it('updates quote fields without injecting required creation fields', async () => {
    await repository.updateQuote('quote-1', { quote_status: 'CANCELLED' });

    expect(mockUpdatePayloads).toHaveLength(1);
    expect(mockUpdatePayloads[0]).toMatchObject({
      table: 'international_transfer_quotes',
      patch: {
        quote_status: 'CANCELLED',
        updated_at: expect.any(String),
      },
    });
    expect(mockUpdatePayloads[0].patch).not.toHaveProperty('id');
    expect(mockUpdatePayloads[0].patch).not.toHaveProperty('created_at');
    expect(mockUpdatePayloads[0].patch).not.toHaveProperty('source_currency');
    expect(mockUpdatePayloads[0].patch).not.toHaveProperty('destination_currency');
  });

  it('preserves explicit false values without injecting transfer defaults', async () => {
    await repository.updateTransfer('transfer-1', {
      same_name_payout_required: false,
      pix_status: 'pending',
    });

    expect(mockUpdatePayloads).toHaveLength(1);
    expect(mockUpdatePayloads[0]).toMatchObject({
      table: 'international_transfers',
      patch: {
        same_name_payout_required: false,
        pix_status: 'pending',
        updated_at: expect.any(String),
      },
    });
    expect(mockUpdatePayloads[0].patch).not.toHaveProperty('id');
    expect(mockUpdatePayloads[0].patch).not.toHaveProperty('created_at');
    expect(mockUpdatePayloads[0].patch).not.toHaveProperty('status');
    expect(mockUpdatePayloads[0].patch).not.toHaveProperty('quote_id');
  });
});
