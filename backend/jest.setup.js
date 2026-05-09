/**
 * Jest Setup File
 * Initializes test environment and global configuration
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Global test timeout (in milliseconds)
jest.setTimeout(30000);

// Mock console methods if needed (optional)
// jest.spyOn(console, 'log').mockImplementation(() => {});
// jest.spyOn(console, 'error').mockImplementation(() => {});

// Setup global test utilities
global.testName = expect.getState().testPath;

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Setup test data cleanup
afterEach(() => {
  jest.clearAllMocks();
});

// Setup environment variables for tests
const requiredEnvVars = {
  'NODE_ENV': 'test',
  'STELLAR_NETWORK': 'testnet',
};

Object.entries(requiredEnvVars).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
});

console.log('\n🧪 Jest Test Environment Initialized');
console.log(`📍 Environment: ${process.env.NODE_ENV}`);
console.log(`🌐 Stellar Network: ${process.env.STELLAR_NETWORK}\n`);
