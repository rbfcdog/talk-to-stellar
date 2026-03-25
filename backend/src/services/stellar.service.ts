/**
 * Stellar SDK Service for blockchain operations
 */

import * as StellarSDK from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';

// Server is under Horizon namespace in v14.1.1
const { Server } = StellarSDK.Horizon;

export interface PaymentData {
  destination: string;
  amount: string;
  asset_code: string;
}

export interface AccountInfo {
  id: string;
  balances: Array<{
    balance: string;
    asset_type: string;
    asset_code?: string;
  }>;
  sequence: string;
}

let stellarServer: any = null;

function getStellarServer(): any {
  if (!stellarServer) {
    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    stellarServer = new Server(horizonUrl);
  }
  return stellarServer;
}

export class StellarService {
  /**
   * Get account information
   */
  async getAccount(publicKey: string): Promise<AccountInfo> {
    try {
      const server = getStellarServer();
      const account = await server.accounts().accountId(publicKey).call();

      logger.debug(`Retrieved account info for ${publicKey}`);

      return {
        id: account.id,
        balances: account.balances,
        sequence: account.sequence,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get account: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get account balance for XLM
   */
  async getBalance(publicKey: string): Promise<string> {
    try {
      const account = await this.getAccount(publicKey);
      const xlmBalance = account.balances.find(
        (b) => b.asset_type === 'native'
      );

      return xlmBalance?.balance || '0';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get balance: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Build a payment transaction (not submitted)
   */
  async buildPayment(
    sourcePublicKey: string,
    payment: PaymentData,
    memo?: string
  ): Promise<string> {
    try {
      const server = getStellarServer();
      const sourceAccountRecord = await server
        .accounts()
        .accountId(sourcePublicKey)
        .call();

      // Convert AccountRecord to Account for TransactionBuilder
      const sourceAccount = new StellarSDK.Account(
        sourceAccountRecord.account_id,
        sourceAccountRecord.sequence
      );

      let builder = new StellarSDK.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: process.env.STELLAR_NETWORK === 'PUBLIC'
          ? 'Public Global Stellar Network ; May 2015'
          : 'Test StellarNetwork ; September 2015',
      });

      if (memo) {
        builder = builder.addMemo(StellarSDK.Memo.text(memo));
      }

      const asset =
        payment.asset_code === 'XLM'
          ? StellarSDK.Asset.native()
          : new StellarSDK.Asset(payment.asset_code, sourcePublicKey);

      const transaction = builder
        .addOperation(
          StellarSDK.Operation.payment({
            destination: payment.destination,
            asset,
            amount: payment.amount,
          })
        )
        .setTimeout(180)
        .build();

      const xdr = transaction.toXDR();
      logger.debug(`Built payment XDR for ${payment.destination}`);

      return xdr;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to build payment: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Submit a signed transaction
   */
  async submitTransaction(xdr: string): Promise<string> {
    try {
      const server = getStellarServer();
      const transaction = StellarSDK.TransactionBuilder.fromXDR(
        xdr,
        process.env.STELLAR_NETWORK === 'PUBLIC'
          ? 'Public Global Stellar Network ; May 2015'
          : 'Test StellarNetwork ; September 2015'
      );

      const result = await server.submitTransaction(transaction);
      const hash = (result as any).hash || (result as any).id || '';
      logger.info(`Transaction submitted: ${hash}`);

      return hash;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to submit transaction: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get operation history for account
   */
  async getOperationHistory(publicKey: string, limit: number = 10): Promise<Array<any>> {
    try {
      const server = getStellarServer();
      const operations = await server
        .operations()
        .forAccount(publicKey)
        .limit(limit)
        .order('desc')
        .call();

      logger.debug(`Retrieved ${operations.records.length} operations for ${publicKey}`);

      return operations.records;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to get operation history: ${errorMessage}`);
      throw error;
    }
  }
}

let stellarServiceInstance: StellarService | null = null;

export function getStellarService(): StellarService {
  if (!stellarServiceInstance) {
    stellarServiceInstance = new StellarService();
  }
  return stellarServiceInstance;
}
