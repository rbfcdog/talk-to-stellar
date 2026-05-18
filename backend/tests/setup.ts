import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-enough-entropy';

// Mock Supabase by default (can be overridden in tests)
jest.mock('../src/config/supabase', () => ({
  supabase: {
    rpc: jest.fn().mockResolvedValue({ data: 'vault-secret-id', error: null }),
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'test-user-id' }, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      call: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

console.log('✓ Test setup complete');
