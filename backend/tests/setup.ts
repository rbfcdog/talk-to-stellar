import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock Supabase by default (can be overridden in tests)
jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'test-user-id' }, error: null }),
      call: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

console.log('✓ Test setup complete');
