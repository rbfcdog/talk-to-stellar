import { Horizon, StrKey } from '@stellar/stellar-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '../../config/supabase';
import {
  getStellarMainnetReadinessReport,
  loadStellarMainnetInfrastructureConfig,
} from '../../infrastructure/stellar/mainnet-infrastructure';

type MainnetWalletRow = {
  id: string;
  session_id: string;
  user_id: string;
  public_key: string;
  label: string;
  wallet_kind: string;
  is_primary: boolean;
  last_synced_at?: string | null;
  last_balance?: any;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
};

export type MainnetBalanceLine = {
  asset_code: string;
  asset_type: string;
  asset_issuer?: string;
  balance: string;
  buying_liabilities?: string;
  selling_liabilities?: string;
  limit?: string;
};

export type MainnetPaymentPreviewInput = {
  sessionId: string;
  userId: string;
  destination: string;
  amount: string;
  assetCode?: string;
  memo?: string;
};

function isStorageMissing(error: any): boolean {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error || '').toLowerCase();
  return (
    code === '42P01' ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('relation "public.stellar_mainnet_wallets" does not exist')
  );
}

function isHorizonNotFound(error: any): boolean {
  const status = Number(error?.response?.status || error?.response?.data?.status || 0);
  const message = String(error?.message || error || '').toLowerCase();
  return status === 404 || message.includes('not found');
}

function validatePublicKey(publicKey: string, label = 'public_key') {
  const normalized = String(publicKey || '').trim();
  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    throw new Error(`${label} must be a valid Stellar public key.`);
  }
  return normalized;
}

function normalizeBalance(balance: any): MainnetBalanceLine {
  const assetCode = balance?.asset_type === 'native'
    ? 'XLM'
    : String(balance?.asset_code || 'UNKNOWN').trim().toUpperCase();

  return {
    asset_code: assetCode,
    asset_type: String(balance?.asset_type || (assetCode === 'XLM' ? 'native' : 'credit_alphanum4')),
    asset_issuer: assetCode === 'XLM' ? undefined : String(balance?.asset_issuer || '').trim() || undefined,
    balance: String(balance?.balance || '0'),
    buying_liabilities: balance?.buying_liabilities ? String(balance.buying_liabilities) : undefined,
    selling_liabilities: balance?.selling_liabilities ? String(balance.selling_liabilities) : undefined,
    limit: balance?.limit ? String(balance.limit) : undefined,
  };
}

function normalizeOperation(operation: any) {
  const assetCode = operation?.asset_type === 'native'
    ? 'XLM'
    : String(operation?.asset_code || operation?.selling_asset_code || operation?.buying_asset_code || '').trim().toUpperCase();

  return {
    id: String(operation?.id || ''),
    type: String(operation?.type || ''),
    created_at: operation?.created_at || null,
    transaction_hash: operation?.transaction_hash || null,
    source_account: operation?.source_account || operation?.from || null,
    from: operation?.from || null,
    to: operation?.to || null,
    amount: operation?.amount || operation?.starting_balance || null,
    asset_code: assetCode || undefined,
    asset_issuer: operation?.asset_issuer || operation?.selling_asset_issuer || operation?.buying_asset_issuer || null,
  };
}

function explorerAccountUrl(publicKey: string) {
  const config = loadStellarMainnetInfrastructureConfig();
  return `${config.stellarExpertUrl.replace(/\/$/, '')}/account/${publicKey}`;
}

function explorerTxUrl(hash: string) {
  const config = loadStellarMainnetInfrastructureConfig();
  return `${config.stellarExpertUrl.replace(/\/$/, '')}/tx/${hash}`;
}

export class MainnetWalletService {
  constructor(private readonly db: SupabaseClient = supabase as any) {}

  private server() {
    const config = loadStellarMainnetInfrastructureConfig();
    return new Horizon.Server(config.horizonUrl);
  }

