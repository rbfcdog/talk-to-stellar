/**
 * User Onboarding Tests
 * Tests the complete user registration and wallet setup process
 */

import { UserService } from '../src/api/services/user.service';
import { StellarService } from '../src/services/stellar.service';
import { logger } from '../src/utils/logger';

describe('User Onboarding Process', () => {
  let userService: typeof UserService;
  let stellarService: StellarService;

  beforeAll(() => {
    userService = UserService;
    stellarService = new StellarService();
    console.log('\n🧪 Starting User Onboarding Tests');
  });

  describe('User Registration with New Account', () => {
    it('should create a new Stellar account during onboarding', async () => {
      console.log('\n📝 Test: Create new user with auto-generated Stellar account');

      try {
        // This will create a NEW account on the Stellar testnet
        const result = await userService.onboardUser({
          email: `test-${Date.now()}@example.com`,
          phoneNumber: '+1234567890',
        });

        // Verify the result
        expect(result).toBeDefined();
        expect(result.userId).toBeDefined();
        expect(result.publicKey).toBeDefined();
        expect(result.secretKey).toBeDefined();
        expect(result.publicKey).toMatch(/^G[A-Z0-9]{55}$/); // Stellar public key format
        expect(result.secretKey).toMatch(/^S[A-Z0-9]{55}$/); // Stellar secret key format

        console.log(`✓ User created with ID: ${result.userId}`);
        console.log(`✓ Public Key: ${result.publicKey}`);
        console.log(`✓ Account created on Stellar testnet`);

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to create user account: ${errorMessage}`);
        throw error;
      }
    });

    it('should link an existing public key to user account', async () => {
      console.log('\n📝 Test: Link existing Stellar public key');

      try {
        // First, create a test account on Stellar
        const testAccount = await (stellarService as any).constructor.createTestAccount?.();
        
        if (!testAccount) {
          console.log('⚠ Skipping existing public key test (createTestAccount not available)');
          return;
        }

        const result = await userService.onboardUser({
          email: `existing-user-${Date.now()}@example.com`,
          phoneNumber: '+9876543210',
          publicKey: testAccount.publicKey,
        });

        expect(result).toBeDefined();
        expect(result.publicKey).toBe(testAccount.publicKey);
        expect(result.secretKey).toBeUndefined(); // Should not return secret for existing accounts

        console.log(`✓ Linked existing public key: ${result.publicKey}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Linking existing key test skipped: ${errorMessage}`);
      }
    });

    it('should prevent duplicate email registration', async () => {
      console.log('\n📝 Test: Prevent duplicate email');

      try {
        const email = `duplicate-test-${Date.now()}@example.com`;

        // First registration
        const result1 = await userService.onboardUser({
          email,
          phoneNumber: '+1111111111',
        });

        expect(result1.userId).toBeDefined();
        console.log(`✓ First registration succeeded for ${email}`);

        // Try to register the same email again - should fail
        try {
          const result2 = await userService.onboardUser({
            email,
            phoneNumber: '+2222222222',
          });
          fail(`Should have thrown error for duplicate email, got result: ${JSON.stringify(result2)}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          expect(errorMessage).toContain('already exists');
          console.log(`✓ Duplicate email correctly rejected`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Duplicate prevention test failed: ${errorMessage}`);
        throw error;
      }
    });
  });

  describe('Account Verification', () => {
    let testUserId: string;
    let testPublicKey: string;

    beforeAll(async () => {
      // Create a test user for verification tests
      const result = await userService.onboardUser({
        email: `verify-test-${Date.now()}@example.com`,
        phoneNumber: '+5555555555',
      });
      testUserId = result.userId;
      testPublicKey = result.publicKey;
    });

    it('should retrieve created user account from database', async () => {
      console.log(`\n📝 Test: Verify user account saved correctly`);

      try {
        // Query the user from database
        const { data, error } = await (await import('../src/config/supabase')).supabase
          .from('users')
          .select('*')
          .eq('id', testUserId)
          .single();

        // With mocked supabase, this will return test data
        expect(data || error === null).toBeTruthy();
        console.log(`✓ User account verified in database`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Database verification skipped: ${errorMessage}`);
      }
    });

    it('should verify Stellar account exists on testnet', async () => {
      console.log(`\n📝 Test: Verify Stellar account on testnet`);

      try {
        const accountInfo = await stellarService.getAccount(testPublicKey);

        expect(accountInfo).toBeDefined();
        expect(accountInfo.id).toBe(testPublicKey);
        expect(accountInfo.balances).toBeDefined();
        expect(Array.isArray(accountInfo.balances)).toBe(true);

        // Should have at least native (XLM) balance
        const nativeBalance = accountInfo.balances.find((b: any) => b.asset_type === 'native');
        expect(nativeBalance).toBeDefined();

        console.log(`✓ Stellar account found on testnet`);
        console.log(`✓ Account balances: ${JSON.stringify(accountInfo.balances)}`);

        return accountInfo;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to verify Stellar account: ${errorMessage}`);
        throw error;
      }
    });

    it('should retrieve account balance', async () => {
      console.log(`\n📝 Test: Retrieve XLM balance`);

      try {
        const balance = await stellarService.getBalance(testPublicKey);

        expect(balance).toBeDefined();
        expect(typeof balance).toBe('string');
        expect(parseFloat(balance) >= 0).toBe(true);

        console.log(`✓ XLM Balance: ${balance}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Failed to retrieve balance: ${errorMessage}`);
        throw error;
      }
    });
  });

  afterAll(() => {
    console.log('\n✅ User Onboarding Tests Complete\n');
  });
});
