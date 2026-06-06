import crypto from 'crypto';
import { AnchorService } from './anchor.service';
import {
  PayoutExecutionMode,
  PayoutInstruction,
  PayoutProviderCapabilities,
  PayoutProviderEvent,
  PayoutProviderName,
  PayoutStatus,
  PayoutStatusObservation,
  UsdBankDestination,
} from './international-transfer.types';
import { mockDisabledError, mockPolicySnapshot } from '../../config/mock-policy';
import { redactSensitive } from '../../utils/redaction';

export type CreatePayoutInput = {
  transferId: string;
  amountUsd: string;
  destination: UsdBankDestination;
  senderLegalName?: string;
  recipientLegalName?: string;
  stellarTxHash?: string;
  stellarMemo?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
};

export interface PayoutProviderAdapter {
  providerName: PayoutProviderName;
  getCapabilities(): PayoutProviderCapabilities;
  createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction>;
  getPayoutStatus(providerPayoutId: string): Promise<PayoutStatus | PayoutStatusObservation>;
  normalizeWebhookEvent?(payload: Record<string, unknown>): PayoutProviderEvent | null;
  cancelPayout?(providerPayoutId: string): Promise<void>;
}

function now() {
  return new Date().toISOString();
}

function shouldExecuteRealPayouts() {
  return String(process.env.ENABLE_REAL_PAYOUT_EXECUTION || '').trim().toLowerCase() === 'true';
}

function createInstruction(
  input: CreatePayoutInput,
  providerName: PayoutProviderName,
  executionMode: PayoutExecutionMode,
  metadata: Record<string, unknown>,
): PayoutInstruction {
  const id = `${providerName}_instruction_${crypto.randomUUID()}`;
  const providerPayoutId = `${providerName}_payout_${crypto.randomUUID()}`;
  const status = metadata.auto_complete === true ? 'completed' : 'pending';
  const createdAt = now();
  return {
    payout_instruction_id: id,
    provider_name: providerName,
    provider_payout_id: providerPayoutId,
    status,
    execution_mode: executionMode,
    destination: input.destination,
    amount_usd: input.amountUsd,
    currency: 'USD',
    created_at: createdAt,
    updated_at: createdAt,
    status_history: [{
      provider_name: providerName,
      provider_payout_id: providerPayoutId,
      status,
      source: 'create',
      observed_at: createdAt,
    }],
    metadata,
  };
}

function readText(value: unknown): string {
  return String(value || '').trim();
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function destinationCompatibilityMetadata(destination: UsdBankDestination): Record<string, unknown> {
  const providerLabel = readText(destination.providerLabel || 'other').toLowerCase();
  return omitUndefined({
    destination_provider_label: providerLabel || 'other',
    wise_api_integration: false,
    wise_integration_mode: providerLabel === 'wise' ? 'metadata_only_no_wise_api' : undefined,
  });
}

function isWiseDestination(destination: UsdBankDestination): boolean {
  return readText(destination.providerLabel).toLowerCase() === 'wise';
}

function normalizePayoutStatus(value: unknown, providerName: PayoutProviderName): PayoutStatus {
  const normalized = readText(value).toLowerCase().replace(/[\s.-]+/g, '_');
  if (['complete', 'completed', 'payment_processed', 'paid', 'success', 'succeeded', 'settled'].includes(normalized)) {
    return 'completed';
  }
  if (['failed', 'failure', 'undeliverable', 'rejected', 'returned', 'error'].includes(normalized)) {
    return 'failed';
  }
  if (['cancelled', 'canceled', 'voided'].includes(normalized)) return 'cancelled';
  if (['created', 'instruction_created', 'queued'].includes(normalized)) return 'instruction_created';
  if (providerName === 'bridge' && normalized === 'payment_processed') return 'completed';
  return 'pending';
}

function statusObservation(
  providerName: PayoutProviderName,
  providerPayoutId: string,
  rawStatus: unknown,
  source: PayoutStatusObservation['source'],
  evidence: Record<string, unknown> = {},
): PayoutStatusObservation {
  return {
    provider_name: providerName,
    provider_payout_id: providerPayoutId,
    status: normalizePayoutStatus(rawStatus, providerName),
    raw_status: readText(rawStatus) || undefined,
    source,
    observed_at: now(),
    evidence: redactSensitive(evidence) as Record<string, unknown>,
  };
}

function providerEvent(
  providerName: PayoutProviderName,
  payload: Record<string, unknown>,
): PayoutProviderEvent | null {
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : payload) as Record<string, unknown>;
  const providerPayoutId = readText(
    data.provider_payout_id ||
    data.payout_id ||
    data.transfer_id ||
    data.id ||
    (data.payout as any)?.id ||
    (data.transfer as any)?.id,
  );
  const rawStatus = readText(data.status || (data.payout as any)?.status || (data.transfer as any)?.status);
  if (!providerPayoutId || !rawStatus) return null;
  const providerEventId = readText(payload.event_id || payload.id || data.event_id) ||
    `${providerName}_${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)}`;
  return {
    provider_name: providerName,
    provider_event_id: providerEventId,
    provider_payout_id: providerPayoutId,
    status: normalizePayoutStatus(rawStatus, providerName),
    raw_status: rawStatus,
    event_type: readText(payload.type || payload.event_type || payload.event) || undefined,
    occurred_at: readText(payload.occurred_at || payload.createDate || payload.created_at || data.updated_at) || now(),
    evidence: redactSensitive(payload) as Record<string, unknown>,
  };
}

