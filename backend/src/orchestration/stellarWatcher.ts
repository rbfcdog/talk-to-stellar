/**
 * Stellar Settlement Watcher
 *
 * Polls Horizon for transfers in CONVERTING state that have a submitted
 * transaction hash recorded in the transfer.stellar JSON. On confirmation it
 * calls TransferOrchestrator.confirmStellarSettlement. It never fabricates a
 * settlement; missing or unconfirmed hashes fail after the configured window.
 */

import { transferRepository } from '../api/repository/transfer.repository';
import { orchestrator } from './TransferOrchestrator';
import { Transfer } from './types';
import { logger } from '../utils/logger';

interface WatcherConfig {
  intervalMs: number;
  maxAttempts: number;
  horizonUrl: string;
}

const DEFAULT_CONFIG: WatcherConfig = {
  intervalMs: parseInt(process.env.STELLAR_WATCHER_INTERVAL_MS || '10000', 10),
  maxAttempts: parseInt(process.env.STELLAR_WATCHER_MAX_ATTEMPTS || '60', 10),
  horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
};

export class StellarSettlementWatcher {
  private config: WatcherConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: Partial<WatcherConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info(`[stellar-watcher] Starting interval=${this.config.intervalMs}ms max_attempts=${this.config.maxAttempts}`);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    logger.info('[stellar-watcher] Stopped');
  }

  async poll(): Promise<void> {
    try {
      const converting = await transferRepository.list({ state: 'CONVERTING', limit: 50 });
      for (const transfer of converting) {
        await this.checkTransfer(transfer).catch((error) => {
          logger.warn(`[stellar-watcher] check_failed ref=${transfer.public_ref} error=${error instanceof Error ? error.message : String(error)}`);
        });
      }
    } catch (error) {
      logger.error(`[stellar-watcher] poll_failed error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async checkTransfer(transfer: Transfer): Promise<void> {
    const stellar = (transfer.stellar || {}) as Record<string, unknown>;
    const txHash = String(stellar.submitted_tx_hash || stellar.tx_hash || '').trim();
    const startedAt = Date.parse(transfer.updated_at);
    const elapsedMs = Number.isFinite(startedAt) ? Date.now() - startedAt : 0;
    const exhausted = elapsedMs > this.config.intervalMs * this.config.maxAttempts;

    if (!txHash) {
      if (exhausted) {
        await orchestrator.fail(transfer.id, 'Stellar watcher exhausted without a submitted transaction hash.', 'poller:stellar');
      }
      return;
    }

    const confirmation = await checkHorizonTx(txHash, this.config.horizonUrl);
    if (confirmation) {
      await orchestrator.confirmStellarSettlement(transfer.id, {
        tx_hash: txHash,
        ledger: confirmation.ledger,
        network: this.config.horizonUrl.includes('testnet') ? 'testnet' : 'mainnet',
        settled_at: confirmation.settledAt,
        source_account_masked: String(stellar.source_account_masked || 'stellar:masked'),
        asset: String(stellar.asset || 'USDC'),
        path_used: Array.isArray(stellar.path_used) ? stellar.path_used.map(String) : ['BRL', 'USDC'],
      }, 'poller:stellar');
      logger.info(`[stellar-watcher] confirmed ref=${transfer.public_ref} tx=${txHash}`);
      return;
    }

    if (exhausted) {
      await orchestrator.fail(transfer.id, `Stellar watcher exhausted before Horizon confirmed tx ${txHash}.`, 'poller:stellar');
    }
  }
}

export async function checkHorizonTx(
  txHash: string,
  horizonUrl: string,
): Promise<{ ledger: number; settledAt: string } | null> {
  try {
    const res = await fetch(`${horizonUrl.replace(/\/$/, '')}/transactions/${encodeURIComponent(txHash)}`);
    if (!res.ok) return null;
    const tx: any = await res.json();
    if (tx.successful) {
      return {
        ledger: Number(tx.ledger || 0),
        settledAt: String(tx.created_at || new Date().toISOString()),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const stellarWatcher = new StellarSettlementWatcher();
