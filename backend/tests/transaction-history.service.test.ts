jest.mock('../src/api/services/core/stellar.service', () => ({
  getStellarService: jest.fn(),
}));

import { supabase } from '../src/config/supabase';
import { getStellarService } from '../src/api/services/core/stellar.service';
import { TransactionHistoryService } from '../src/api/services/transaction-history.service';

const getStellarServiceMock = getStellarService as jest.Mock;

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
  beforeEach(() => {
    process.env.DISABLE_SHORT_LINKS = '1';
    getStellarServiceMock.mockReturnValue({
      getOperationHistory: jest.fn().mockResolvedValue([]),
    });
  });

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
    const receiptTransaction = result.transactions[0] as any;
    expect(receiptTransaction.receipt_url).toContain('/receipt/receipt-1');
    expect(receiptTransaction.counterparty.profile_url).toBeNull();
    expect(receiptTransaction.counterparty.short_profile_url).toBeNull();
  });

  it('merges Stellar network operations with internal payment logs for the web history page', async () => {
    const fromMock = supabase.from as jest.Mock;
    fromMock.mockImplementation((table: string) => {
      if (table === 'agent_sessions') {
        const builder = mockQuery({
          data: [
            {
              session_id: 'session-2',
              user_id: 'user-2',
              email: 'rodrigo@example.com',
              phone_number: null,
            },
          ],
          error: null,
        });
        builder.maybeSingle = jest.fn(() => Promise.resolve({
          data: {
            session_id: 'session-1',
            user_id: 'user-1',
            public_key: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          },
          error: null,
        }));
        return builder;
      }

      if (table === 'wallets') {
        return mockQuery({
          data: [
            {
              public_key: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
              session_id: 'session-2',
              name: 'Rodrigo Camargo',
              pix_key: null,
            },
          ],
          error: null,
        });
      }

      if (table === 'payment_logs') {
        return mockQuery({
          data: [
            {
              id: 'log-1',
              payment_hash: 'logged-hash',
              status: 'success',
              operation_type: 'conversion',
              source_amount: '10',
              source_asset_code: 'USDC',
              destination_amount: '43.84',
              destination_asset_code: 'BRL',
              destination_public_key: null,
              error_message: null,
              memo: null,
              metadata: {},
              created_at: '2026-05-28T19:57:00.000Z',
              completed_at: '2026-05-28T19:57:00.000Z',
            },
          ],
          error: null,
        });
      }

      if (table === 'receipt_images' || table === 'external_accounts' || table === 'global_profiles') {
        return mockQuery({ data: [], error: null });
      }

      return mockQuery({ data: [], error: null });
    });

    const getOperationHistory = jest.fn().mockResolvedValue([
      {
        id: 'op-1',
        transaction_hash: 'incoming-hash',
        type: 'payment',
        from: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        to: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        amount: '50.0000000',
        created_at: '2026-05-28T22:59:03.000Z',
      },
      {
        id: 'op-logged',
        transaction_hash: 'logged-hash',
        type: 'path_payment_strict_send',
        from: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        to: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        amount: '10.0000000',
        created_at: '2026-05-28T19:57:01.000Z',
      },
    ]);
    getStellarServiceMock.mockReturnValue({ getOperationHistory });

    const result = await TransactionHistoryService.listTransactions({
      sessionId: 'session-1',
      limit: 500,
    });

    expect(getOperationHistory).toHaveBeenCalledWith('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 200);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      id: 'stellar:op-1',
      payment_hash: 'incoming-hash',
      operation_type: 'payment_received',
      destination_amount: '50.0000000',
      destination_asset_code: 'USDC',
      counterparty: {
        name: 'Rodrigo Camargo',
      },
    });
    expect(result.transactions.map((item: any) => item.payment_hash)).toEqual(['incoming-hash', 'logged-hash']);
  });
});
