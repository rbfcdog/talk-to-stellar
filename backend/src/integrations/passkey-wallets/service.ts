/**
 * Passkey Wallet Service (Server Side)
 *
 * Handles the backend responsibilities for Stellar passkey smart wallets:
 * - Store contract IDs registered by client-side PasskeyKit
 * - Relay signed transactions via Launchtube (fee sponsoring)
 * - Look up contract ID by WebAuthn keyId
 * - Check account balance on Horizon
 *
 * The WebAuthn credential creation/signing always happens client-side.
 * This service only handles persistence and transaction relay.
 *
 * Launchtube: https://github.com/kalepail/launchtube
 * Passkey Kit: https://github.com/kalepail/passkey-kit
 */

import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { PasskeyWalletCreateInput, PasskeyWalletRecord } from './types';

const RPC_URL = process.env.STELLAR_NETWORK === 'mainnet'
  ? 'https://mainnet.sorobanrpc.com'
  : 'https://soroban-testnet.stellar.org';

const LAUNCHTUBE_URL = process.env.LAUNCHTUBE_URL
  || (process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://launchtube.xyz'
    : 'https://launchtube.xyz/testnet');

const LAUNCHTUBE_JWT = process.env.LAUNCHTUBE_JWT || '';

// Lazy-load passkey-kit — it ships only TypeScript source (no compiled JS),
// which Node v26 refuses to strip from node_modules at startup.
// Loading inside functions means the server boots even when the package is unavailable.
function getServer(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PasskeyServer } = require('passkey-kit');
  return new PasskeyServer({
    rpcUrl: RPC_URL,
    relayerUrl: LAUNCHTUBE_URL,
    relayerApiKey: LAUNCHTUBE_JWT,
  });
}

export const PasskeyWalletService = {
  /**
   * Store a newly created passkey wallet contract in DB.
   * Called after client-side PasskeyKit.createWallet() succeeds.
   */
  async register(input: PasskeyWalletCreateInput): Promise<PasskeyWalletRecord> {
    const row = {
      ...input,
      funded: false,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('passkey_wallets')
      .upsert(row, { onConflict: 'contract_id' })
      .select()
      .single();
    if (error) throw new Error(`DB error: ${error.message}`);
    return data as PasskeyWalletRecord;
  },

  /**
   * Look up a contract ID from a WebAuthn keyId.
   * Uses PasskeyServer + Mercury indexer to resolve keyId → contractId.
   */
  async getContractId(keyIdBase64: string): Promise<string | null> {
    try {
      const server = getServer();
      const contractId = await server.getContractId({ keyId: keyIdBase64 });
      return contractId || null;
    } catch (e: any) {
      logger.warn(`[passkey-wallets] getContractId failed: ${e.message}`);
      // Fall back to DB lookup
      const { data } = await supabase
        .from('passkey_wallets')
        .select('contract_id')
        .eq('key_id_base64', keyIdBase64)
        .maybeSingle();
      return data?.contract_id || null;
    }
  },

  /**
   * Relay a signed transaction via Launchtube (fee sponsoring).
   * The client builds + signs the transaction, we submit it.
   */
  async relayTransaction(signedXdr: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    if (!LAUNCHTUBE_JWT) {
      return { success: false, error: 'LAUNCHTUBE_JWT not configured — set it to enable fee sponsoring' };
    }
    try {
      const server = getServer();
      const result = await server.send(signedXdr);
      logger.info(`[passkey-wallets] Launchtube relay success`);
      return { success: true, hash: (result as any)?.hash };
    } catch (e: any) {
      logger.warn(`[passkey-wallets] Launchtube relay failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  },

  async getWallet(contractId: string): Promise<PasskeyWalletRecord | null> {
    const { data } = await supabase
      .from('passkey_wallets')
      .select('*')
      .eq('contract_id', contractId)
      .maybeSingle();
    return data as PasskeyWalletRecord | null;
  },

  async listWallets(userId: string): Promise<PasskeyWalletRecord[]> {
    const { data } = await supabase
      .from('passkey_wallets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return (data || []) as PasskeyWalletRecord[];
  },

  async getBalance(contractId: string): Promise<{ xlm?: string; usdc?: string; error?: string }> {
    try {
      const horizonUrl = process.env.STELLAR_NETWORK === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';
      const res = await fetch(`${horizonUrl}/accounts/${contractId}`);
      if (!res.ok) return { xlm: '0', usdc: '0' };
      const account = await res.json() as any;
      const xlm = account.balances?.find((b: any) => b.asset_type === 'native')?.balance || '0';
      const usdcIssuer = process.env.STELLAR_NETWORK === 'mainnet'
        ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
        : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
      const usdc = account.balances?.find((b: any) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer)?.balance || '0';
      return { xlm, usdc };
    } catch (e: any) {
      return { error: e.message };
    }
  },

  /** Get signers (WebAuthn credentials) registered to a contract */
  async getSigners(contractId: string) {
    try {
      const server = getServer();
      return await server.getSigners(contractId);
    } catch (e: any) {
      logger.warn(`[passkey-wallets] getSigners failed: ${e.message}`);
      return [];
    }
  },
};
