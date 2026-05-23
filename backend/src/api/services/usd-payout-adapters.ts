import crypto from 'crypto';
import { AnchorService } from './anchor.service';
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
  providerOptions?: Record<string, unknown>;
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

function readText(value: unknown): string {
  return String(value || '').trim();
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
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

export class EtherfusePixOffRampAdapter implements PayoutProviderAdapter {
  providerName: PayoutProviderName = 'etherfuse';

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
        destination: input.destination,
        amount_usd: input.amountUsd,
        currency: 'USD',
        created_at: now(),
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
          note: 'Etherfuse sandbox off-ramp was executed as the proof leg. No USD bank payout claim is made.',
        },
      };
    }

    return createInstruction(input, 'etherfuse', {
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
      note: 'Etherfuse off-ramp adapter prepared the sandbox proof payload. Send session_id, session_token, wallet_pin and run_etherfuse_offramp_test=true to execute the sandbox off-ramp test.',
    });
  }

  async getPayoutStatus(_providerPayoutId: string): Promise<PayoutStatus> {
    return 'pending';
  }
}

export function getPayoutProviderAdapter(provider = process.env.PAYOUT_PROVIDER): PayoutProviderAdapter {
  const normalized = String(provider || 'mock').trim().toLowerCase();
  if (normalized === 'circle') return new CircleCompatibilityAdapter();
  if (normalized === 'bridge') return new BridgeCompatibilityAdapter();
  if (normalized === 'etherfuse') return new EtherfusePixOffRampAdapter();
  return new MockUsdPayoutAdapter();
}