function executionCapability(input: {
  providerName: PayoutProviderName;
  displayName: string;
  executionMode: PayoutExecutionMode;
  requirements: string[];
  configured: boolean;
  executionEnabled: boolean;
  supportsStatusPolling: boolean;
  supportsWebhooks: boolean;
  usdBankDestination: boolean;
  blockers?: string[];
  notes?: string[];
}): PayoutProviderCapabilities {
  return {
    provider_name: input.providerName,
    display_name: input.displayName,
    execution_mode: input.executionMode,
    configured: input.configured,
    execution_enabled: input.executionEnabled,
    supports: {
      create_instruction: true,
      status_polling: input.supportsStatusPolling,
      webhooks: input.supportsWebhooks,
      cancellation: false,
      usd_bank_destination: input.usdBankDestination,
    },
    requirements: input.requirements,
    blockers: input.blockers || [],
    notes: input.notes || [],
  };
}

export class MockUsdPayoutAdapter implements PayoutProviderAdapter {
  providerName: PayoutProviderName = 'mock';

  getCapabilities(): PayoutProviderCapabilities {
    const allowed = mockPolicySnapshot().mock_usd_payout_allowed;
    return executionCapability({
      providerName: 'mock',
      displayName: 'Ops mock payout',
      executionMode: 'mock',
      requirements: ['ALLOW_OPS_MOCKS', 'ALLOW_MOCK_USD_PAYOUTS'],
      configured: allowed,
      executionEnabled: allowed,
      supportsStatusPolling: true,
      supportsWebhooks: false,
      usdBankDestination: false,
      blockers: allowed ? [] : ['Ops mock USD payouts are disabled.'],
      notes: ['Creates reconciliation evidence only. No bank payout is executed.'],
    });
  }

  async createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction> {
    if (!mockPolicySnapshot().mock_usd_payout_allowed) {
      throw mockDisabledError(
        'USD payout',
        'Use provider=etherfuse, provider=circle, or provider=bridge. Mock USD payouts are ops-only and require ALLOW_OPS_MOCKS=true plus ALLOW_MOCK_USD_PAYOUTS=true.'
      );
    }
    return createInstruction(input, 'mock', 'mock', {
      mode: 'mock',
      auto_complete: String(process.env.MOCK_USD_PAYOUT_AUTO_COMPLETE || '').toLowerCase() === 'true',
      note: 'No ACH/wire was executed. This is a sandbox payout instruction for reconciliation and review.',
      transfer_id: input.transferId,
      stellar_tx_hash: input.stellarTxHash,
      stellar_memo: input.stellarMemo,
      ...destinationCompatibilityMetadata(input.destination),
    });
  }

  async getPayoutStatus(_providerPayoutId: string): Promise<PayoutStatus> {
    return String(process.env.MOCK_USD_PAYOUT_AUTO_COMPLETE || '').toLowerCase() === 'true' ? 'completed' : 'pending';
  }
}

abstract class CompatibilityPayoutAdapter implements PayoutProviderAdapter {
  abstract providerName: PayoutProviderName;
  abstract apiKeyEnvName: string;
  abstract createUrlEnvName: string;
  abstract statusUrlEnvName: string;
  abstract webhookSecretEnvName: string;