  getStatus() {
    const readiness = getStellarMainnetReadinessReport();
    const config = loadStellarMainnetInfrastructureConfig();
    return {
      success: true,
      mode: 'mainnet_read_only',
      network: {
        id: 'PUBLIC',
        label: config.profile.label,
        horizon_url: config.horizonUrl,
        network_passphrase: config.networkPassphrase,
        explorer_url: config.stellarExpertUrl,
      },
      controls: {
        enabled: config.enabled,
        runtime_activation_allowed: config.allowRuntimeActivation,
        runtime_network: config.activeRuntimeNetwork,
        signer_mode: config.signer.mode,
        mutations_available: this.canSubmitMainnetMutation(),
        require_manual_approval: config.controls.requireManualApproval,
        max_payment_usdc: config.controls.maxPaymentUsdc || null,
      },
      readiness: {
        safe_for_current_testnet_runtime: readiness.safeForCurrentTestnetRuntime,
        configuration_ready: readiness.configurationReady,
        ready_for_activation: readiness.readyForActivation,
        activation_blocked_by_design: readiness.activationBlockedByDesign,
        blockers: readiness.blockers,
        warnings: readiness.warnings,
        checks: readiness.checks,
      },
      message: 'Mainnet is available as a guarded, read-only user wallet layer. Testnet remains the default product runtime.',
    };
  }

  canSubmitMainnetMutation() {
    const config = loadStellarMainnetInfrastructureConfig();
    return Boolean(
      config.enabled &&
      config.controls.requireManualApproval &&
      config.signer.mode !== 'disabled' &&
      (config.signer.mode !== 'external' || config.signer.externalSignerUrl)
    );
  }

  async attachWallet(input: {
    sessionId: string;
    userId: string;
    publicKey: string;
    label?: string;
  }) {
    const sessionId = String(input.sessionId || '').trim();
    const userId = String(input.userId || '').trim();
    const publicKey = validatePublicKey(input.publicKey);
    const label = String(input.label || 'Mainnet wallet').trim().slice(0, 80) || 'Mainnet wallet';

    if (!sessionId || !userId) {
      throw new Error('Authenticated session is required to attach a Mainnet wallet.');
    }

    const clearPrimary = await this.db
      .from('stellar_mainnet_wallets')
      .update({ is_primary: false })
      .eq('session_id', sessionId)
      .neq('public_key', publicKey);

    if (clearPrimary.error && !isStorageMissing(clearPrimary.error)) {
      throw clearPrimary.error;
    }
    if (clearPrimary.error && isStorageMissing(clearPrimary.error)) {
      throw new Error('Mainnet wallet migration is not applied yet.');
    }

    const { data, error } = await this.db
      .from('stellar_mainnet_wallets')
      .upsert({
        session_id: sessionId,
        user_id: userId,
        public_key: publicKey,
        label,
        wallet_kind: 'external_public_key',
        is_primary: true,
        metadata: {
          attached_from: 'user_public_key',
          custody: 'external',
          signing: 'not_stored_by_talktostellar',
        },
      }, { onConflict: 'session_id,public_key' })
      .select('*')
      .single();

    if (error) {
      if (isStorageMissing(error)) {
        throw new Error('Mainnet wallet migration is not applied yet.');
      }
      throw error;
    }

    return {
      success: true,
      wallet: this.publicWallet(data as MainnetWalletRow),
      message: 'Mainnet wallet attached in read-only mode. TalkToStellar did not store a secret key.',
    };
  }

  async getPrimaryWallet(sessionId: string, userId: string) {
    const { data, error } = await this.db
      .from('stellar_mainnet_wallets')
      .select('*')
      .eq('session_id', String(sessionId))
      .eq('user_id', String(userId))
      .eq('is_primary', true)
      .maybeSingle();

    if (error) {
      if (isStorageMissing(error)) return null;
      throw error;
    }

    return data ? this.publicWallet(data as MainnetWalletRow) : null;
  }

