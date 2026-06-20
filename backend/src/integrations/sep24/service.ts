/**
 * SEP-24 Service
 *
 * Orchestrates:
 *   1. SEP-1  — TOML discovery
 *   2. SEP-10 — Challenge/response auth → JWT
 *   3. SEP-24 — Interactive deposit/withdrawal
 *
 * SEP-10 signing: uses the provided user secret key (passed from controller
 * after the frontend signs the challenge client-side, OR from a server keypair
 * for testing). Production flow should have the wallet sign client-side.
 */

import {
  Keypair,
  Transaction,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
} from '@stellar/stellar-sdk';
import { getSep24Client } from './client';
import { KNOWN_ANCHORS, loadSep24Config } from './config';
import {
  AnchorSession,
  AnchorTransaction,
  KnownAnchor,
  Sep24InfoResponse,
  Sep24InteractiveResponse,
  Sep24Kind,
  Sep24Transaction,
  StellarToml,
} from './types';
import { logger } from '../../utils/logger';
import { supabase } from '../../config/supabase';

export class Sep24Service {
  private readonly client = getSep24Client();
  private readonly config = loadSep24Config();

  // ── TOML discovery ───────────────────────────────────────────────

  async fetchToml(domain: string): Promise<StellarToml> {
    return this.client.fetchToml(domain);
  }

  async getAnchorInfo(domain: string): Promise<{ toml: StellarToml; info?: Sep24InfoResponse }> {
    const toml = await this.client.fetchToml(domain);
    let info: Sep24InfoResponse | undefined;
    if (toml.TRANSFER_SERVER_SEP0024) {
      try {
        info = await this.client.getInfo(toml.TRANSFER_SERVER_SEP0024);
      } catch (e: any) {
        logger.warn(`[sep24] getInfo failed for ${domain}: ${e.message}`);
      }
    }
    return { toml, info };
  }

  listKnownAnchors(): KnownAnchor[] {
    return KNOWN_ANCHORS;
  }

  // ── SEP-10 ───────────────────────────────────────────────────────

  /**
   * Fetch challenge XDR from the anchor, sign it with userSecret, return JWT.
   * In production: the frontend (wallet) signs the challenge — only secret is
   * needed here for server-side test flows.
   */
  async authenticate(
    domain: string,
    userPublicKey: string,
    userSecret: string,
  ): Promise<{ token: string; expiresAt: string }> {
    const toml = await this.client.fetchToml(domain);
    if (!toml.WEB_AUTH_ENDPOINT) throw new Error(`Anchor ${domain} has no WEB_AUTH_ENDPOINT in TOML`);

    const challenge = await this.client.getChallenge(toml.WEB_AUTH_ENDPOINT, userPublicKey, domain);
    const networkPassphrase = challenge.network_passphrase || this.config.networkPassphrase;

    // Sign the challenge transaction
    const tx = new Transaction(challenge.transaction, networkPassphrase);
    const keypair = Keypair.fromSecret(userSecret);
    tx.sign(keypair);
    const signedXdr = tx.toEnvelope().toXDR('base64');

    const tokenRes = await this.client.submitChallenge(toml.WEB_AUTH_ENDPOINT, signedXdr);

    // JWT typically valid for 24h — decode exp if needed; default to 24h
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Persist session
    await this.upsertSession({
      user_stellar_address: userPublicKey,
      anchor_domain: domain,
      jwt_token: tokenRes.token,
      expires_at: expiresAt,
    });

    return { token: tokenRes.token, expiresAt };
  }

  // ── SEP-24 interactive ───────────────────────────────────────────

  async startDeposit(
    domain: string,
    jwt: string,
    params: { asset_code: string; account?: string; amount?: string },
  ): Promise<Sep24InteractiveResponse> {
    const toml = await this.client.fetchToml(domain);
    if (!toml.TRANSFER_SERVER_SEP0024) throw new Error(`Anchor ${domain} has no SEP-24 transfer server`);
    return this.client.initiateDeposit(toml.TRANSFER_SERVER_SEP0024, jwt, params);
  }

  async startWithdrawal(
    domain: string,
    jwt: string,
    params: { asset_code: string; account?: string; amount?: string },
  ): Promise<Sep24InteractiveResponse> {
    const toml = await this.client.fetchToml(domain);
    if (!toml.TRANSFER_SERVER_SEP0024) throw new Error(`Anchor ${domain} has no SEP-24 transfer server`);
    return this.client.initiateWithdrawal(toml.TRANSFER_SERVER_SEP0024, jwt, params);
  }

  async getTransaction(domain: string, jwt: string, txId: string): Promise<Sep24Transaction> {
    const toml = await this.client.fetchToml(domain);
    if (!toml.TRANSFER_SERVER_SEP0024) throw new Error(`No transfer server for ${domain}`);
    const res = await this.client.getTransaction(toml.TRANSFER_SERVER_SEP0024, jwt, txId);
    await this.syncTransaction(domain, txId, res.transaction);
    return res.transaction;
  }

  async listTransactions(
    domain: string,
    jwt: string,
    params: { asset_code: string; limit?: number; kind?: Sep24Kind },
  ): Promise<Sep24Transaction[]> {
    const toml = await this.client.fetchToml(domain);
    if (!toml.TRANSFER_SERVER_SEP0024) return [];
    const res = await this.client.getTransactions(toml.TRANSFER_SERVER_SEP0024, jwt, params);
    return res.transactions;
  }

  // ── DB helpers ───────────────────────────────────────────────────

  private async upsertSession(data: {
    user_stellar_address: string;
    anchor_domain: string;
    jwt_token: string;
    expires_at: string;
  }): Promise<void> {
    try {
      await supabase.from('anchor_sessions').upsert(
        { ...data, created_at: new Date().toISOString() },
        { onConflict: 'user_stellar_address,anchor_domain' },
      );
    } catch (e: any) {
      logger.warn(`[sep24] session upsert failed: ${e.message}`);
    }
  }

  private async syncTransaction(domain: string, txId: string, tx: Sep24Transaction): Promise<void> {
    try {
      await supabase.from('anchor_transactions').upsert(
        {
          sep24_transaction_id: tx.id,
          anchor_domain: domain,
          user_stellar_address: tx.from || tx.to || '',
          kind: tx.kind,
          asset_code: tx.amount_in_asset?.split(':')[1] || 'USDC',
          status: tx.status,
          amount_in: tx.amount_in || null,
          amount_out: tx.amount_out || null,
          amount_fee: tx.amount_fee || null,
          interactive_url: tx.more_info_url || null,
          stellar_transaction_id: tx.stellar_transaction_id || null,
          external_transaction_id: tx.external_transaction_id || null,
          started_at: tx.started_at,
          completed_at: tx.completed_at || null,
          last_synced_at: new Date().toISOString(),
          raw_response: tx as unknown as Record<string, unknown>,
        },
        { onConflict: 'sep24_transaction_id' },
      );
    } catch (e: any) {
      logger.warn(`[sep24] transaction sync failed: ${e.message}`);
    }
  }
}

let _service: Sep24Service | null = null;

export function getSep24Service(): Sep24Service {
  if (!_service) _service = new Sep24Service();
  return _service;
}