  getCapabilities(): PayoutProviderCapabilities {
    const apiKey = readText(process.env[this.apiKeyEnvName]);
    const createUrl = readText(process.env[this.createUrlEnvName]);
    const statusUrl = readText(process.env[this.statusUrlEnvName]);
    const executionEnabled = shouldExecuteRealPayouts();
    const configured = Boolean(apiKey && createUrl);
    const blockers = [
      ...(!apiKey ? [`${this.apiKeyEnvName} is missing.`] : []),
      ...(!createUrl ? [`${this.createUrlEnvName} is missing.`] : []),
      ...(!executionEnabled ? ['ENABLE_REAL_PAYOUT_EXECUTION is false.'] : []),
    ];
    return executionCapability({
      providerName: this.providerName,
      displayName: `${this.providerName === 'circle' ? 'Circle' : 'Bridge'} compatibility adapter`,
      executionMode: configured && executionEnabled ? 'live_api' : 'compatibility',
      requirements: [this.apiKeyEnvName, this.createUrlEnvName, 'ENABLE_REAL_PAYOUT_EXECUTION'],
      configured,
      executionEnabled: configured && executionEnabled,
      supportsStatusPolling: Boolean(apiKey && statusUrl),
      supportsWebhooks: Boolean(readText(process.env[this.webhookSecretEnvName]) || readText(process.env.PAYOUT_WEBHOOK_SECRET)),
      usdBankDestination: true,
      blockers,
      notes: [
        configured && executionEnabled
          ? 'Provider API execution is enabled. Verify provider-side compliance and destination enrollment before use.'
          : 'Builds a redacted provider compatibility payload without executing a payout.',
      ],
    });
  }

  protected buildProviderPayload(input: CreatePayoutInput): Record<string, unknown> {
    return {
      transfer_id: input.transferId,
      amount: input.amountUsd,
      currency: 'USD',
      destination: {
        account_holder_name: input.destination.accountHolderName,
        account_holder_type: input.destination.accountHolderType,
        bank_name: input.destination.bankName,
        routing_number: input.destination.routingNumber,
        account_number: input.destination.accountNumber ? '[configured]' : undefined,
        account_type: input.destination.accountType,
        swift_bic: input.destination.swiftBic,
        iban: input.destination.iban ? '[configured]' : undefined,
        country: input.destination.country,
        provider_label: input.destination.providerLabel,
      },
      source_reference: {
        stellar_tx_hash: input.stellarTxHash,
        stellar_memo: input.stellarMemo,
      },
      metadata: {
        ...(input.metadata || {}),
        ...destinationCompatibilityMetadata(input.destination),
      },
    };
  }