  async getBalance(input: { sessionId: string; userId: string; publicKey?: string }) {
    const wallet = input.publicKey
      ? null
      : await this.getPrimaryWallet(input.sessionId, input.userId);
    const publicKey = validatePublicKey(input.publicKey || wallet?.public_key || '', 'mainnet_public_key');

    try {
      const account = await this.server().loadAccount(publicKey);
      const balances = (account.balances || []).map(normalizeBalance);
      const payload = {
        success: true,
        funded: true,
        public_key: publicKey,
        wallet,
        balances,
        sequence: account.sequenceNumber(),
        subentry_count: (account as any).subentry_count ?? null,
        home_domain: (account as any).home_domain ?? null,
        last_synced_at: new Date().toISOString(),
        explorer_url: explorerAccountUrl(publicKey),
      };

      if (wallet) {
        try {
          await this.db
            .from('stellar_mainnet_wallets')
            .update({
              last_balance: balances,
              last_synced_at: payload.last_synced_at,
            })
            .eq('id', wallet.id);
        } catch {
          // Balance reads should still succeed even if the cache write fails.
        }
      }

      return payload;
    } catch (error) {
      if (isHorizonNotFound(error)) {
        return {
          success: true,
          funded: false,
          public_key: publicKey,
          wallet,
          balances: [],
          sequence: null,
          last_synced_at: new Date().toISOString(),
          explorer_url: explorerAccountUrl(publicKey),
          message: 'This Mainnet account is valid but is not funded on Stellar Public Network yet.',
        };
      }
      throw error;
    }
  }

  async listOperations(input: { sessionId: string; userId: string; publicKey?: string; limit?: number }) {
    const wallet = input.publicKey
      ? null
      : await this.getPrimaryWallet(input.sessionId, input.userId);
    const publicKey = validatePublicKey(input.publicKey || wallet?.public_key || '', 'mainnet_public_key');
    const limit = Math.max(1, Math.min(Number(input.limit || 12), 25));

    try {
      const page = await this.server()
        .operations()
        .forAccount(publicKey)
        .order('desc')
        .limit(limit)
        .call();
      const operations = (page.records || []).map((operation: any) => {
        const normalized = normalizeOperation(operation);
        return {
          ...normalized,
          explorer_tx_url: normalized.transaction_hash ? explorerTxUrl(normalized.transaction_hash) : null,
        };
      });

      return {
        success: true,
        funded: true,
        public_key: publicKey,
        operations,
      };
    } catch (error) {
      if (isHorizonNotFound(error)) {
        return {
          success: true,
          funded: false,
          public_key: publicKey,
          operations: [],
          message: 'This Mainnet account is not funded yet, so it has no operations.',
        };
      }
      throw error;
    }
  }

  createPaymentPreview(input: MainnetPaymentPreviewInput) {
    const sourceWalletPromise = this.getPrimaryWallet(input.sessionId, input.userId);
    return sourceWalletPromise.then((wallet) => {
      const source = validatePublicKey(wallet?.public_key || '', 'mainnet_source_public_key');
      const destination = validatePublicKey(input.destination, 'mainnet_destination_public_key');
      const amount = Number(String(input.amount || '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('amount must be greater than zero.');
      }

      const assetCode = String(input.assetCode || 'USDC').trim().toUpperCase();
      const mutationsAvailable = this.canSubmitMainnetMutation();

      return {
        success: true,
        mode: mutationsAvailable ? 'guarded_manual_approval_required' : 'read_only_preview',
        can_submit: mutationsAvailable,
        source_public_key: source,
        destination_public_key: destination,
        amount: amount.toFixed(assetCode === 'XLM' ? 7 : 2),
        asset_code: assetCode,
        memo: String(input.memo || '').trim().slice(0, 120) || null,
        warning: mutationsAvailable
          ? 'Mainnet submission is gated by backend signer configuration and manual approval.'
          : 'Mainnet transaction submission is disabled. This endpoint only validates and previews the requested interaction.',
      };
    });
  }

  private publicWallet(row: MainnetWalletRow) {
    return {
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      public_key: row.public_key,
      label: row.label,
      wallet_kind: row.wallet_kind,
      is_primary: row.is_primary,
      last_synced_at: row.last_synced_at || null,
      last_balance: Array.isArray(row.last_balance) ? row.last_balance : [],
      explorer_url: explorerAccountUrl(row.public_key),
      custody: 'external',
      signing: 'not_stored_by_talktostellar',
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const mainnetWalletService = new MainnetWalletService();
