import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-enough-entropy';

function mockCreateSupabaseQueryBuilder(table: string) {
  const responseForTable = () => {
    if (table === 'wallets') {
      return {
        data: null,
        error: { code: 'PGRST116', message: 'No rows found in test mock' },
      };
    }

    if (table === 'users') {
      return {
        data: {
          id: 'test-user-id',
          email: 'test@example.com',
          phone_number: '+10000000000',
        },
        error: null,
      };
    }

    return {
      data: {
        id: 'test-row-id',
        session_id: 'test-session-id',
        user_id: 'test-user-id',
      },
      error: null,
    };
  };

  const listResponse = () => ({ data: [], error: null });
  const writeResponse = () => ({ data: null, error: null });
  const builder: any = {};
  const chain = () => builder;

  [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'like',
    'ilike',
    'in',
    'contains',
    'containedBy',
    'match',
    'is',
    'not',
    'or',
    'order',
    'limit',
    'range',
    'returns',
    'throwOnError',
  ].forEach((method) => {
    builder[method] = jest.fn(chain);
  });

  builder.single = jest.fn(() => Promise.resolve(responseForTable()));
  builder.maybeSingle = jest.fn(() => Promise.resolve({ data: null, error: null }));
  builder.call = jest.fn(() => Promise.resolve(listResponse()));
  builder.then = (onFulfilled: any, onRejected: any) => (
    Promise.resolve(writeResponse()).then(onFulfilled, onRejected)
  );

  return builder;
}

// Mock Supabase by default (can be overridden in tests)
jest.mock('../src/config/supabase', () => ({
  supabase: {
    rpc: jest.fn().mockResolvedValue({ data: 'vault-secret-id', error: null }),
    from: jest.fn((table: string) => mockCreateSupabaseQueryBuilder(table)),
  },
}));

console.log('✓ Test setup complete');
