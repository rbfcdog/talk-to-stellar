import crypto from 'crypto';
import {
  PayoutInstruction,
  PayoutProviderName,
  PayoutStatus,
  UsdBankDestination,
} from './international-transfer.types';

export type CreatePayoutInput = {
  transferId: string;
  amountUsd: string;
  destination: UsdBankDestination;
  senderLegalName?: string;
  recipientLegalName?: string;
  stellarTxHash?: string;
  stellarMemo?: string;
  metadata?: Record<string, unknown>;
};

export interface PayoutProviderAdapter {
  providerName: PayoutProviderName;
  createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction>;
  getPayoutStatus(providerPayoutId: string): Promise<PayoutStatus>;
  cancelPayout?(providerPayoutId: string): Promise<void>;
}

function now() {
  return new Date().toISOString();
}

function shouldExecuteRealPayouts() {
  return String(process.env.ENABLE_REAL_PAYOUT_EXECUTION || '').trim().toLowerCase() === 'true';
}

function createInstruction(input: CreatePayoutInput, providerName: PayoutProviderName, metadata: Record<string, unknown>): PayoutInstruction {
  const id = `${providerName}_instruction_${crypto.randomUUID()}`;
  return {
    payout_instruction_id: id,
    provider_name: providerName,
    provider_payout_id: `${providerName}_payout_${crypto.randomUUID()}`,
    status: metadata.auto_complete === true ? 'completed' : 'pending',
    destination: input.destination,
    amount_usd: input.amountUsd,
    currency: 'USD',
    created_at: now(),
    metadata,
  };
}

export class MockUsdPayoutAdapter implements PayoutProviderAdapter {
  providerName: PayoutProviderName = 'mock';

  async createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction> {
    return createInstruction(input, 'mock', {
      mode: 'mock',
      auto_complete: String(process.env.MOCK_USD_PAYOUT_AUTO_COMPLETE || '').toLowerCase() === 'true',
      note: 'No ACH/wire was executed. This is a sandbox payout instruction for reconciliation and review.',
      transfer_id: input.transferId,
      stellar_tx_hash: input.stellarTxHash,
      stellar_memo: input.stellarMemo,
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
      },
      source_reference: {
        stellar_tx_hash: input.stellarTxHash,
        stellar_memo: input.stellarMemo,
      },
      metadata: input.metadata || {},
    };
  }

  async createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction> {
    const apiKey = String(process.env[this.apiKeyEnvName] || '').trim();
    const createUrl = String(process.env[this.createUrlEnvName] || '').trim();
    const realExecution = shouldExecuteRealPayouts();
    const providerPayload = this.buildProviderPayload(input);

    if (!apiKey || !createUrl || !realExecution) {
      return createInstruction(input, this.providerName, {
        mode: 'sandbox',
        provider_api_key_present: Boolean(apiKey),
        real_execution_enabled: realExecution,
        provider_payload: providerPayload,
        note: `${this.providerName} compatibility adapter prepared the payout payload but did not execute a bank payout.`,
      });
    }

    const response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(providerPayload),
    });
    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${this.providerName} payout API rejected instruction: ${payload?.message || payload?.error || response.status}`);
    }

    return {
      payout_instruction_id: `${this.providerName}_instruction_${crypto.randomUUID()}`,
      provider_name: this.providerName,
      provider_payout_id: String(payload.id || payload.payout_id || payload.transfer_id || crypto.randomUUID()),
      status: 'pending',
      destination: input.destination,
      amount_usd: input.amountUsd,
      currency: 'USD',
      created_at: now(),
      metadata: {
        mode: 'live_api',
        provider_response: payload,
      },
    };
  }

  async getPayoutStatus(_providerPayoutId: string): Promise<PayoutStatus> {
    return 'pending';
  }
}

export class CircleCompatibilityAdapter extends CompatibilityPayoutAdapter {
  providerName: PayoutProviderName = 'circle';
  apiKeyEnvName = 'CIRCLE_API_KEY';
  createUrlEnvName = 'CIRCLE_PAYOUT_CREATE_URL';
}

export class BridgeCompatibilityAdapter extends CompatibilityPayoutAdapter {
  providerName: PayoutProviderName = 'bridge';
  apiKeyEnvName = 'BRIDGE_API_KEY';
  createUrlEnvName = 'BRIDGE_PAYOUT_CREATE_URL';
}

export function getPayoutProviderAdapter(provider = process.env.PAYOUT_PROVIDER): PayoutProviderAdapter {
  const normalized = String(provider || 'mock').trim().toLowerCase();
  if (normalized === 'circle') return new CircleCompatibilityAdapter();
  if (normalized === 'bridge') return new BridgeCompatibilityAdapter();
  return new MockUsdPayoutAdapter();
}
