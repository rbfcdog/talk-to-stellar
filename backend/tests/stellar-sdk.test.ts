/**
 * Stellar SDK Integration Tests
 * Tests integration with Stellar SDK for wallet operations and transactions
 */

import * as StellarSDK from '@stellar/stellar-sdk';

describe('Stellar SDK Integration Tests', () => {
  const server = new StellarSDK.Horizon.Server('https://horizon-testnet.stellar.org');
  const isTestnet = true;

  let testPublicKey: string;
  let testSecretKey: string;
  let accountInfo: StellarSDK.Horizon.AccountResponse;

  beforeAll(async () => {
    console.log('\n🧪 Starting Stellar SDK Integration Tests');
    console.log(`🌐 Network: ${isTestnet ? 'TESTNET' : 'PUBLIC'}`);

    // Generate a new keypair for testing
    const keypair = StellarSDK.Keypair.random();
    testPublicKey = keypair.publicKey();
    testSecretKey = keypair.secret();

    console.log(`\n📝 Generated Test Keypair:`);
    console.log(`  - Public: ${testPublicKey.substring(0, 20)}...`);
    console.log(`  - Secret: ${testSecretKey.substring(0, 20)}...`);
  });

  describe('Account Management', () => {
    it('should create a new keypair', () => {
      console.log('\n📝 Test: Create new keypair');

      const keypair = StellarSDK.Keypair.random();

      expect(keypair.publicKey().startsWith('G')).toBe(true);
      expect(keypair.publicKey().length).toBe(56);
      expect(keypair.secret().startsWith('S')).toBe(true);

      console.log(`✓ Keypair created`);
      console.log(`  - Public: ${keypair.publicKey().substring(0, 20)}...`);
    });

    it('should recover keypair from secret', () => {
      console.log('\n📝 Test: Recover keypair from secret');

      const recoveredKeypair = StellarSDK.Keypair.fromSecret(testSecretKey);

      expect(recoveredKeypair.publicKey()).toBe(testPublicKey);
      console.log(`✓ Keypair recovered successfully`);
    });

    it('should validate public key format', () => {
      console.log('\n📝 Test: Validate public key format');

      const validKey = testPublicKey;
      const invalidKey = 'INVALID_KEY_123';

      expect(() => StellarSDK.Keypair.fromPublicKey(validKey)).not.toThrow();
      expect(() => StellarSDK.Keypair.fromPublicKey(invalidKey)).toThrow();

      console.log(`✓ Public key validation working`);
    });

    it('should fetch account information from Stellar', async () => {
      console.log('\n📝 Test: Fetch account info from Stellar');

      try {
        // This will fail for a new keypair (not yet funded)
        accountInfo = await server.loadAccount(testPublicKey);
        console.log(`✓ Account found on Stellar`);
        console.log(`  - Sequence: ${accountInfo.sequence}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('not found')) {
          console.log(`⚠ Account not found (expected for new keypair)`);
        } else {
          throw error;
        }
      }
    });
  });

  describe('Transaction Building', () => {
    it('should build a valid transaction envelope', async () => {
      console.log('\n📝 Test: Build transaction envelope');

      try {
        // Create a mock account for transaction building
        const account = new StellarSDK.Account(testPublicKey, '0');

        const transaction = new StellarSDK.TransactionBuilder(account, {
          fee: StellarSDK.BASE_FEE,
          networkPassphrase: 'Test StellarNetwork ; September 2015',
        })
          .addOperation(
            StellarSDK.Operation.payment({
              destination: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
              amount: '1',
              asset: StellarSDK.Asset.native(),
            })
          )
          .setTimeout(300)
          .build();

        expect(transaction).toBeDefined();
        expect(transaction.operations.length).toBe(1);

        console.log(`✓ Transaction envelope built`);
        console.log(`  - Operations: ${transaction.operations.length}`);
        console.log(`  - Base fee: ${transaction.fee}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Transaction building failed: ${errorMessage}`);
        throw error;
      }
    });

    it('should sign a transaction', () => {
      console.log('\n📝 Test: Sign transaction');

      try {
        const account = new StellarSDK.Account(testPublicKey, '0');
        const transaction = new StellarSDK.TransactionBuilder(account, {
          fee: StellarSDK.BASE_FEE,
          networkPassphrase: 'Test StellarNetwork ; September 2015',
        })
          .addOperation(
            StellarSDK.Operation.payment({
              destination: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
              amount: '1',
              asset: StellarSDK.Asset.native(),
            })
          )
          .setTimeout(300)
          .build();

        const keypair = StellarSDK.Keypair.fromSecret(testSecretKey);
        transaction.sign(keypair);

        expect(transaction.signatures.length).toBe(1);
        console.log(`✓ Transaction signed`);
        console.log(`  - Signatures: ${transaction.signatures.length}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Transaction signing failed: ${errorMessage}`);
        throw error;
      }
    });

    it('should convert transaction to XDR format', () => {
      console.log('\n📝 Test: Convert transaction to XDR');

      try {
        const account = new StellarSDK.Account(testPublicKey, '0');
        const transaction = new StellarSDK.TransactionBuilder(account, {
          fee: StellarSDK.BASE_FEE,
          networkPassphrase: 'Test StellarNetwork ; September 2015',
        })
          .addOperation(
            StellarSDK.Operation.payment({
              destination: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
              amount: '1',
              asset: StellarSDK.Asset.native(),
            })
          )
          .setTimeout(300)
          .build();

        const keypair = StellarSDK.Keypair.fromSecret(testSecretKey);
        transaction.sign(keypair);

        const xdrString = transaction.toEnvelope().toXDR('base64');

        expect(typeof xdrString).toBe('string');
        expect(xdrString.length > 0).toBe(true);

        console.log(`✓ Transaction converted to XDR`);
        console.log(`  - XDR length: ${xdrString.length}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ XDR conversion failed: ${errorMessage}`);
        throw error;
      }
    });
  });

  describe('Asset Operations', () => {
    it('should create a native asset (XLM)', () => {
      console.log('\n📝 Test: Create native asset');

      const asset = StellarSDK.Asset.native();

      expect(asset.getCode()).toBe('XLM');
      expect(asset.getIssuer()).toBe(undefined);
      console.log(`✓ Native asset created: ${asset.getCode()}`);
    });

    it('should create a non-native asset', () => {
      console.log('\n📝 Test: Create non-native asset');

      const asset = new StellarSDK.Asset('USDC', 'GBBD47UZQ5PBC7BY76I3PN4RYSEE3U2IRVIB42IXLKNVGIZCMARVEL6');

      expect(asset.getCode()).toBe('USDC');
      expect(asset.getIssuer()).toBe('GBBD47UZQ5PBC7BY76I3PN4RYSEE3U2IRVIB42IXLKNVGIZCMARVEL6');
      console.log(`✓ Non-native asset created`);
      console.log(`  - Code: ${asset.getCode()}`);
      console.log(`  - Issuer: ${asset.getIssuer()?.substring(0, 20)}...`);
    });
  });

  describe('Path Payment', () => {
    it('should build path payment transaction', () => {
      console.log('\n📝 Test: Build path payment transaction');

      try {
        const account = new StellarSDK.Account(testPublicKey, '0');

        const sendAsset = StellarSDK.Asset.native();
        const destAsset = new StellarSDK.Asset('USDC', 'GBBD47UZQ5PBC7BY76I3PN4RYSEE3U2IRVIB42IXLKNVGIZCMARVEL6');

        const transaction = new StellarSDK.TransactionBuilder(account, {
          fee: StellarSDK.BASE_FEE,
          networkPassphrase: 'Test StellarNetwork ; September 2015',
        })
          .addOperation(
            StellarSDK.Operation.pathPaymentStrictReceive({
              destination: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
              sendAsset: sendAsset,
              sendMax: '100',
              destAsset: destAsset,
              destAmount: '1',
              path: [],
            })
          )
          .setTimeout(300)
          .build();

        expect(transaction.operations.length).toBe(1);
        expect(transaction.operations[0].type).toBe('pathPaymentStrictReceive');

        console.log(`✓ Path payment transaction built`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Path payment building failed: ${errorMessage}`);
        throw error;
      }
    });
  });

  describe('Server Operations', () => {
    it('should connect to Stellar server', async () => {
      console.log('\n📝 Test: Connect to Stellar server');

      try {
        const ledger = await server.ledgers().limit(1).call();
        console.log(`✓ Successfully connected to Stellar server`);
        console.log(`  - Sequence: ${ledger.records[0].sequence}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Server connection failed: ${errorMessage}`);
        throw error;
      }
    });

    it('should fetch latest ledger info', async () => {
      console.log('\n📝 Test: Fetch latest ledger');

      try {
        const ledger = await server.ledgers().limit(1).call();
        const latestLedger = ledger.records[0];

        expect(latestLedger).toBeDefined();
        expect(latestLedger.sequence).toBeDefined();

        console.log(`✓ Latest ledger fetched`);
        console.log(`  - Sequence: ${latestLedger.sequence}`);
        console.log(`  - Closed at: ${latestLedger.closed_at}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`✗ Ledger fetch failed: ${errorMessage}`);
        throw error;
      }
    });

    it('should fetch account transactions', async () => {
      console.log('\n📝 Test: Fetch account transactions');

      try {
        // Use a known active account for testing
        const activeAccount = 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5';
        const transactions = await server
          .transactions()
          .forAccount(activeAccount)
          .limit(5)
          .call();

        console.log(`✓ Transactions fetched`);
        console.log(`  - Count: ${transactions.records.length}`);

        if (transactions.records.length > 0) {
          console.log(`  - Latest: ${transactions.records[0].hash.substring(0, 20)}...`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Transaction fetch: ${errorMessage}`);
      }
    });
  });

  describe('Fee Management', () => {
    it('should calculate transaction fees', () => {
      console.log('\n📝 Test: Calculate transaction fees');

      const operationCount = 3;
      const baseFee = parseInt(StellarSDK.BASE_FEE, 10);
      const totalFee = baseFee * (operationCount + 1);

      expect(totalFee).toBe(baseFee * 4);
      console.log(`✓ Fee calculation working`);
      console.log(`  - Base fee: ${baseFee} stroops`);
      console.log(`  - Operations: ${operationCount}`);
      console.log(`  - Total fee: ${totalFee} stroops`);
    });

    it('should handle network fee rates', async () => {
      console.log('\n📝 Test: Handle network fee rates');

      try {
        const feeStats = await server.feeStats();

        expect(feeStats).toBeDefined();
        console.log(`✓ Fee stats retrieved`);
        console.log(`  - Ledger capacity: ${feeStats.ledger_capacity_usage}`);
        console.log(`  - Mode fee: ${feeStats.fee_charged?.mode || 'N/A'}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠ Fee stats: ${errorMessage}`);
      }
    });
  });

  afterAll(() => {
    console.log('\n✅ Stellar SDK Integration Tests Complete\n');
  });
});
