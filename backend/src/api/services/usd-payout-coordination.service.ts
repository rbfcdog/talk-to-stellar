import crypto from 'crypto';
import {
  InternationalTransfer,
  PayoutCoordinationEvidence,
  PayoutInstruction,
  PayoutProviderCapabilities,
  PayoutProviderEvent,
  PayoutProviderName,
  PayoutStatus,
  PayoutStatusObservation,
} from './international-transfer.types';
import {
  getPayoutProviderAdapter,
  getPayoutProviderCapabilities,
  payoutProviderEvidenceSnapshot,
  PayoutProviderAdapter,
} from './usd-payout-adapters';

function now() {
  return new Date().toISOString();
}

function text(value: unknown): string {
  return String(value || '').trim();
}

function sha256Short(value: unknown): string | undefined {
  const normalized = text(value);
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function last4(value: unknown): string | undefined {
  const digits = text(value).replace(/\D+/g, '');
  return digits ? digits.slice(-4) : undefined;
}

function settlementNetwork(transfer: InternationalTransfer): string | undefined {
  const settlement = (transfer.reconciliation_metadata || {}).stellar_settlement as Record<string, unknown> | undefined;
  return text(settlement?.network) || undefined;
}

function providerName(value: unknown): PayoutProviderName {
  const normalized = text(value).toLowerCase();
  if (normalized === 'circle' || normalized === 'bridge' || normalized === 'mock') return normalized;
  return 'etherfuse';
}

function normalizedStatus(value: unknown): PayoutStatus {
  const normalized = text(value).toLowerCase().replace(/[\s.-]+/g, '_');
  if (['complete', 'completed', 'payment_processed', 'paid', 'success', 'succeeded', 'settled'].includes(normalized)) {
    return 'completed';
  }
  if (['failed', 'failure', 'undeliverable', 'rejected', 'returned', 'error'].includes(normalized)) {
    return 'failed';
  }
  if (['cancelled', 'canceled', 'voided'].includes(normalized)) return 'cancelled';
  if (['created', 'instruction_created', 'queued'].includes(normalized)) return 'instruction_created';
  return 'pending';
}

export class UsdPayoutCoordinationService {
  getCapabilities(provider?: PayoutProviderName): PayoutProviderCapabilities | PayoutProviderCapabilities[] {
    if (provider) return getPayoutProviderAdapter(provider).getCapabilities();
    return getPayoutProviderCapabilities();
  }

  resolveAdapter(provider?: string, override?: PayoutProviderAdapter): PayoutProviderAdapter {
    return override || getPayoutProviderAdapter(provider);
  }

  normalizeObservation(input: {
    provider: PayoutProviderName;
    providerPayoutId: string;
    observation: PayoutStatus | PayoutStatusObservation;
    source?: PayoutStatusObservation['source'];
  }): PayoutStatusObservation {
    if (typeof input.observation === 'object') {
      return {
        ...input.observation,
        provider_name: providerName(input.observation.provider_name || input.provider),
        provider_payout_id: text(input.observation.provider_payout_id || input.providerPayoutId),
        status: normalizedStatus(input.observation.status),
        source: input.observation.source || input.source || 'poll',
        observed_at: input.observation.observed_at || now(),
      };
    }
    return {
      provider_name: input.provider,
      provider_payout_id: input.providerPayoutId,
      status: normalizedStatus(input.observation),
      raw_status: text(input.observation) || undefined,
      source: input.source || 'poll',
      observed_at: now(),
    };
  }

  attachObservation(instruction: PayoutInstruction, observation: PayoutStatusObservation): PayoutInstruction {
    const existing = Array.isArray(instruction.status_history) ? instruction.status_history : [];
    const duplicate = existing.some((item) => (
      item.provider_event_id && observation.provider_event_id
        ? item.provider_event_id === observation.provider_event_id
        : item.source === observation.source &&
          item.status === observation.status &&
          item.observed_at === observation.observed_at
    ));
    return {
      ...instruction,
      status: observation.status,
      updated_at: observation.observed_at,
      status_history: duplicate ? existing : [...existing, observation],
      metadata: {
        ...(instruction.metadata || {}),
        last_status_observation: observation,
      },
    };
  }

  normalizeProviderEvent(provider: string, payload: Record<string, unknown>): PayoutProviderEvent | null {
    const normalized = text(provider).toLowerCase();
    if (!['circle', 'bridge', 'etherfuse', 'mock'].includes(normalized)) return null;
    const adapter = getPayoutProviderAdapter(normalized);
    return adapter.normalizeWebhookEvent?.(payload) || null;
  }

  expectedWebhookSecret(provider: string): string {
    const normalized = text(provider).toLowerCase();
    if (!['circle', 'bridge', 'etherfuse', 'mock'].includes(normalized)) return '';
    const envPrefix = normalized.toUpperCase();
    return text(process.env[`${envPrefix}_PAYOUT_WEBHOOK_SECRET`] || process.env.PAYOUT_WEBHOOK_SECRET);
  }

  buildEvidence(transfer: InternationalTransfer): PayoutCoordinationEvidence {
    const metadata = transfer.reconciliation_metadata || {};
    const instruction = metadata.payout_instruction as PayoutInstruction | undefined;
    const selectedProvider = providerName(transfer.payout_provider || instruction?.provider_name);
    const capability = this.getCapabilities(selectedProvider) as PayoutProviderCapabilities;
    const compatibility = this.getCapabilities() as PayoutProviderCapabilities[];
    const circle = compatibility.find((item) => item.provider_name === 'circle')!;
    const bridge = compatibility.find((item) => item.provider_name === 'bridge')!;
    const statusHistory = Array.isArray(instruction?.status_history) ? instruction.status_history : [];
    const payoutAllowed = !transfer.same_name_payout_required || transfer.same_name_match_status === 'MATCHED';
    const created = Boolean(transfer.payout_instruction_id || instruction?.payout_instruction_id);
    const checklist: PayoutCoordinationEvidence['checklist'] = [
      {
        id: 'adapter_interface_code',
        label: 'Adapter Interface Code',
        ready: true,
        artifact: 'backend/src/api/services/usd-payout-adapters.ts',
      },
      {
        id: 'stellar_transaction_hash',
        label: 'Stellar Transaction Hash',
        ready: Boolean(transfer.stellar_tx_hash),
        artifact: transfer.stellar_tx_hash || 'Awaiting confirmed Stellar settlement.',
      },
      {
        id: 'circle_bridge_compatibility',
        label: 'Circle / Bridge Compatibility',
        ready: Boolean(circle && bridge),
        artifact: '/api/transfers/payout-providers',
      },
      {
        id: 'payout_coordination_record',
        label: 'Payout Coordination Record',
        ready: created,
        artifact: `/api/transfers/${encodeURIComponent(transfer.transfer_id)}/payout-evidence`,
      },
    ];
    const readyCount = checklist.filter((item) => item.ready).length;

    return {
      schema_version: 1,
      generated_at: now(),
      transfer_id: transfer.transfer_id,
      ready: readyCount === checklist.length && payoutAllowed,
      submission: {
        title: 'USD Delivery & Payout Coordination Layer',
        week: 2,
        ready_count: readyCount,
        required_count: 4,
        status: readyCount === checklist.length && payoutAllowed ? 'READY' : 'PENDING',
      },
      checklist,
      provider: capability,
      execution_mode: instruction?.execution_mode,
      rail: {
        route: 'PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK',
        on_ramp_provider: 'etherfuse',
        on_ramp_source_currency: 'BRL',
        settlement_asset_code: transfer.stellar_asset_code || 'USDC',
        settlement_network: settlementNetwork(transfer),
        off_ramp_provider: selectedProvider,
        off_ramp_source_asset_code: transfer.stellar_asset_code || 'USDC',
        payout_currency: 'USD',
      },
      settlement: {
        attached: Boolean(transfer.stellar_tx_hash),
        stellar_tx_hash: transfer.stellar_tx_hash,
        stellar_memo: transfer.stellar_memo,
        asset_code: transfer.stellar_asset_code,
        amount_usd: transfer.quoted_usd_amount,
      },
      identity_control: {
        same_name_required: transfer.same_name_payout_required,
        same_name_status: transfer.same_name_match_status,
        payout_allowed: payoutAllowed,
        risk_notes: transfer.identity_risk_notes || [],
      },
      instruction: {
        created,
        instruction_id: transfer.payout_instruction_id || instruction?.payout_instruction_id,
        provider_reference_hash: sha256Short(transfer.provider_payout_id || instruction?.provider_payout_id),
        status: transfer.payout_status || instruction?.status,
        created_at: instruction?.created_at,
        updated_at: instruction?.updated_at,
      },
      status_history: statusHistory.map((item) => ({
        ...item,
        provider_payout_id: `[redacted-hash:${sha256Short(item.provider_payout_id)}]`,
        provider_reference: item.provider_reference ? `[redacted-hash:${sha256Short(item.provider_reference)}]` : undefined,
        evidence: payoutProviderEvidenceSnapshot(item.evidence),
      })),
      destination: {
        account_holder_hash: sha256Short(transfer.payout_destination?.accountHolderName),
        account_holder_type: transfer.payout_destination?.accountHolderType,
        country: transfer.payout_destination?.country,
        provider_label: transfer.payout_destination?.providerLabel,
        bank_name: transfer.payout_destination?.bankName,
        account_number_last4: last4(transfer.payout_destination?.accountNumber),
        routing_number_last4: last4(transfer.payout_destination?.routingNumber),
      },
      compatibility: { circle, bridge },
      redaction: {
        applied: true,
        notes: [
          'Provider payout references are hashed.',
          'Bank and routing numbers expose only their final four digits.',
          'Provider secrets, session credentials, PINs, and raw webhook payloads are excluded.',
        ],
      },
    };
  }
}

export const usdPayoutCoordinationService = new UsdPayoutCoordinationService();