  async createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction> {
    const apiKey = String(process.env[this.apiKeyEnvName] || '').trim();
    const createUrl = String(process.env[this.createUrlEnvName] || '').trim();
    const realExecution = shouldExecuteRealPayouts();
    const providerPayload = this.buildProviderPayload(input);

    if (isWiseDestination(input.destination)) {
      return createInstruction(input, this.providerName, 'wise_metadata_only', {
        mode: 'wise_metadata_only',
        provider_api_key_present: Boolean(apiKey),
        real_execution_enabled: false,
        provider_payload: providerPayload,
        ...destinationCompatibilityMetadata(input.destination),
        note: 'Wise is destination metadata only for this sprint. No Wise API, ACH, wire, or provider payout was executed.',
      });
    }

    if (!apiKey || !createUrl || !realExecution) {
      return createInstruction(input, this.providerName, 'compatibility', {
        mode: 'compatibility',
        provider_api_key_present: Boolean(apiKey),
        real_execution_enabled: realExecution,
        provider_payload: providerPayload,
        ...destinationCompatibilityMetadata(input.destination),
        note: `${this.providerName} compatibility adapter prepared the payout payload but did not execute a bank payout.`,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.PAYOUT_PROVIDER_TIMEOUT_MS || 30000));
    let response: Response;
    try {
      response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        'idempotency-key': input.transferId,
      },
      body: JSON.stringify(providerPayload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${this.providerName} payout API rejected instruction: ${payload?.message || payload?.error || response.status}`);
    }

    const providerPayoutId = String(payload.id || payload.payout_id || payload.transfer_id || crypto.randomUUID());
    const createdAt = now();
    const rawStatus = payload.status || payload.data?.status || 'pending';
    const status = normalizePayoutStatus(rawStatus, this.providerName);
    return {
      payout_instruction_id: `${this.providerName}_instruction_${crypto.randomUUID()}`,
      provider_name: this.providerName,
      provider_payout_id: providerPayoutId,
      status,
      execution_mode: 'live_api',
      destination: input.destination,
      amount_usd: input.amountUsd,
      currency: 'USD',
      created_at: createdAt,
      updated_at: createdAt,
      status_history: [statusObservation(this.providerName, providerPayoutId, rawStatus, 'create', payload)],
      metadata: {
        mode: 'live_api',
        ...destinationCompatibilityMetadata(input.destination),
        provider_payload: redactSensitive(providerPayload),
        provider_response: redactSensitive(payload),
      },
    };
  }

  async getPayoutStatus(providerPayoutId: string): Promise<PayoutStatusObservation> {
    const apiKey = readText(process.env[this.apiKeyEnvName]);
    const template = readText(process.env[this.statusUrlEnvName]);
    if (!apiKey || !template || !shouldExecuteRealPayouts()) {
      return statusObservation(this.providerName, providerPayoutId, 'pending', 'poll', {
        mode: 'compatibility',
        note: 'Provider status API is not configured and enabled.',
      });
    }
    const url = template.includes('{id}')
      ? template.replace('{id}', encodeURIComponent(providerPayoutId))
      : `${template.replace(/\/+$/, '')}/${encodeURIComponent(providerPayoutId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.PAYOUT_PROVIDER_TIMEOUT_MS || 30000));
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${this.providerName} payout status API rejected request: ${payload?.message || payload?.error || response.status}`);
    }
    return statusObservation(
      this.providerName,
      providerPayoutId,
      payload.status || payload.data?.status || payload.payout?.status || payload.transfer?.status || 'pending',
      'poll',
      payload,
    );
  }

  normalizeWebhookEvent(payload: Record<string, unknown>): PayoutProviderEvent | null {
    return providerEvent(this.providerName, payload);
  }
}

export class CircleCompatibilityAdapter extends CompatibilityPayoutAdapter {
  providerName: PayoutProviderName = 'circle';
  apiKeyEnvName = 'CIRCLE_API_KEY';
  createUrlEnvName = 'CIRCLE_PAYOUT_CREATE_URL';
  statusUrlEnvName = 'CIRCLE_PAYOUT_STATUS_URL';
  webhookSecretEnvName = 'CIRCLE_PAYOUT_WEBHOOK_SECRET';
}

export class BridgeCompatibilityAdapter extends CompatibilityPayoutAdapter {
  providerName: PayoutProviderName = 'bridge';
  apiKeyEnvName = 'BRIDGE_API_KEY';
  createUrlEnvName = 'BRIDGE_PAYOUT_CREATE_URL';
  statusUrlEnvName = 'BRIDGE_PAYOUT_STATUS_URL';
  webhookSecretEnvName = 'BRIDGE_PAYOUT_WEBHOOK_SECRET';
}

export class EtherfusePixOffRampAdapter implements PayoutProviderAdapter {
  providerName: PayoutProviderName = 'etherfuse';

  getCapabilities(): PayoutProviderCapabilities {
    const apiConfigured = Boolean(readText(process.env.ETHERFUSE_API_KEY));
    return executionCapability({
      providerName: 'etherfuse',
      displayName: 'Etherfuse PIX off-ramp proof',
      executionMode: 'proof',
      requirements: ['ETHERFUSE_API_KEY', 'session_id', 'session_token', 'wallet_pin'],
      configured: apiConfigured,
      executionEnabled: apiConfigured,
      supportsStatusPolling: false,
      supportsWebhooks: false,
      usdBankDestination: false,
      blockers: apiConfigured ? [] : ['ETHERFUSE_API_KEY is missing.'],
      notes: ['Executes a controlled PIX withdrawal proof. It does not prove USD bank payout delivery.'],
    });
  }

  async createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction> {
    const options = input.providerOptions || {};
    const runSandboxTest = readBoolean(options.run_etherfuse_offramp_test || options.runEtherfuseOffRampTest);
    const sessionId = readText(options.session_id || options.sessionId);
    const sessionToken = readText(options.session_token || options.sessionToken);
    const walletPin = readText(options.wallet_pin || options.walletPin || options.pin);
    const targetBrl = readText(options.target_brl || options.targetBrl);

    if (runSandboxTest && sessionId && sessionToken && walletPin) {
      const result = await AnchorService.runTemporarySandboxOffRampTest({
        session_id: sessionId,
        session_token: sessionToken,
        pin: walletPin,
        wallet_pin: walletPin,
        source_asset_code: 'USDC',
        source_amount: input.amountUsd,
        amount: input.amountUsd,
        target_brl: targetBrl || undefined,
        external_bank_account: {
          account_holder_name: input.destination.accountHolderName,
          account_holder_type: input.destination.accountHolderType,
          bank_name: input.destination.bankName,
          country: input.destination.country,
          provider_label: input.destination.providerLabel,
        },
      });
      const quote = (result.quote || {}) as Record<string, unknown>;

      return {
        payout_instruction_id: `etherfuse_instruction_${crypto.randomUUID()}`,
        provider_name: 'etherfuse',
        provider_payout_id: String(result.final_transaction?.id || result.transaction?.id || result.submit_result?.order_id || crypto.randomUUID()),
        status: result.submitted ? 'completed' : 'pending',
        execution_mode: 'proof',
        destination: input.destination,
        amount_usd: input.amountUsd,
        currency: 'USD',
        created_at: now(),
        updated_at: now(),
        metadata: {
          mode: 'etherfuse_sandbox_offramp_test',
          rail: 'pix',
          source_asset_code: 'USDC',
          requested_source_amount: input.amountUsd,
          target_brl: result.target_brl,
          destination_amount: result.destination_amount,
          destination_asset_code: result.destination_asset_code,
          quote,
          provider_off_ramp_fee_amount: readText(quote.feeAmount || quote.fee),
          provider_off_ramp_fee_bps: readText(quote.feeBps),
          provider_off_ramp_fee_currency: 'BRL',
          ready_to_sign: result.ready_to_sign,
          submitted: result.submitted,
          submit_hash: result.submit_result?.hash,
          receipt_url: result.receipt_url,
          order_id: result.transaction?.id,
          final_status: result.final_transaction?.status,
          balance_delta: result.balance_delta,
          ...destinationCompatibilityMetadata(input.destination),
          note: 'PIX withdrawal proof was executed as the proof leg. No USD bank payout claim is made.',
        },
      };
    }

    return createInstruction(input, 'etherfuse', 'proof', {
      mode: 'etherfuse_sandbox_payload_prepared',
      rail: 'pix',
      execution_ready: Boolean(sessionId && sessionToken && walletPin),
      run_etherfuse_offramp_test_requested: runSandboxTest,
      source_asset_code: 'USDC',
      requested_source_amount: input.amountUsd,
      target_brl: targetBrl || null,
      stellar_tx_hash: input.stellarTxHash,
      stellar_memo: input.stellarMemo,
      transfer_id: input.transferId,
      destination_preview: {
        account_holder_name: input.destination.accountHolderName,
        account_holder_type: input.destination.accountHolderType,
        bank_name: input.destination.bankName,
        country: input.destination.country,
        provider_label: input.destination.providerLabel,
      },
      ...destinationCompatibilityMetadata(input.destination),
      note: 'PIX withdrawal adapter prepared the proof payload. Send session_id, session_token, wallet_pin and run_etherfuse_offramp_test=true to execute the controlled withdrawal test.',
    });
  }

  async getPayoutStatus(_providerPayoutId: string): Promise<PayoutStatus> {
    return 'pending';
  }
}

export function getPayoutProviderAdapter(provider = process.env.PAYOUT_PROVIDER): PayoutProviderAdapter {
  const normalized = String(provider || 'etherfuse').trim().toLowerCase();
  if (normalized === 'circle') return new CircleCompatibilityAdapter();
  if (normalized === 'bridge') return new BridgeCompatibilityAdapter();
  if (normalized === 'etherfuse') return new EtherfusePixOffRampAdapter();
  return new MockUsdPayoutAdapter();
}

export function getPayoutProviderCapabilities(): PayoutProviderCapabilities[] {
  return [
    new EtherfusePixOffRampAdapter(),
    new CircleCompatibilityAdapter(),
    new BridgeCompatibilityAdapter(),
    new MockUsdPayoutAdapter(),
  ].map((adapter) => adapter.getCapabilities());
}
