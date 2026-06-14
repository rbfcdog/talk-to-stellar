# Talk to Stellar - Backend Tests

Complete test suite for the Talk to Stellar backend application. This test suite covers unit tests, integration tests, E2E tests, and AI agent testing.

## Test Structure

```
tests/
├── utils.test.ts              # Test utilities and helpers
├── wallet.test.ts            # Wallet operations testing
├── api-integration.test.ts    # REST API endpoint testing
├── stellar-sdk.test.ts        # Stellar SDK integration
├── agent-ai.test.ts          # AI agent functionality
├── e2e.test.ts               # End-to-end user journey
└── jest.config.json          # Jest configuration
```

## Core Test Suites

### 1. **Wallet Operations Tests** (`wallet.test.ts`)
Tests wallet creation, retrieval, and management functionality.

**Coverage:**
- 🏦 Wallet storage in database
- 📊 Balance retrieval from Stellar
- 🔄 Wallet synchronization
- ✅ Public key validation
- 📈 Sequence number validation

**Key Test Cases:**
```typescript
- Save wallet information to database
- Retrieve wallet by session ID
- Update wallet balance
- Get XLM balance from Stellar
- Get all account balances (native + issued assets)
- Validate public key format
- Validate sequence number is numeric
```

### 2. **API Integration Tests** (`api-integration.test.ts`)
Tests all REST API endpoints for wallet and chat operations.

**Coverage:**
- 👤 User endpoints (GET, PUT)
- 💳 Wallet endpoints (GET, SYNC)
- 💬 Chat endpoints (POST, GET history)
- 💸 Transaction endpoints (POST, GET)
- 🔍 Health check endpoints
- ⚠️ Error handling (400, 401, 404)

**Tested Endpoints:**
- `POST /users/register` - User registration
- `GET /users/:id` - User profile
- `PUT /users/:id` - Update profile
- `GET /users/:id/wallet` - Wallet info
- `POST /users/:id/wallet/sync` - Sync wallet
- `POST /chat` - Send message
- `GET /chat/history` - Chat history
- `POST /transactions/send` - Send payment
- `GET /transactions/:id` - Transaction details
- `GET /health` - Server health

### 3. **Stellar SDK Integration Tests** (`stellar-sdk.test.ts`)
Tests integration with the Stellar SDK for wallet and transaction operations.

**Coverage:**
- 🔐 Keypair management (create, recover, validate)
- 🤝 Account management and info fetching
- 📝 Transaction building and signing
- 📦 XDR format conversion
- 💱 Asset operations (native and non-native)
- 🛣️ Path payment operations
- 🌐 Server connections and queries
- 💰 Fee calculation and management

**Key Operations:**
```typescript
- Create new keypair
- Recover keypair from secret
- Validate public key format
- Build payment transactions
- Sign transactions
- Create native (XLM) assets
- Create custom assets
- Path payment transactions
- Fetch ledger information
- Query account transactions
```

### 4. **Agent AI Tests** (`agent-ai.test.ts`)
Tests the AI agent graph, conversation management, and tool execution.

**Coverage:**
- 🤖 Agent initialization and tool loading
- 💭 User intent recognition
- 🔄 Multi-turn conversation handling
- 📝 Conversation context maintenance
- 🛠️ Tool execution (getBalance, sendPayment, etc.)
- 🔀 Query routing to appropriate agents
- 🔒 Security and input validation
- 📢 Natural language response generation

**Agent Types:**
- `wallet` - Balance and account queries
- `transaction` - Payment and transfer operations
- `information` - Price and conversion data
- `support` - Help and troubleshooting

**Tools Tested:**
- `getBalance` - Fetch wallet balance
- `getTransactionHistory` - Get transaction list
- `sendPayment` - Initiate payment
- `getConversionRate` - Get price conversion
- `getAccountInfo` - Get account details
- `trustAsset` - Add asset to wallet
- `submitTransaction` - Execute transaction

### 5. **End-to-End Tests** (`e2e.test.ts`)
Tests the complete user journey from registration to transactions.

**Coverage:**
- 📝 User registration flow
- ✅ Input validation
- 👤 Profile management
- 💳 Wallet management
- 💬 Chat interactions
- 🔄 Multi-turn conversations
- 💸 Transaction flow
- 🛡️ Error handling and recovery

**Tested Journeys:**
1. User Registration → Wallet Creation
2. Profile Update → Wallet Sync
3. Chat Query → Agent Response
4. Multi-turn Conversation → Context Maintenance
5. Payment Preparation → Transaction Submission

### 6. **Test Utilities** (`utils.test.ts`)
Helper functions and utilities for all tests.

