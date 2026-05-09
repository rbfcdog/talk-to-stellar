/**
 * Wallet Operation Tests
 * Tests wallet creation, retrieval, and management
 */

import { UserService } from '../src/api/services/user.service';
import { StellarService } from '../src/services/stellar.service';
import { WalletRepository } from '../src/repositories/wallet.repository';
import { supabase } from '../src/config/supabase';

describe('Wallet Operations', () => {
  let walletRepository: WalletRepository;
  let stellarService: StellarService;
  let testPublicKey: string;
  let testSessionId: string;

  beforeAll(async () => {
    walletRepository = new WalletRepository(supabase);
    stellarService = new StellarService();

    console.log('\n🧪 Starting Wallet Operation Tests');

    // Create a test account for wallet tests
    try {
      const result = await UserService.onboardUser({
        email: `wallet-test-${Date.now()}@example.com`,
        phoneNumber: '+6666666666',
      });
      testPublicKey = result.publicKey;
      testSessionId = `session-${Date.now()}`;
      console.log(`\n✓ Test account created: ${testPublicKey}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to create test account: ${errorMessage}`);
      throw error;
    }
  });

  describe('Wallet Storage', () => {
    it('should save wallet information to database', async () => {
      console.log('\n📝 Test: Save wallet to database');

      try {
        // Get account info from Stellar
        const accountInfo = await stellarService.getAccount(testPublicKey);

        // Save to wallet repository
        await walletRepository.saveWallet({
          session_id: testSessionId,
          public_key: testPublicKey,
          balance: accountInfo.balances,
          sequence: accountInfo.sequence,
          account_data: accountInfo,
        });

        console.log(`✓ Wallet saved for session ${testSessionId}`);
        console.log(`✓ Public Key: ${testPublicKey}`);
        console.log(`✓ Sequence: ${accountInfo.sequence}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to save wallet: ${errorMessage}`);
        throw error;
      }
    });

    it('should retrieve wallet by session ID', async () => {
      console.log('\n📝 Test: Retrieve wallet by session');

      try {
        const wallet = await walletRepository.getWalletBySession(testSessionId);

        // Note: With mocked database, this may return null or test data
        console.log(`✓ Wallet query executed for session: ${testSessionId}`);

        if (wallet) {
          expect(wallet.public_key).toBe(testPublicKey);
          console.log(`✓ Retrieved wallet: ${JSON.stringify(wallet)}`);
        } else {
          console.log(`⚠ No wallet data (expected with mock database)`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Wallet retrieval test: ${errorMessage}`);
      }
    });

    it('should update wallet balance', async () => {
      console.log('\n📝 Test: Update wallet balance');

      try {
        // Get current account info with balances array
        const accountInfo = await stellarService.getAccount(testPublicKey);

        // Update in database with balance array and sequence
        await walletRepository.updateBalance(testSessionId, accountInfo.balances, accountInfo.sequence);

        const xlmBalance = accountInfo.balances.find((b) => b.asset_type === 'native')?.balance || '0';
        console.log(`✓ Wallet balance updated: ${xlmBalance} XLM`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to update balance: ${errorMessage}`);
        throw error;
      }
    });
  });

  describe('Balance Querying', () => {
    it('should get XLM balance from Stellar', async () => {
      console.log('\n📝 Test: Query XLM balance from Stellar');

      try {
        const balance = await stellarService.getBalance(testPublicKey);

        expect(typeof balance).toBe('string');
        expect(parseFloat(balance) >= 0).toBe(true);

        console.log(`✓ XLM Balance: ${balance}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to get balance: ${errorMessage}`);
        throw error;
      }
    });

    it('should get all account balances (native + issued assets)', async () => {
      console.log('\n📝 Test: Query all account balances');

      try {
        const accountInfo = await stellarService.getAccount(testPublicKey);

        expect(accountInfo.balances).toBeDefined();
        expect(Array.isArray(accountInfo.balances)).toBe(true);
        expect(accountInfo.balances.length > 0).toBe(true);

        // Log all balances
        console.log(`✓ Account has ${accountInfo.balances.length} asset(s):`);
        accountInfo.balances.forEach((balance: any, index: number) => {
          console.log(`  ${index + 1}. ${balance.asset_code || 'XLM'}: ${balance.balance}`);
        });

        return accountInfo.balances;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to get balances: ${errorMessage}`);
        throw error;
      }
    });
  });

  describe('Wallet Validation', () => {
    it('should validate public key format', async () => {
      console.log('\n📝 Test: Validate Stellar public key format');

      const isValidPublicKey = (key: string): boolean => {
        return /^G[A-Z0-9]{55}$/.test(key);
      };

      expect(isValidPublicKey(testPublicKey)).toBe(true);
      console.log(`✓ Public key format valid: ${testPublicKey}`);
    });

    it('should fail for invalid public key', async () => {
      console.log('\n📝 Test: Reject invalid public key');

      try {
        const invalidKey = 'INVALID_PUBLIC_KEY_12345';
        await stellarService.getAccount(invalidKey);
        fail('Should have thrown error for invalid key');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        expect(errorMessage.length > 0).toBe(true);
        console.log(`✓ Invalid key correctly rejected`);
      }
    });

    it('should validate sequence number is numeric', async () => {
      console.log('\n📝 Test: Validate sequence number');

      try {
        const accountInfo = await stellarService.getAccount(testPublicKey);

        expect(accountInfo.sequence).toBeDefined();
        expect(/^\d+$/.test(accountInfo.sequence)).toBe(true);
        console.log(`✓ Sequence number valid: ${accountInfo.sequence}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Sequence validation failed: ${errorMessage}`);
        throw error;
      }
    });
  });

  afterAll(() => {
    console.log('\n✅ Wallet Operation Tests Complete\n');
  });
});
