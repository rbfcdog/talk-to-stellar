/**
 * DeFindex Yield Service
 *
 * Wraps the @defindex/sdk to provide:
 * - Vault info (APY, TVL, strategy)
 * - User position balance
 * - Deposit/withdraw XDR generation (user signs + submits)
 *
 * Integration pattern (from Meru wallet case study):
 * 1. Backend queries vault info + user balance
 * 2. Backend builds deposit XDR → frontend signs → backend submits
 * 3. Daily WhatsApp: "Você ganhou R$0.38 hoje"
 */

import { DefindexSDK } from '@defindex/sdk';
import { loadDefindexConfig, DEFINDEX_USDC_VAULT_MAINNET, DEFINDEX_USDC_VAULT_TESTNET } from './config';
import { logger } from '../../utils/logger';

function getSdk(): DefindexSDK {
  const config = loadDefindexConfig();
  return new DefindexSDK({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    defaultNetwork: config.defaultNetwork as any,
  });
}

function getVaultAddress(network?: string): string {
  const n = network || loadDefindexConfig().defaultNetwork;
  return (n === 'mainnet' || n === 'public') ? DEFINDEX_USDC_VAULT_MAINNET : DEFINDEX_USDC_VAULT_TESTNET;
}

export const DefindexService = {
  async getVaultInfo(vaultAddress?: string) {
    const sdk = getSdk();
    const config = loadDefindexConfig();
    const vault = vaultAddress || getVaultAddress(config.defaultNetwork);
    try {
      const [info, apy] = await Promise.all([
        sdk.getVaultInfo(vault, config.defaultNetwork as any),
        sdk.getVaultAPY(vault, config.defaultNetwork as any).catch(() => null),
      ]);
      return { vault, info, apy };
    } catch (e: any) {
      logger.warn(`[defindex] getVaultInfo failed: ${e.message}`);
      throw e;
    }
  },

  async getUserBalance(userAddress: string, vaultAddress?: string) {
    const sdk = getSdk();
    const config = loadDefindexConfig();
    const vault = vaultAddress || getVaultAddress(config.defaultNetwork);
    try {
      const balance = await sdk.getVaultBalance(vault, userAddress, config.defaultNetwork as any);
      return { vault, userAddress, balance };
    } catch (e: any) {
      logger.warn(`[defindex] getUserBalance failed: ${e.message}`);
      throw e;
    }
  },

  async buildDepositXdr(userAddress: string, amountStroops: string, vaultAddress?: string) {
    const sdk = getSdk();
    const config = loadDefindexConfig();
    const vault = vaultAddress || getVaultAddress(config.defaultNetwork);
    try {
      const result = await sdk.depositToVault(vault, {
        caller: userAddress,
        amounts: [parseInt(amountStroops, 10)],
        invest: false,
      }, config.defaultNetwork as any);
      return { vault, xdr: result };
    } catch (e: any) {
      logger.warn(`[defindex] buildDepositXdr failed: ${e.message}`);
      throw e;
    }
  },

  async buildWithdrawXdr(userAddress: string, sharesAmount: string, vaultAddress?: string) {
    const sdk = getSdk();
    const config = loadDefindexConfig();
    const vault = vaultAddress || getVaultAddress(config.defaultNetwork);
    try {
      const result = await sdk.withdrawFromVault(vault, {
        caller: userAddress,
        amounts: [parseInt(sharesAmount, 10)],
      }, config.defaultNetwork as any);
      return { vault, xdr: result };
    } catch (e: any) {
      logger.warn(`[defindex] buildWithdrawXdr failed: ${e.message}`);
      throw e;
    }
  },

  async listVaults() {
    const sdk = getSdk();
    try {
      const health = await sdk.healthCheck();
      return health;
    } catch (e: any) {
      logger.warn(`[defindex] listVaults failed: ${e.message}`);
      return { error: e.message };
    }
  },

  getDefaultVault() {
    return getVaultAddress();
  },
};