**Utilities Provided:**
- `createTestClient()` - Create axios client
- `generateTestEmail()` - Generate random email
- `generateTestKeypair()` - Generate Stellar keypair
- `retry()` - Retry with exponential backoff
- `mockData` - Mock data generators
- `testLogger` - Formatted logging
- `assertions` - Custom assertion helpers

## Running the Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Ensure environment variables are set
echo "API_BASE_URL=http://localhost:3000/api" > .env.test
echo "STELLAR_NETWORK=testnet" >> .env.test
```

### Run All Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test wallet.test.ts

# Run specific test suite
npm test -- --testNamePattern="Wallet Operations"
```

### Run Specific Test Suites

```bash
# Run only wallet tests
npm test wallet.test.ts

# Run only API integration tests
npm test api-integration.test.ts

# Run only Stellar SDK tests
npm test stellar-sdk.test.ts

# Run only agent AI tests
npm test agent-ai.test.ts

# Run only E2E tests
npm test e2e.test.ts
```

### Run Tests with Different Configurations

```bash
# Run tests with verbose output
npm test -- --verbose

# Run tests and stop on first failure
npm test -- --bail

# Run tests for a specific timeout
npm test -- --testTimeout=30000

# Run tests with specific reporters
npm test -- --reporters=default --reporters=junit
```

## Test Output

The tests use formatted logging with emoji indicators:

- `✅` Success - Test passed
- `❌` Error - Test failed
- `⚠️` Warning - Test encountered non-critical issue
- `📝` Test - Test case started
- `📡` Network - HTTP request made
- `🧪` Testing - Test suite started
- `ℹ️` Info - Additional information

## Test Coverage

View coverage reports:

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/index.html
```

## Environment Variables

Required for tests to run properly:

```bash
# API Configuration
API_BASE_URL=http://localhost:3000/api
NODE_ENV=test

# Stellar Configuration
STELLAR_NETWORK=testnet              # testnet or public
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# Database (optional for mocked tests)
DATABASE_URL=postgresql://user:password@localhost/talk_stellar_test

# Authentication
JWT_SECRET=test-jwt-secret-key

# Logging
LOG_LEVEL=debug                      # For test output
```

## Key Test Patterns

### Testing Async Operations

```typescript
it('should handle async operations', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

### Testing with Retry Logic

```typescript
import { retry } from './utils.test';

await retry(
  () => client.get('/endpoint'),
  { maxAttempts: 3, initialDelayMs: 1000 }
);
```

### Testing with Mock Data

```typescript
import { mockData } from './utils.test';

const user = mockData.user({ displayName: 'Test User' });
const transaction = mockData.transaction({ amount: '50' });
```

### Testing with Formatted Logging

```typescript
import { testLogger } from './utils.test';

testLogger.test('My test case');
testLogger.success('Operation completed');
testLogger.data('Result', myData);
testLogger.warning('Non-critical issue');
```

## Mocking HTTP Requests

Tests use real HTTP requests when possible. For offline testing:

```typescript
// Mock axios responses
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

mockAxios.get.mockResolvedValue({ status: 200, data: {...} });
```

## Performance Considerations

- Tests have a 30-second timeout per test case
- Use `testTimeout` option for longer operations
- Consider using `beforeAll` for expensive setup operations
- Clean up resources in `afterAll` hooks

## Continuous Integration

GitHub Actions workflow: `.github/workflows/test.yml`

```yaml
- name: Run tests
  run: npm test -- --coverage --bail

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Troubleshooting

### Tests timing out
- Increase timeout: `jest --testTimeout=60000`
- Check network connectivity for integration tests
- Verify Stellar testnet is accessible

### Mock data issues
- Ensure all required fields are provided
- Use `mockData.*()` helpers for consistent structure
- Check mock data overrides

### Database connection errors
- Verify `DATABASE_URL` is correct
- Ensure test database exists
- Check database migration status

### Stellar network errors
- Check `STELLAR_HORIZON_URL` is reachable
- Use testnet for testing (not public network)
- Verify account is funded in testnet

## Contributing

When adding new tests:

1. Create test file in `tests/` directory
2. Use descriptive test names
3. Follow existing patterns and conventions
4. Use `testLogger` for output
5. Add to appropriate test suite
6. Update this README

## Test Maintenance

- Review and update tests when API changes
- Keep mock data synchronized with real data structures
- Update error message assertions when messages change
- Rotate test accounts periodically
- Monitor test execution time and optimize slow tests

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [Stellar SDK Docs](https://developers.stellar.org/docs/javascript)
- [Axios Documentation](https://axios-http.com/)
- [Node.js Testing Best Practices](https://nodejs.org/en/docs/guides/testing/)

---

**Last Updated:** 2024-01-15
**Test Framework:** Jest + TypeScript
**Total Test Cases:** 100+
**Coverage Target:** >80%
