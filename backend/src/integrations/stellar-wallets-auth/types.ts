/**
 * Stellar Wallets Auth Types
 *
 * Implements SEP-10 challenge/verify for our own server,
 * so any wallet (Freighter, Albedo, xBull, LOBSTR, etc.)
 * can authenticate without a password.
 */

export interface Sep10Challenge {
  transaction: string;
  network_passphrase: string;
}

export interface WalletAuthSession {
  id: string;
  stellar_address: string;
  token: string;
  wallet_type?: string;
  expires_at: string;
  created_at: string;
}

export interface WalletAuthVerifyResult {
  authenticated: boolean;
  stellar_address: string;
  token: string;
  expires_at: string;
}

export type SupportedWallet =
  | 'freighter'
  | 'albedo'
  | 'xbull'
  | 'lobstr'
  | 'walletconnect'
  | 'rabet'
  | 'unknown';
