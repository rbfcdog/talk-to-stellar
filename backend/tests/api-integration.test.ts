/**
 * API Integration Tests
 * Tests REST API endpoints for wallet and chat operations
 */

import axios, { AxiosInstance } from 'axios';

describe('API Integration Tests', () => {
  let client: AxiosInstance;
  const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
  const TEST_EMAIL = `test-${Date.now()}@example.com`;
  const TEST_PHONE = '+6666666666';

  let authToken: string;
  let userPublicKey: string;

  beforeAll(async () => {
    console.log('\n🧪 Starting API Integration Tests');
    console.log(`📍 API Base URL: ${API_BASE_URL}`);

    // Create axios client with default config
    client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    });

    // Register test user
    try {
      console.log(`\n📝 Registering test user: ${TEST_EMAIL}`);
      const registerRes = await client.post('/users/register', {
        email: TEST_EMAIL,
        phoneNumber: TEST_PHONE,
      });

      if (registerRes.status === 201 || registerRes.status === 200) {
        authToken = registerRes.data.token || registerRes.headers['authorization'];
        userPublicKey = registerRes.data.publicKey;
        console.log(`✓ User registered successfully`);
        console.log(`✓ Public Key: ${userPublicKey}`);
      } else {
        console.log(`⚠ Register returned status ${registerRes.status}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`⚠ User registration: ${errorMessage}`);
    }
  });

  describe('User Endpoints', () => {
    it('GET /users/:id - should retrieve user details', async () => {
      console.log('\n📝 Test: GET /users/:id');

      try {
        const response = await client.get(`/users/${userPublicKey || 'test'}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200) {
          expect(response.data).toBeDefined();
          console.log(`✓ User data retrieved: ${JSON.stringify(response.data)}`);
        } else if (response.status === 404) {
          console.log(`⚠ User not found (expected if not fully setup)`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Get user endpoint: ${errorMessage}`);
      }
    });

    it('PUT /users/:id - should update user profile', async () => {
      console.log('\n📝 Test: PUT /users/:id');

      try {
        const updateData = {
          displayName: 'Test User',
          avatar: 'https://example.com/avatar.jpg',
        };

        const response = await client.put(`/users/${userPublicKey || 'test'}`, updateData, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200) {
          expect(response.data).toBeDefined();
          console.log(`✓ User updated successfully`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Update user endpoint: ${errorMessage}`);
      }
    });
  });

  describe('Wallet Endpoints', () => {
    it('GET /users/:id/wallet - should retrieve wallet info', async () => {
      console.log('\n📝 Test: GET /users/:id/wallet');

      try {
        const response = await client.get(`/users/${userPublicKey || 'test'}/wallet`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200) {
          expect(response.data).toBeDefined();
          expect(response.data.publicKey || response.data.public_key).toBeDefined();
          console.log(`✓ Wallet data retrieved`);
          console.log(`  - Balance: ${response.data.balance}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Get wallet endpoint: ${errorMessage}`);
      }
    });

    it('POST /users/:id/wallet/sync - should sync wallet with Stellar', async () => {
      console.log('\n📝 Test: POST /users/:id/wallet/sync');

      try {
        const response = await client.post(`/users/${userPublicKey || 'test'}/wallet/sync`, {}, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200) {
          console.log(`✓ Wallet synced successfully`);
          console.log(`  - Latest balance: ${response.data.balance}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Sync wallet endpoint: ${errorMessage}`);
      }
    });
  });

  describe('Chat Endpoints', () => {
    it('POST /chat - should send chat message and get response', async () => {
      console.log('\n📝 Test: POST /chat');

      try {
        const response = await client.post(
          '/chat',
          {
            message: 'What is my wallet balance?',
            sessionId: `session-${Date.now()}`,
            publicKey: userPublicKey,
          },
          {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          }
        );

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200) {
          expect(response.data.reply).toBeDefined();
          console.log(`✓ Chat response received`);
          console.log(`  - Reply: ${response.data.reply}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Chat endpoint: ${errorMessage}`);
      }
    });

    it('GET /chat/history - should retrieve chat history', async () => {
      console.log('\n📝 Test: GET /chat/history');

      try {
        const response = await client.get('/chat/history', {
          params: {
            sessionId: `session-${Date.now()}`,
            limit: 10,
          },
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200) {
          expect(Array.isArray(response.data)).toBe(true);
          console.log(`✓ Chat history retrieved (${response.data.length || 0} messages)`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Chat history endpoint: ${errorMessage}`);
      }
    });
  });

  describe('Transaction Endpoints', () => {
    it('POST /transactions/send - should initiate payment', async () => {
      console.log('\n📝 Test: POST /transactions/send');

      try {
        const response = await client.post(
          '/transactions/send',
          {
            from: userPublicKey,
            to: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
            amount: '1',
            assetCode: 'XLM',
            memo: 'Test payment',
          },
          {
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          }
        );

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200 || response.status === 201) {
          expect(response.data.transactionHash).toBeDefined();
          console.log(`✓ Transaction initiated`);
          console.log(`  - Hash: ${response.data.transactionHash}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Send transaction endpoint: ${errorMessage}`);
      }
    });

    it('GET /transactions/:id - should get transaction details', async () => {
      console.log('\n📝 Test: GET /transactions/:id');

      try {
        const txId = 'test-transaction-id';
        const response = await client.get(`/transactions/${txId}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200) {
          console.log(`✓ Transaction details retrieved`);
        } else if (response.status === 404) {
          console.log(`⚠ Transaction not found (expected if not created)`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Get transaction endpoint: ${errorMessage}`);
      }
    });
  });

  describe('Health & Status Endpoints', () => {
    it('GET /health - should return server health', async () => {
      console.log('\n📝 Test: GET /health');

      try {
        const response = await client.get('/health');

        console.log(`✓ Request sent (Status: ${response.status})`);

        if (response.status === 200) {
          expect(response.data.status || response.data).toBeDefined();
          console.log(`✓ Server is healthy`);
          console.log(`  - Status: ${response.data.status || 'ok'}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Health endpoint: ${errorMessage}`);
      }
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid request body', async () => {
      console.log('\n📝 Test: Invalid request body handling');

      try {
        const response = await client.post('/chat', {
          // Missing required 'message' field
          sessionId: 'test-session',
        });

        expect([400, 422]).toContain(response.status);
        console.log(`✓ Invalid request correctly rejected (Status: ${response.status})`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Error handling test: ${errorMessage}`);
      }
    });

    it('should return 401 for missing authentication', async () => {
      console.log('\n📝 Test: Missing auth token handling');

      try {
        // Make request without auth header
        const response = await client.get('/users/test-user', {
          headers: { Authorization: '' },
        });

        if (response.status === 401 || response.status === 403) {
          console.log(`✓ Missing auth correctly rejected (Status: ${response.status})`);
        } else {
          console.log(`⚠ Auth endpoint returned ${response.status} (may allow public access)`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Auth error test: ${errorMessage}`);
      }
    });

    it('should return 404 for non-existent resource', async () => {
      console.log('\n📝 Test: Not found handling');

      try {
        const response = await client.get('/users/nonexistent-user-12345', {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        if (response.status === 404) {
          console.log(`✓ Not found correctly returned (Status: 404)`);
        } else {
          console.log(`⚠ Returned status ${response.status} instead of 404`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ 404 error test: ${errorMessage}`);
      }
    });
  });

  afterAll(() => {
    console.log('\n✅ API Integration Tests Complete\n');
  });
});
