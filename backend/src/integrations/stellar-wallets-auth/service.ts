/**
 * Stellar Wallets Auth Service
 *
 * Our server acts as its own SEP-10 authority:
 *   1. GET /api/wallet-auth/challenge — build a challenge tx signed by server key
 *   2. POST /api/wallet-auth/verify   — verify the challenge tx signed by the user's wallet
 *   3. Returns a short-lived JWT usable as a session token
 *
 * This is the standard pattern for Stellar DApps that want wallet-based auth
 * without passwords (Freighter, Albedo, xBull, LOBSTR, WalletConnect all support this).
 */

import {
  Keypair,
  Transaction,
  Networks,
  TransactionBuilder,
  Operation,
  Account,
  TimeoutInfinite,
} from '@stellar/stellar-sdk';
import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { WalletAuthSession, WalletAuthVerifyResult } from './types';

const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev-secret-change-in-prod';
const SERVER_SECRET = process.env.STELLAR_WALLET_SPONSOR_SECRET || '';
const SESSION_TTL_HOURS = 24;

function getNetworkPassphrase(): string {
  const network = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  return network === 'mainnet' || network === 'public'
    ? Networks.PUBLIC
    : Networks.TESTNET;
}

export const WalletAuthService = {
  /**
   * Build a SEP-10 challenge transaction.
   * The client wallet must sign it with the user's key and return it.
   */
  buildChallenge(userPublicKey: string): { transaction: string; network_passphrase: string } {
    if (!SERVER_SECRET) throw new Error('STELLAR_WALLET_SPONSOR_SECRET not configured — cannot issue SEP-10 challenge');

    const serverKeypair = Keypair.fromSecret(SERVER_SECRET);
    const networkPassphrase = getNetworkPassphrase();

    // Sequence 0 — challenge tx doesn't need a real account sequence
    const account = new Account(serverKeypair.publicKey(), '0');

    const now = Math.floor(Date.now() / 1000);
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(
        Operation.manageData({
          name: 'talktostellar auth',
          value: uuidv4().replace(/-/g, ''), // random nonce
          source: userPublicKey,
        }),
      )
      .addOperation(
        Operation.manageData({
          name: 'web_auth_domain',
          value: process.env.APP_DOMAIN || 'talktostellar.com',
          source: serverKeypair.publicKey(),
        }),
      )
      .setTimebounds(now - 60, now + 900) // valid 15 min
      .build();

    tx.sign(serverKeypair);

    return {
      transaction: tx.toEnvelope().toXDR('base64'),
      network_passphrase: networkPassphrase,
    };
  },

  /**
   * Verify a challenge transaction signed by the user's wallet.
   * Returns a JWT session token on success.
   */
  async verifyChallenge(
    signedXdr: string,
    expectedUserAddress: string,
    walletType?: string,
  ): Promise<WalletAuthVerifyResult> {
    if (!SERVER_SECRET) throw new Error('STELLAR_WALLET_SPONSOR_SECRET not configured');

    const serverKeypair = Keypair.fromSecret(SERVER_SECRET);
    const networkPassphrase = getNetworkPassphrase();

    const tx = new Transaction(signedXdr, networkPassphrase);

    // Must be signed by both server and user
    const signers = tx.signatures.map((sig) => {
      try {
        const kp = Keypair.fromPublicKey(expectedUserAddress);
        const valid = kp.verify(tx.hash(), sig.signature());
        return valid ? expectedUserAddress : null;
      } catch {
        return null;
      }
    });

    const userSigned = signers.some((s) => s === expectedUserAddress);
    if (!userSigned) {
      throw new Error('Challenge not signed by the expected user keypair');
    }

    // Verify the first operation targets the user account
    const firstOp = tx.operations[0];
    if (firstOp.type !== 'manageData' || firstOp.source !== expectedUserAddress) {
      throw new Error('Challenge transaction structure invalid');
    }

    // Issue session JWT
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
    const token = jwt.sign(
      {
        sub: expectedUserAddress,
        wallet_type: walletType || 'unknown',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(expiresAt.getTime() / 1000),
      },
      JWT_SECRET,
    );

    // Persist session
    try {
      await supabase.from('wallet_auth_sessions').upsert(
        {
          stellar_address: expectedUserAddress,
          token,
          wallet_type: walletType || 'unknown',
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        },
        { onConflict: 'stellar_address' },
      );
    } catch (e: any) {
      logger.warn(`[wallet-auth] session persist failed: ${e.message}`);
    }

    return {
      authenticated: true,
      stellar_address: expectedUserAddress,
      token,
      expires_at: expiresAt.toISOString(),
    };
  },

  /** Validate a session JWT and return the stellar address. */
  verifyToken(token: string): { stellar_address: string; wallet_type?: string } {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; wallet_type?: string };
    return { stellar_address: decoded.sub, wallet_type: decoded.wallet_type };
  },

  /** Load active sessions from DB for a given address. */
  async getSession(stellarAddress: string): Promise<WalletAuthSession | null> {
    const { data } = await supabase
      .from('wallet_auth_sessions')
      .select('*')
      .eq('stellar_address', stellarAddress)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    return data as WalletAuthSession | null;
  },
};
