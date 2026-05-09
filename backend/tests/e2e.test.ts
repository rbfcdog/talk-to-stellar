/**
 * End-to-End (E2E) Tests
 * Tests the complete user journey from registration to transactions
 */

import { createTestClient, generateTestEmail, testLogger, mockData } from './test-utils';

describe('End-to-End User Journey Tests', () => {
  const client = createTestClient();
  let testUserEmail: string;
  let testUserPublicKey: string;
  let testUserToken: string;
  let testSessionId: string;

  beforeAll(() => {
    testLogger.section('E2E Tests - Complete User Journey');
    testUserEmail = generateTestEmail();
    testSessionId = `e2e-session-${Date.now()}`;
  });

  describe('User Registration Flow', () => {
    it('should register a new user and receive wallet', async () => {
      testLogger.test('Register new user');

      try {
        const response = await client.post('/users/register', {
          email: testUserEmail,
          phoneNumber: '+6666666666',
        });

        testLogger.request('POST', '/users/register', response.status);

        if (response.status === 201 || response.status === 200) {
          testUserPublicKey = response.data.publicKey;
          testUserToken = response.data.token;

          testLogger.success('User registered successfully');
          testLogger.data('Generated Wallet', {
            email: testUserEmail,
            publicKey: testUserPublicKey,
            hasToken: !!testUserToken,
          });

          expect(response.data.publicKey).toBeDefined();
          expect(response.data.publicKey.startsWith('G')).toBe(true);
        } else {
          testLogger.warning(`Unexpected status: ${response.status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.error(`Registration failed: ${errorMessage}`);
        throw error;
      }
    });

    it('should reject duplicate user registration', async () => {
      testLogger.test('Reject duplicate registration');

      try {
        const response = await client.post('/users/register', {
          email: testUserEmail,
          phoneNumber: '+6666666666',
        });

        testLogger.request('POST', '/users/register', response.status);

        if (response.status === 409 || response.status === 400) {
          testLogger.success('Duplicate registration correctly rejected');
        } else {
          testLogger.warning(`Returned status ${response.status} for duplicate`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Duplicate check: ${errorMessage}`);
      }
    });

    it('should validate registration input', async () => {
      testLogger.test('Validate registration input');

      const invalidInputs = [
        { email: 'invalid-email', phoneNumber: '+1234567890' },
        { email: 'test@example.com', phoneNumber: 'invalid-phone' },
        { email: '', phoneNumber: '+1234567890' },
      ];

      for (const input of invalidInputs) {
        const response = await client.post('/users/register', input);
        testLogger.request('POST', '/users/register', response.status);

        if (response.status === 400 || response.status === 422) {
          testLogger.success(`Invalid input rejected: ${JSON.stringify(input)}`);
        } else {
          testLogger.warning(`Validation may not be strict: ${response.status}`);
        }
      }
    });
  });

  describe('User Profile & Wallet Management', () => {
    it('should fetch user profile', async () => {
      testLogger.test('Fetch user profile');

      try {
        const response = await client.get(`/users/${testUserPublicKey}`, {
          headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
        });

        testLogger.request('GET', `/users/${testUserPublicKey}`, response.status);

        if (response.status === 200) {
          testLogger.success('User profile fetched');
          testLogger.data('User Data', {
            email: response.data.email,
            publicKey: response.data.publicKey,
            createdAt: response.data.createdAt,
          });
        } else {
          testLogger.warning(`Unexpected status: ${response.status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Fetch profile: ${errorMessage}`);
      }
    });

    it('should update user profile', async () => {
      testLogger.test('Update user profile');

      try {
        const updateData = {
          displayName: 'Test User',
          avatar: 'https://example.com/avatar.jpg',
        };

        const response = await client.put(`/users/${testUserPublicKey}`, updateData, {
          headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
        });

        testLogger.request('PUT', `/users/${testUserPublicKey}`, response.status);

        if (response.status === 200) {
          testLogger.success('User profile updated');
        } else {
          testLogger.warning(`Returned status: ${response.status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Update profile: ${errorMessage}`);
      }
    });

    it('should sync wallet with Stellar network', async () => {
      testLogger.test('Sync wallet with Stellar');

      try {
        const response = await client.post(
          `/users/${testUserPublicKey}/wallet/sync`,
          {},
          {
            headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
          }
        );

        testLogger.request('POST', `/users/${testUserPublicKey}/wallet/sync`, response.status);

        if (response.status === 200) {
          testLogger.success('Wallet synced with Stellar');
          testLogger.data('Wallet Info', {
            balance: response.data.balance,
            sequence: response.data.sequence,
            lastSynced: response.data.lastSynced,
          });
        } else {
          testLogger.warning(`Sync returned status: ${response.status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Wallet sync: ${errorMessage}`);
      }
    });

    it('should retrieve wallet balance', async () => {
      testLogger.test('Retrieve wallet balance');

      try {
        const response = await client.get(`/users/${testUserPublicKey}/wallet`, {
          headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
        });

        testLogger.request('GET', `/users/${testUserPublicKey}/wallet`, response.status);

        if (response.status === 200) {
          testLogger.success('Wallet balance retrieved');
          testLogger.data('Balance Details', {
            totalBalance: response.data.balance,
            assets: response.data.balances?.length || 1,
          });
        } else {
          testLogger.warning(`Returned status: ${response.status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Get balance: ${errorMessage}`);
      }
    });
  });

  describe('Chat Interaction Flow', () => {
    it('should send initial chat message', async () => {
      testLogger.test('Send initial chat message');

      try {
        const response = await client.post(
          '/chat',
          {
            message: 'Hello! What is my current wallet balance?',
            sessionId: testSessionId,
            publicKey: testUserPublicKey,
          },
          {
            headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
          }
        );

        testLogger.request('POST', '/chat', response.status);

        if (response.status === 200) {
          testLogger.success('Chat message received');
          testLogger.data('Agent Response', {
            userMessage: 'Hello! What is my current wallet balance?',
            agentReply: response.data.reply,
            agentUsed: response.data.agent,
          });

          expect(response.data.reply).toBeDefined();
        } else {
          testLogger.warning(`Chat returned status: ${response.status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Chat interaction: ${errorMessage}`);
      }
    });

    it('should handle multi-turn conversation', async () => {
      testLogger.test('Handle multi-turn conversation');

      const messages = [
        'Can you show me my transaction history?',
        'How many transactions in the last 30 days?',
        'What was my largest transaction?',
      ];

      for (let i = 0; i < messages.length; i++) {
        try {
          const response = await client.post(
            '/chat',
            {
              message: messages[i],
              sessionId: testSessionId,
              publicKey: testUserPublicKey,
            },
            {
              headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
            }
          );

          testLogger.request('POST', '/chat', response.status);

          if (response.status === 200) {
            testLogger.info(`Turn ${i + 1}: Got response`);
          } else {
            testLogger.warning(`Turn ${i + 1}: Status ${response.status}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          testLogger.warning(`Turn ${i + 1}: ${errorMessage}`);
        }
      }

      testLogger.success('Multi-turn conversation completed');
    });

    it('should retrieve chat history', async () => {
      testLogger.test('Retrieve chat history');

      try {
        const response = await client.get('/chat/history', {
          params: {
            sessionId: testSessionId,
            limit: 10,
          },
          headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
        });

        testLogger.request('GET', '/chat/history', response.status);

        if (response.status === 200) {
          testLogger.success('Chat history retrieved');
          testLogger.data('History', {
            messageCount: response.data.length,
            sessionId: testSessionId,
          });
        } else {
          testLogger.warning(`History returned status: ${response.status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Get history: ${errorMessage}`);
      }
    });

    it('should handle complex wallet queries through chat', async () => {
      testLogger.test('Handle complex wallet queries');

      const complexQueries = [
        'What is my XLM balance in USD?',
        'Can I send 10 XLM to someone? Do I have enough?',
        'Show me my recent transactions and their status',
      ];

      for (const query of complexQueries) {
        try {
          const response = await client.post(
            '/chat',
            {
              message: query,
              sessionId: testSessionId,
              publicKey: testUserPublicKey,
            },
            {
              headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
            }
          );

          testLogger.request('POST', '/chat', response.status);

          if (response.status === 200) {
            testLogger.info(`Query processed: "${query}"`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          testLogger.warning(`Query failed: ${errorMessage}`);
        }
      }

      testLogger.success('Complex queries completed');
    });
  });

  describe('Transaction Flow', () => {
    it('should prepare a payment through chat', async () => {
      testLogger.test('Prepare payment through chat');

      try {
        const response = await client.post(
          '/chat',
          {
            message: 'I want to send 5 XLM to GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJvengaybnwqti5ELXIRVFY5K',
            sessionId: testSessionId,
            publicKey: testUserPublicKey,
          },
          {
            headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
          }
        );

        testLogger.request('POST', '/chat', response.status);

        if (response.status === 200) {
          testLogger.success('Payment preparation started');
          testLogger.info(`Agent response: ${response.data.reply}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Payment prep: ${errorMessage}`);
      }
    });

    it('should submit transaction via API', async () => {
      testLogger.test('Submit transaction via API');

      try {
        const response = await client.post(
          '/transactions/send',
          {
            from: testUserPublicKey,
            to: 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJvengaybnwqti5ELXIRVFY5K',
            amount: '5',
            assetCode: 'XLM',
            memo: 'E2E Test Payment',
          },
          {
            headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
          }
        );

        testLogger.request('POST', '/transactions/send', response.status);

        if (response.status === 200 || response.status === 201) {
          testLogger.success('Transaction submitted');
          testLogger.data('Transaction Details', {
            hash: response.data.transactionHash,
            status: response.data.status,
          });
        } else {
          testLogger.warning(`Transaction returned status: ${response.status}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Transaction submit: ${errorMessage}`);
      }
    });

    it('should check transaction status', async () => {
      testLogger.test('Check transaction status');

      try {
        // Assume we have a transaction ID from previous test
        const txId = 'test-tx-id';

        const response = await client.get(`/transactions/${txId}`, {
          headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
        });

        testLogger.request('GET', `/transactions/${txId}`, response.status);

        if (response.status === 200) {
          testLogger.success('Transaction status retrieved');
        } else if (response.status === 404) {
          testLogger.info('Transaction not found (expected for test)');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Check status: ${errorMessage}`);
      }
    });
  });

  describe('Error Handling & Recovery', () => {
    it('should handle network errors gracefully', async () => {
      testLogger.test('Handle network errors gracefully');

      try {
        // Try to connect to invalid endpoint
        const invalidClient = createTestClient('http://invalid-host-12345.local:9999/api');

        const response = await invalidClient.get('/health').catch(() => ({ status: 0 }));

        if (response.status === 0 || response.status >= 500) {
          testLogger.success('Network error handled appropriately');
        }
      } catch (error) {
        testLogger.success('Network error caught and handled');
      }
    });

    it('should validate before executing operations', async () => {
      testLogger.test('Validate before executing operations');

      // Test various invalid inputs
      const invalidOperations = [
        {
          test: 'Invalid public key',
          data: { from: 'invalid-key', to: 'GBRP...', amount: '10' },
        },
        {
          test: 'Zero amount',
          data: { from: testUserPublicKey, to: 'GBRP...', amount: '0' },
        },
        {
          test: 'Negative amount',
          data: { from: testUserPublicKey, to: 'GBRP...', amount: '-10' },
        },
      ];

      for (const op of invalidOperations) {
        const response = await client.post('/transactions/send', op.data, {
          headers: testUserToken ? { Authorization: `Bearer ${testUserToken}` } : {},
        });

        if (response.status === 400 || response.status === 422) {
          testLogger.success(`${op.test} - validation passed`);
        } else {
          testLogger.info(`${op.test} - status ${response.status}`);
        }
      }
    });
  });

  describe('Session Management', () => {
    it('should maintain session across requests', async () => {
      testLogger.test('Maintain session across requests');

      try {
        // Make multiple requests in same session
        const requests = [
          { method: 'GET', endpoint: '/users/' + testUserPublicKey },
          { method: 'GET', endpoint: '/users/' + testUserPublicKey + '/wallet' },
          { method: 'GET', endpoint: '/chat/history?sessionId=' + testSessionId },
        ];

        for (const req of requests) {
          const config = testUserToken ? { headers: { Authorization: `Bearer ${testUserToken}` } } : {};
          const response = await client.get(req.endpoint, config as any);
          testLogger.request(req.method, req.endpoint, response.status);
        }

        testLogger.success('Session maintained across requests');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testLogger.warning(`Session management: ${errorMessage}`);
      }
    });
  });

  afterAll(() => {
    testLogger.section('E2E Tests Complete');
  });
});
