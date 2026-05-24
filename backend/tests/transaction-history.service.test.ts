import { supabase } from '../src/config/supabase';
import { TransactionHistoryService } from '../src/api/services/transaction-history.service';

function mockQuery(result: { data: any; error: any }) {
  const builder: any = {};
  const chain = () => builder;
  [
    'select',
    'eq',
    'in',
    'order',
    'limit',
    'gte',
    'lt',
  ].forEach((method) => {
    builder[method] = jest.fn(chain);
  });
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (onFulfilled: any, onRejected: any) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

describe('TransactionHistoryService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('includes hosted receipt records when payment logs are missing', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'agent_sessions') {
        return mockQuery({
          data: {
            session_id: 'session-1',
            user_id: 'user-1',
            public_key: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
          },
          error: null,
        });
      }

      if (table === 'payment_logs') {
        return mockQuery({ data: [], error: null });
      }

      if (table === 'receipt_images') {
        return mockQuery({
          data: [
            {
              code: 'receipt-1',
              operation_id: 'OP-1',
              tx_hash: 'tx-1',
              session_id: 'session-1',
              user_id: 'user-1',
              receipt_type: 'payment_sent',
              created_at: '2026-05-24T18:12:00.000Z',
              metadata: {
                sourceAmount: '56',
                sourceAssetCode: 'BRL',
                destinationAmount: '10',
                destinationAssetCode: 'USDC',
                counterpartyLabel: 'Ana Silva',
                counterpartyKey: '5595280606751',
                contextMessage: 'Transferência concluída.',
                completedAt: '2026-05-24T18:12:34.000Z',
              },
            },
          ],
          error: null,
        });
      }

      return mockQuery({ data: [], error: null });
    });

    const result = await TransactionHistoryService.listTransactions({
      sessionId: 'session-1',
      month: 5,
      year: 2026,
      limit: 200,
    });

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      id: 'receipt:receipt-1',
      payment_hash: 'tx-1',
      operation_type: 'payment_sent',
      source_amount: '56',
      source_asset_code: 'BRL',
      destination_amount: '10',
      destination_asset_code: 'USDC',
      counterparty: {
        name: 'Ana Silva',
        identifier: '5595280606751',
      },
    });
    expect(result.transactions[0].counterparty.short_profile_url).toContain('/receipt/receipt-1');
  });
});
