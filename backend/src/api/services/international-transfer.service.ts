import crypto from 'crypto';
import { getAssetIssuer } from '../../config/assets';
import { InternationalTransferRepository, internationalTransferRepository } from '../repository/international-transfer.repository';
import { StellarTransactionRepository } from '../repository/stellar-transaction.repository';
import { BrlUsdQuoteService, brlUsdQuoteService } from './brl-usd-quote.service';
import { IdentityAlignmentService } from './identity-alignment.service';
import {
  IdentityProfile,
  InternationalTransfer,
  InternationalTransferState,
  PayoutCoordinationEvidence,
  PayoutEventRecord,
  PayoutInstruction,
  PayoutInstructionRecord,
  PayoutProviderCapabilities,
  PayoutProviderEvent,
  PayoutStatusObservation,
  TransferReviewerEvidence,
  TransferOrchestrationLog,
  TransferReconciliation,
  TransferWorkflowSnapshot,
  UsdBankDestination,
} from './international-transfer.types';
import { InternationalTransferStateMachine } from './international-transfer-state.service';
import {
  buildTransferWorkflowSnapshot,
  hasReachedTransferState,
} from './international-transfer-lifecycle';
import {
  transferConflictError,
  transferNotFoundError,
  transferValidationError,
} from './international-transfer.errors';
import { PixFundingService, pixFundingService } from './pix-funding.service';
import { SettlementEvidenceService } from './settlement-evidence.service';
import { StellarSettlementService, stellarSettlementService } from './stellar-settlement.service';
import { payoutProviderEvidenceSnapshot, PayoutProviderAdapter } from './usd-payout-adapters';
import { UsdPayoutCoordinationService, usdPayoutCoordinationService } from './usd-payout-coordination.service';
import { redactSensitive } from '../../utils/redaction';
import { orchestrator } from '../../orchestration/TransferOrchestrator';
import { TransferActor } from '../../orchestration/types';
import { logger } from '../../utils/logger';

type ServiceDeps = {
  repository?: InternationalTransferRepository;
  quoteService?: BrlUsdQuoteService;
  pixFunding?: PixFundingService;
  stellarSettlement?: StellarSettlementService;
  payoutAdapter?: PayoutProviderAdapter;
  payoutCoordination?: UsdPayoutCoordinationService;
};

function now() {
  return new Date().toISOString();
}

function appendError(transfer: InternationalTransfer, error: unknown, stage: string) {
  return [
    ...(transfer.error_logs || []),
    {
      at: now(),
      stage,
      message: error instanceof Error ? error.message : String(error),
    },
  ];
}

function requestTrace(input: { request_id?: string; correlation_id?: string }) {
  const requestId = String(input.request_id || '').trim();
  const correlationId = String(input.correlation_id || requestId).trim();
  return {
    ...(requestId ? { request_id: requestId } : {}),
    ...(correlationId ? { correlation_id: correlationId } : {}),
  };
}

function mergeTraceMetadata(
  metadata: Record<string, unknown> | undefined,
  input: { request_id?: string; correlation_id?: string },
  stage: string,
) {
  const trace = requestTrace(input);
  if (!Object.keys(trace).length) return metadata || {};
  return {
    ...(metadata || {}),
    ...trace,
    trace: {
      ...((metadata || {}).trace as Record<string, unknown> || {}),
      ...trace,
      last_stage: stage,
      updated_at: now(),
    },
  };
}

function pixFailureStatus(status: string): boolean {
  return [
    'failed',
    'failure',
    'pix.failed',
    'cancelled',
    'canceled',
    'expired',
    'rejected',
    'refused',
  ].includes(status);
}

function normalizePayoutProvider(provider?: string): 'mock' | 'circle' | 'bridge' | 'etherfuse' {
  const normalized = String(provider || process.env.PAYOUT_PROVIDER || 'etherfuse').trim().toLowerCase();
  if (normalized === 'circle') return 'circle';
  if (normalized === 'bridge') return 'bridge';
  if (normalized === 'etherfuse') return 'etherfuse';
  if (normalized === 'mock') return 'mock';
  throw transferValidationError(
    'unsupported_payout_provider',
    `Unsupported payout provider "${normalized}". Expected mock, etherfuse, circle, or bridge.`,
  );
}

export class InternationalTransferService {
  private readonly repository: InternationalTransferRepository;
  private readonly quoteService: BrlUsdQuoteService;
  private readonly pixFunding: PixFundingService;
  private readonly stellarSettlement: StellarSettlementService;
  private readonly payoutAdapter?: PayoutProviderAdapter;
  private readonly payoutCoordination: UsdPayoutCoordinationService;

  constructor(deps: ServiceDeps = {}) {
    this.repository = deps.repository || internationalTransferRepository;
    this.quoteService = deps.quoteService || brlUsdQuoteService;
    this.pixFunding = deps.pixFunding || pixFundingService;
    this.stellarSettlement = deps.stellarSettlement || stellarSettlementService;
    this.payoutAdapter = deps.payoutAdapter;
    this.payoutCoordination = deps.payoutCoordination || usdPayoutCoordinationService;
  }

  async createTransfer(input: {
    quote_id: string;
    user_id?: string;
    institution_id?: string;
    sender_identity: IdentityProfile;
    recipient_identity: IdentityProfile;
    payout_destination: UsdBankDestination;
    same_name_payout_required?: boolean;
    request_id?: string;
    correlation_id?: string;
  }): Promise<InternationalTransfer> {
    if (!input.quote_id) throw transferValidationError('quote_id_required', 'quote_id is required.');
    if (!input.payout_destination?.accountHolderName || !input.payout_destination?.country) {
      throw transferValidationError(
        'payout_destination_invalid',
        'payout_destination.accountHolderName and payout_destination.country are required.',
      );
    }

    const quote = await this.quoteService.getActiveQuote(input.quote_id);
    const identity = IdentityAlignmentService.evaluateSameName({
      senderIdentity: input.sender_identity || {},
      recipientIdentity: input.recipient_identity || {},
      payoutDestination: input.payout_destination,
      sameNameRequired: input.same_name_payout_required,
    });
    const timestamp = now();
    const transfer: InternationalTransfer = {
      transfer_id: `tr_brl_usd_${crypto.randomUUID()}`,
      quote_id: quote.quote_id,
      status: 'QUOTE_CREATED',
      user_id: input.user_id || quote.user_id,
      institution_id: input.institution_id || quote.institution_id,
      sender_identity: input.sender_identity || {},
      recipient_identity: input.recipient_identity || {},
      brl_amount: quote.brl_amount,
      quoted_usd_amount: quote.estimated_usd_amount,
      fx_rate: quote.fx_rate,
      fees: {
        platform_fee: quote.platform_fee,
        estimated_provider_fee: quote.estimated_provider_fee,
        total_fee: quote.total_fee,
      },
      stellar_asset_code: 'USDC',
      stellar_asset_issuer: getAssetIssuer(process.env.USDC_ASSET_CODE || 'USDC', process.env.USDC_ASSET_ISSUER),
      payout_destination: input.payout_destination,
      same_name_payout_required: identity.same_name_payout_required,
      same_name_match_status: identity.same_name_match_status,
      identity_risk_notes: identity.identity_risk_notes,
      reconciliation_metadata: {
        ...mergeTraceMetadata({}, {
          request_id: input.request_id || (quote.metadata as any)?.request_id,
          correlation_id: input.correlation_id || (quote.metadata as any)?.correlation_id,
        }, 'transfer_created'),
        quote,
        quote_provenance: quote.provenance || (quote.metadata as any)?.quote_provenance,
        next_action: 'create_pix_intent',
      },
      error_logs: [],
      created_at: timestamp,
      updated_at: timestamp,
    };

    const created = await this.repository.createTransfer(transfer);
    await this.repository.updateQuote(quote.quote_id, { quote_status: 'ACCEPTED' });
    await this.refreshReconciliation(created);
    return this.syncOrchestration(created, 'api', input.correlation_id || input.request_id);
  }

  async createPixIntent(transferId: string, input: {
    session_id: string;
    session_token: string;
    email?: string;
    mock?: boolean;
    request_id?: string;
    correlation_id?: string;
  }): Promise<InternationalTransfer> {
    const transfer = await this.requireTransfer(transferId);
    this.assertTransition(transfer, 'PIX_PENDING');

    try {
      const intent = await this.pixFunding.createPixIntent({ transfer, ...input });
      const updated = await this.repository.updateTransfer(transfer.transfer_id, {
        status: 'PIX_PENDING',
        pix_payment_id: intent.pix_payment_id,
        pix_order_id: intent.pix_order_id,
        pix_status: intent.status,
        reconciliation_metadata: {
          ...mergeTraceMetadata(transfer.reconciliation_metadata, input, 'pix_intent_created'),
          pix_funding_intent: intent,
          next_action: 'wait_for_pix_confirmation',
        },
      });
      await this.refreshReconciliation(updated);
      return this.syncOrchestration(updated, 'api', input.correlation_id || input.request_id);
    } catch (error) {
      await this.repository.updateTransfer(transfer.transfer_id, {
        status: 'FAILED',
        error_logs: appendError(transfer, error, 'pix_intent'),
      });
      throw error;
    }
  }

  async handlePixConfirmation(input: Record<string, unknown>): Promise<InternationalTransfer> {
    const reference = String(
      input.transfer_id ||
      input.transferId ||
      input.order_id ||
      input.orderId ||
      input.pix_payment_id ||
      input.pixPaymentId ||
      input.transaction_id ||
      input.transactionId ||
      ''
    ).trim();
    if (!reference) throw new Error('Pix webhook missing transfer/order/payment reference.');

    const transfer = String(input.transfer_id || input.transferId || '').trim()
      ? await this.requireTransfer(String(input.transfer_id || input.transferId))
      : await this.repository.findTransferByPixReference(reference);
    if (!transfer) throw new Error(`No transfer found for Pix reference ${reference}.`);

    const status = String(input.status || input.pix_status || input.event || 'completed').toLowerCase();
    const trace = {
      request_id: String(input.request_id || input.requestId || '').trim(),
      correlation_id: String(input.correlation_id || input.correlationId || input.request_id || input.requestId || '').trim(),
    };
    if (pixFailureStatus(status)) {
      if (transfer.status === 'FAILED') return this.syncOrchestration(transfer, 'webhook:etherfuse', trace.correlation_id || trace.request_id);
      this.assertTransition(transfer, 'FAILED');
      const updated = await this.repository.updateTransfer(transfer.transfer_id, {
        status: 'FAILED',
        pix_status: status,
        reconciliation_metadata: {
          ...mergeTraceMetadata(transfer.reconciliation_metadata, trace, 'pix_funding_failed'),
          pix_webhook: input,
          next_action: 'refund_or_retry',
        },
        error_logs: appendError(transfer, `Pix funding event reported ${status}.`, 'pix_funding'),
      });
      await this.refreshReconciliation(updated);
      return this.syncOrchestration(updated, 'webhook:etherfuse', trace.correlation_id || trace.request_id);
    }

    if (!['completed', 'paid', 'confirmed', 'pix.received', 'processing', 'funded'].includes(status)) {
      const updated = await this.repository.updateTransfer(transfer.transfer_id, {
        pix_status: status,
        reconciliation_metadata: {
          ...mergeTraceMetadata(transfer.reconciliation_metadata, trace, 'pix_webhook_status'),
          pix_webhook: input,
        },
      });
      await this.refreshReconciliation(updated);
      return this.syncOrchestration(updated, 'webhook:etherfuse', trace.correlation_id || trace.request_id);
    }

    if (hasReachedTransferState(transfer.status, 'PIX_RECEIVED')) {
      const updated = await this.repository.updateTransfer(transfer.transfer_id, {
        pix_status: transfer.pix_status || 'completed',
        reconciliation_metadata: {
          ...mergeTraceMetadata(transfer.reconciliation_metadata, trace, 'pix_confirmation_replayed'),
          pix_webhook_replay: input,
          pix_webhook_replayed_at: now(),
        },
      });
      await this.refreshReconciliation(updated);
      return this.syncOrchestration(updated, 'webhook:etherfuse', trace.correlation_id || trace.request_id);
    }

    this.assertTransition(transfer, 'PIX_RECEIVED');
    const updated = await this.repository.updateTransfer(transfer.transfer_id, {
      status: 'PIX_RECEIVED',
      pix_status: 'completed',
      pix_received_at: now(),
      reconciliation_metadata: {
        ...mergeTraceMetadata(transfer.reconciliation_metadata, trace, 'pix_confirmed'),
        pix_webhook: input,
        next_action: 'settle_stellar',
      },
    });
    await this.refreshReconciliation(updated);
    return this.syncOrchestration(updated, 'webhook:etherfuse', trace.correlation_id || trace.request_id);
  }

  async confirmSandboxFunding(transferId: string, input: Record<string, unknown> = {}): Promise<InternationalTransfer> {
    const transfer = await this.requireTransfer(transferId);
    const intent = (transfer.reconciliation_metadata || {}).pix_funding_intent as any;
    const reference = transfer.pix_order_id || transfer.pix_payment_id || transfer.transfer_id;
    const intentMode = String(intent?.payment_instructions?.mode || intent?.raw?.mode || '').trim().toLowerCase();
    const isMockFunding = intentMode === 'mock' ||
      String(reference || '').startsWith('mock_pix_') ||
      intent?.raw?.no_real_pix_created === true;

    if (!isMockFunding) {
      throw new Error('Sandbox funding confirmation can only be used for mock Pix funding intents. Use the real Etherfuse webhook for live/provider funding.');
    }

    return this.handlePixConfirmation({
      transfer_id: transfer.transfer_id,
      order_id: reference,
      status: input.status || 'completed',
      event: input.event || 'pix.received',
      simulated: true,
      simulated_by: input.simulated_by || 'institution_settlement_tester',
      confirmed_at: now(),
      request_id: input.request_id || input.requestId,
      correlation_id: input.correlation_id || input.correlationId,
    });
  }

  async settleStellar(transferId: string, input: {
    request_id?: string;
    correlation_id?: string;
  } = {}): Promise<InternationalTransfer> {
    const transfer = await this.requireTransfer(transferId);
    let current = transfer;

    if (hasReachedTransferState(current.status, 'USDC_SETTLED') && current.stellar_tx_hash) {
      const updated = await this.repository.updateTransfer(current.transfer_id, {
        reconciliation_metadata: {
          ...mergeTraceMetadata(current.reconciliation_metadata, input, 'stellar_settlement_replayed'),
          stellar_settlement_replayed_at: now(),
        },
      });
      await this.refreshReconciliation(updated);
      return this.syncOrchestration(updated, 'system', input.correlation_id || input.request_id);
    }

    try {
      if (current.status === 'PIX_RECEIVED') {
        this.assertTransition(current, 'BRL_TO_USDC_PENDING');
        current = await this.repository.updateTransfer(current.transfer_id, {
          status: 'BRL_TO_USDC_PENDING',
          reconciliation_metadata: {
            ...mergeTraceMetadata(current.reconciliation_metadata, input, 'brl_to_usdc_pending'),
            next_action: 'usdc_settlement',
          },
        });
      }

      this.assertTransition(current, 'USDC_SETTLEMENT_PENDING');
      current = await this.repository.updateTransfer(current.transfer_id, {
        status: 'USDC_SETTLEMENT_PENDING',
      });

      const evidence = await this.stellarSettlement.settleUsdc(current);
      const stellarRepository = new StellarTransactionRepository(this.repository);
      current = await stellarRepository.attachSettlementEvidence(current, evidence);
      this.assertTransition({ ...current, status: 'USDC_SETTLEMENT_PENDING' }, 'USDC_SETTLED');
      current = await this.repository.updateTransfer(current.transfer_id, {
        status: 'USDC_SETTLED',
        stellar_tx_hash: evidence.stellar_tx_hash,
        stellar_memo: evidence.stellar_memo,
        stellar_source_account: evidence.stellar_source_account,
        stellar_destination_account: evidence.stellar_destination_account,
        stellar_asset_code: evidence.asset_code,
        stellar_asset_issuer: evidence.asset_issuer,
        stellar_settled_at: evidence.settled_at,
        reconciliation_metadata: {
          ...mergeTraceMetadata(current.reconciliation_metadata, input, 'stellar_settled'),
          stellar_settlement: evidence,
          next_action: 'create_payout_instruction',
        },
      });
      await this.refreshReconciliation(current, { settlement: evidence });
      return this.syncOrchestration(current, 'system', input.correlation_id || input.request_id);
    } catch (error) {
      await this.repository.updateTransfer(transfer.transfer_id, {
        status: 'FAILED',
        error_logs: appendError(transfer, error, 'stellar_settlement'),
      });
      throw error;
    }
  }

  async createPayoutInstruction(transferId: string, provider?: string, providerOptions: Record<string, unknown> = {}): Promise<InternationalTransfer> {
    const transfer = await this.requireTransfer(transferId);
    if (hasReachedTransferState(transfer.status, 'PAYOUT_INSTRUCTION_CREATED') && transfer.payout_instruction_id) {
      const updated = await this.repository.updateTransfer(transfer.transfer_id, {
        reconciliation_metadata: {
          ...mergeTraceMetadata(transfer.reconciliation_metadata, {
            request_id: String(providerOptions.request_id || providerOptions.requestId || '').trim(),
            correlation_id: String(providerOptions.correlation_id || providerOptions.correlationId || '').trim(),
          }, 'payout_instruction_replayed'),
          payout_instruction_replayed_at: now(),
        },
      });
      await this.refreshReconciliation(updated);
      return this.syncOrchestration(updated, 'system', String(providerOptions.correlation_id || providerOptions.correlationId || providerOptions.request_id || providerOptions.requestId || '').trim());
    }
    if (transfer.status === 'USDC_SETTLED' && this.repository.getPayoutInstructionByTransfer) {
      const persisted = await this.repository.getPayoutInstructionByTransfer(transfer.transfer_id);
      if (persisted) return this.restorePersistedPayoutInstruction(transfer, persisted, providerOptions);
    }

    if (!transfer.stellar_tx_hash || !hasReachedTransferState(transfer.status, 'USDC_SETTLED')) {
      throw transferConflictError(
        'stellar_settlement_required',
        'A confirmed Stellar settlement transaction is required before creating a USD payout instruction.',
        { transfer_id: transfer.transfer_id, status: transfer.status },
      );
    }

    if (transfer.same_name_payout_required && transfer.same_name_match_status !== 'MATCHED') {
      throw transferConflictError(
        'same_name_payout_blocked',
        'Payout instruction blocked because the destination account holder does not match the verified route identity.',
        {
          same_name_match_status: transfer.same_name_match_status,
          transfer_id: transfer.transfer_id,
        },
      );
    }

    this.assertTransition(transfer, 'PAYOUT_INSTRUCTION_CREATED');
    const selectedProvider = normalizePayoutProvider(provider);
    const adapter = this.payoutCoordination.resolveAdapter(selectedProvider, this.payoutAdapter);

    try {
      const createdInstruction = await adapter.createPayoutInstruction({
        transferId: transfer.transfer_id,
        amountUsd: transfer.quoted_usd_amount,
        destination: transfer.payout_destination,
        senderLegalName: transfer.sender_identity.legal_name || transfer.sender_identity.entity_name,
        recipientLegalName: transfer.recipient_identity.legal_name || transfer.recipient_identity.entity_name,
        stellarTxHash: transfer.stellar_tx_hash,
        stellarMemo: transfer.stellar_memo,
        metadata: {
          same_name_match_status: transfer.same_name_match_status,
          identity_risk_notes: transfer.identity_risk_notes,
          on_ramp_provider: 'etherfuse',
          off_ramp_provider: adapter.providerName,
          ...requestTrace({
            request_id: String(providerOptions.request_id || providerOptions.requestId || '').trim(),
            correlation_id: String(providerOptions.correlation_id || providerOptions.correlationId || '').trim(),
          }),
        },
        providerOptions,
      });
      const initialObservation = this.payoutCoordination.normalizeObservation({
        provider: adapter.providerName,
        providerPayoutId: createdInstruction.provider_payout_id,
        observation: createdInstruction.status_history?.at(-1) || createdInstruction.status,
        source: 'create',
      });
      const instruction = this.payoutCoordination.attachObservation(createdInstruction, initialObservation);
      await this.persistPayoutInstruction(transfer, instruction);

      let updated = await this.repository.updateTransfer(transfer.transfer_id, {
        status: 'PAYOUT_INSTRUCTION_CREATED',
        payout_provider: adapter.providerName,
        payout_instruction_id: instruction.payout_instruction_id,
        provider_payout_id: instruction.provider_payout_id,
        payout_status: instruction.status,
        reconciliation_metadata: {
          ...mergeTraceMetadata(transfer.reconciliation_metadata, {
            request_id: String(providerOptions.request_id || providerOptions.requestId || '').trim(),
            correlation_id: String(providerOptions.correlation_id || providerOptions.correlationId || '').trim(),
          }, 'payout_instruction_created'),
          payout_instruction: instruction,
          off_ramp_provider: adapter.providerName,
          payout_provider_capabilities: typeof adapter.getCapabilities === 'function'
            ? adapter.getCapabilities()
            : this.payoutCoordination.getCapabilities(adapter.providerName),
        },
      });

      const nextState: InternationalTransferState =
        instruction.status === 'completed'
          ? 'PAYOUT_COMPLETED'
          : instruction.status === 'failed' || instruction.status === 'cancelled'
            ? 'FAILED'
            : 'PAYOUT_PENDING';
      this.assertTransition(updated, nextState);
      updated = await this.repository.updateTransfer(updated.transfer_id, {
        status: nextState,
        payout_status: instruction.status,
        payout_completed_at: instruction.status === 'completed' ? initialObservation.observed_at : undefined,
        error_logs: nextState === 'FAILED'
          ? [...(updated.error_logs || []), {
            at: initialObservation.observed_at,
            stage: 'payout_instruction',
            message: `Payout provider created instruction with terminal status ${instruction.status}.`,
          }]
          : updated.error_logs,
        reconciliation_metadata: {
          ...(updated.reconciliation_metadata || {}),
          payout_instruction: instruction,
          off_ramp_provider: adapter.providerName,
          next_action: instruction.status === 'completed' ? 'done' : 'poll_payout_status',
        },
      });

      await this.refreshReconciliation(updated, { payout: instruction });
      return this.syncOrchestration(updated, 'system', String(providerOptions.correlation_id || providerOptions.correlationId || providerOptions.request_id || providerOptions.requestId || '').trim());
    } catch (error) {
      await this.repository.updateTransfer(transfer.transfer_id, {
        status: 'FAILED',
        error_logs: appendError(transfer, error, 'payout_instruction'),
      });
      throw error;
    }
  }

  async refreshPayoutStatus(transferId: string, providerOptions: Record<string, unknown> = {}): Promise<InternationalTransfer> {
    const transfer = await this.requireTransfer(transferId);
    if (!transfer.payout_provider || !transfer.provider_payout_id || !transfer.payout_instruction_id) {
      throw new Error('Payout instruction reference is required before refreshing payout status.');
    }

    const trace = {
      request_id: String(providerOptions.request_id || providerOptions.requestId || '').trim(),
      correlation_id: String(providerOptions.correlation_id || providerOptions.correlationId || '').trim(),
    };
    const adapter = this.payoutCoordination.resolveAdapter(transfer.payout_provider, this.payoutAdapter);
    const observation = this.payoutCoordination.normalizeObservation({
      provider: adapter.providerName,
      providerPayoutId: transfer.provider_payout_id,
      observation: await adapter.getPayoutStatus(transfer.provider_payout_id),
      source: 'poll',
    });
    return this.applyPayoutObservation(transfer, observation, trace);
  }

  async handlePayoutProviderEvent(provider: string, payload: Record<string, unknown>): Promise<InternationalTransfer> {
    const event = this.payoutCoordination.normalizeProviderEvent(provider, payload);
    if (!event) {
      throw transferValidationError(
        'invalid_payout_provider_event',
        'Payout provider event is missing a provider payout reference or status.',
      );
    }
    if (!this.repository.findTransferByProviderPayoutReference) {
      throw new Error('Payout provider event lookup is not supported by this repository.');
    }
    const transfer = await this.repository.findTransferByProviderPayoutReference(event.provider_name, event.provider_payout_id);
    if (!transfer) {
      throw transferNotFoundError('payout_transfer_not_found', 'No transfer found for payout provider event.');
    }
    if (!transfer.payout_instruction_id) {
      throw transferConflictError('payout_instruction_missing', 'Transfer has no payout instruction for this provider event.');
    }

    const eventRecord: PayoutEventRecord = {
      payout_event_id: `payout_event_${crypto.randomUUID()}`,
      transfer_id: transfer.transfer_id,
      payout_instruction_id: transfer.payout_instruction_id,
      provider_name: event.provider_name,
      provider_event_id: event.provider_event_id,
      provider_payout_id: event.provider_payout_id,
      status: event.status,
      event_type: event.event_type,
      evidence: redactSensitive(event.evidence || {}) as Record<string, unknown>,
      occurred_at: event.occurred_at,
      created_at: now(),
    };
    const eventInserted = this.repository.appendPayoutEvent
      ? await this.repository.appendPayoutEvent(eventRecord)
      : false;
    if (this.repository.appendPayoutEvent && !eventInserted) {
      return this.syncOrchestration(transfer, 'system');
    }

    const observation: PayoutStatusObservation = {
      provider_name: event.provider_name,
      provider_payout_id: event.provider_payout_id,
      status: event.status,
      raw_status: event.raw_status,
      source: 'webhook',
      observed_at: event.occurred_at,
      provider_event_id: event.provider_event_id,
      evidence: event.evidence,
    };
    try {
      return await this.applyPayoutObservation(transfer, observation, {}, event);
    } catch (error) {
      if (eventInserted && this.repository.deletePayoutEvent) {
        await this.repository.deletePayoutEvent(event.provider_name, event.provider_event_id);
      }
      throw error;
    }
  }

  getPayoutProviderCapabilities(): PayoutProviderCapabilities[] {
    return this.payoutCoordination.getCapabilities() as PayoutProviderCapabilities[];
  }

  async getPayoutEvidence(transferId: string): Promise<PayoutCoordinationEvidence> {
    return this.payoutCoordination.buildEvidence(await this.requireTransfer(transferId));
  }

  async getTransfer(transferId: string): Promise<InternationalTransfer> {
    return this.requireTransfer(transferId);
  }

  async getReconciliation(transferId: string): Promise<TransferReconciliation> {
    const existing = await this.repository.getReconciliation(transferId);
    if (existing) return existing;
    const transfer = await this.requireTransfer(transferId);
    return this.refreshReconciliation(transfer);
  }

  async getOrchestrationLog(transferId: string): Promise<TransferOrchestrationLog> {
    const transfer = await this.requireTransfer(transferId);
    const reconciliation = await this.repository.getReconciliation(transferId);
    return SettlementEvidenceService.buildOrchestrationLog({ transfer, reconciliation });
  }

  async getReviewerEvidence(transferId: string): Promise<TransferReviewerEvidence> {
    const transfer = await this.requireTransfer(transferId);
    const reconciliation = await this.repository.getReconciliation(transferId);
    return SettlementEvidenceService.buildReviewerEvidence({ transfer, reconciliation });
  }

  async getWorkflow(transferId: string): Promise<TransferWorkflowSnapshot> {
    const transfer = await this.requireTransfer(transferId);
    const reconciliation = await this.repository.getReconciliation(transferId);
    return buildTransferWorkflowSnapshot({ transfer, reconciliation });
  }

  private assertTransition(transfer: Pick<InternationalTransfer, 'status'>, next: InternationalTransferState) {
    InternationalTransferStateMachine.assertTransition(transfer.status, next);
  }

  private async requireTransfer(transferId: string): Promise<InternationalTransfer> {
    const transfer = await this.repository.getTransfer(transferId);
    if (!transfer) {
      throw transferNotFoundError('transfer_not_found', 'International transfer not found.');
    }
    return transfer;
  }

  private async applyPayoutObservation(
    transfer: InternationalTransfer,
    observation: PayoutStatusObservation,
    trace: { request_id?: string; correlation_id?: string } = {},
    providerEvent?: PayoutProviderEvent,
  ): Promise<InternationalTransfer> {
    if (!transfer.payout_provider || !transfer.provider_payout_id || !transfer.payout_instruction_id) {
      throw new Error('Payout instruction reference is required before applying payout status.');
    }
    if (transfer.payout_provider !== observation.provider_name || transfer.provider_payout_id !== observation.provider_payout_id) {
      throw transferConflictError(
        'payout_provider_reference_mismatch',
        'Payout status observation does not match the transfer payout instruction.',
      );
    }
    if (transfer.status === 'PAYOUT_COMPLETED' || transfer.status === 'FAILED' || transfer.status === 'REFUNDED') {
      return this.syncOrchestration(transfer, 'system', trace.correlation_id || trace.request_id);
    }

    const metadata = transfer.reconciliation_metadata || {};
    const existingInstruction = metadata.payout_instruction as PayoutInstruction | undefined;
    const baseInstruction: PayoutInstruction = existingInstruction || {
      payout_instruction_id: transfer.payout_instruction_id,
      provider_name: transfer.payout_provider,
      provider_payout_id: transfer.provider_payout_id,
      status: transfer.payout_status || 'pending',
      destination: transfer.payout_destination,
      amount_usd: transfer.quoted_usd_amount,
      currency: 'USD',
      created_at: transfer.updated_at || transfer.created_at,
    };
    const instruction = this.payoutCoordination.attachObservation(baseInstruction, observation);
    let nextState: InternationalTransferState = transfer.status;
    const errorLogs = [...(transfer.error_logs || [])];
    if (observation.status === 'completed') {
      this.assertTransition(transfer, 'PAYOUT_COMPLETED');
      nextState = 'PAYOUT_COMPLETED';
    } else if (observation.status === 'failed' || observation.status === 'cancelled') {
      this.assertTransition(transfer, 'FAILED');
      nextState = 'FAILED';
      errorLogs.push({
        at: observation.observed_at,
        stage: 'payout_status',
        message: `Payout provider status observed as ${observation.status}.`,
      });
    }

    const updated = await this.repository.updateTransfer(transfer.transfer_id, {
      status: nextState,
      payout_status: observation.status,
      payout_completed_at: observation.status === 'completed'
        ? (transfer.payout_completed_at || observation.observed_at)
        : transfer.payout_completed_at,
      error_logs: errorLogs,
      reconciliation_metadata: {
        ...mergeTraceMetadata(metadata, trace, providerEvent ? 'payout_provider_event' : 'payout_status_refreshed'),
        payout_instruction: instruction,
        payout_status_observation: observation,
        payout_status_refresh: {
          provider: observation.provider_name,
          provider_payout_id: observation.provider_payout_id,
          status: observation.status,
          refreshed_at: observation.observed_at,
          source: observation.source,
        },
        ...(providerEvent ? {
          payout_provider_event: {
            provider: providerEvent.provider_name,
            event_id: providerEvent.provider_event_id,
            event_type: providerEvent.event_type,
            occurred_at: providerEvent.occurred_at,
          },
        } : {}),
        next_action: observation.status === 'completed'
          ? 'done'
          : observation.status === 'failed' || observation.status === 'cancelled'
            ? 'refund_or_manual_review'
            : 'poll_payout_status',
      },
    });
    await this.persistPayoutInstruction(updated, instruction);
    await this.refreshReconciliation(updated, { payout: instruction });
    return this.syncOrchestration(updated, 'system', trace.correlation_id || trace.request_id);
  }

  private async restorePersistedPayoutInstruction(
    transfer: InternationalTransfer,
    persisted: PayoutInstructionRecord,
    trace: Record<string, unknown>,
  ): Promise<InternationalTransfer> {
    const instruction: PayoutInstruction = {
      payout_instruction_id: persisted.payout_instruction_id,
      provider_name: persisted.provider_name,
      provider_payout_id: persisted.provider_payout_id,
      status: persisted.status,
      execution_mode: persisted.execution_mode,
      destination: transfer.payout_destination,
      amount_usd: persisted.amount_usd,
      currency: 'USD',
      created_at: persisted.created_at,
      updated_at: persisted.updated_at,
      status_history: persisted.status_history,
      metadata: {
        recovered_from_persisted_instruction: true,
      },
    };
    this.assertTransition(transfer, 'PAYOUT_INSTRUCTION_CREATED');
    let updated = await this.repository.updateTransfer(transfer.transfer_id, {
      status: 'PAYOUT_INSTRUCTION_CREATED',
      payout_provider: instruction.provider_name,
      payout_instruction_id: instruction.payout_instruction_id,
      provider_payout_id: instruction.provider_payout_id,
      payout_status: instruction.status,
      reconciliation_metadata: {
        ...mergeTraceMetadata(transfer.reconciliation_metadata, {
          request_id: String(trace.request_id || trace.requestId || '').trim(),
          correlation_id: String(trace.correlation_id || trace.correlationId || '').trim(),
        }, 'payout_instruction_recovered'),
        payout_instruction: instruction,
        off_ramp_provider: instruction.provider_name,
      },
    });
    const nextState: InternationalTransferState =
      instruction.status === 'completed'
        ? 'PAYOUT_COMPLETED'
        : instruction.status === 'failed' || instruction.status === 'cancelled'
          ? 'FAILED'
          : 'PAYOUT_PENDING';
    this.assertTransition(updated, nextState);
    updated = await this.repository.updateTransfer(updated.transfer_id, {
      status: nextState,
      payout_status: instruction.status,
      payout_completed_at: instruction.status === 'completed' ? (instruction.updated_at || now()) : undefined,
      reconciliation_metadata: {
        ...(updated.reconciliation_metadata || {}),
        payout_instruction: instruction,
        next_action: instruction.status === 'completed' ? 'done' : 'poll_payout_status',
      },
    });
    await this.refreshReconciliation(updated, { payout: instruction });
    return this.syncOrchestration(updated, 'system', String(trace.correlation_id || trace.correlationId || trace.request_id || trace.requestId || '').trim());
  }

  private async persistPayoutInstruction(transfer: InternationalTransfer, instruction: PayoutInstruction): Promise<void> {
    if (!this.repository.upsertPayoutInstruction) return;
    const instructionMetadata = instruction.metadata || {};
    const destination = instruction.destination || transfer.payout_destination;
    const record: PayoutInstructionRecord = {
      payout_instruction_id: instruction.payout_instruction_id,
      transfer_id: transfer.transfer_id,
      provider_name: instruction.provider_name,
      provider_payout_id: instruction.provider_payout_id,
      status: instruction.status,
      execution_mode: instruction.execution_mode || 'compatibility',
      amount_usd: instruction.amount_usd,
      currency: 'USD',
      destination_metadata: {
        account_holder_type: destination.accountHolderType,
        country: destination.country,
        provider_label: destination.providerLabel,
        bank_name: destination.bankName,
        account_number_last4: String(destination.accountNumber || '').replace(/\D+/g, '').slice(-4) || undefined,
        routing_number_last4: String(destination.routingNumber || '').replace(/\D+/g, '').slice(-4) || undefined,
      },
      settlement_evidence: {
        stellar_tx_hash: transfer.stellar_tx_hash,
        stellar_memo: transfer.stellar_memo,
        asset_code: transfer.stellar_asset_code,
        amount_usd: transfer.quoted_usd_amount,
      },
      provider_request: payoutProviderEvidenceSnapshot(instructionMetadata.provider_payload),
      provider_response: payoutProviderEvidenceSnapshot(instructionMetadata.provider_response),
      status_history: instruction.status_history || [],
      created_at: instruction.created_at,
      updated_at: instruction.updated_at || now(),
    };
    await this.repository.upsertPayoutInstruction(record);
  }

  private async refreshReconciliation(
    transfer: InternationalTransfer,
    extras: { settlement?: any; payout?: PayoutInstruction } = {},
  ): Promise<TransferReconciliation> {
    const reconciliation = SettlementEvidenceService.buildReconciliation({
      transfer,
      settlement: extras.settlement,
      payout: extras.payout,
    });
    return this.repository.upsertReconciliation(reconciliation);
  }

  private async syncOrchestration(
    transfer: InternationalTransfer,
    actor: TransferActor,
    correlationId?: string,
  ): Promise<InternationalTransfer> {
    try {
      const normalized = await orchestrator.syncFromInternationalTransfer(
        transfer as any,
        actor,
        correlationId || (transfer.reconciliation_metadata as any)?.correlation_id || (transfer.reconciliation_metadata as any)?.trace?.correlation_id,
      );
      if (!normalized) return transfer;

      const orchestrationTransfer = {
        id: normalized.id,
        public_ref: normalized.public_ref,
        state: normalized.state,
        state_version: normalized.state_version,
        updated_at: normalized.updated_at,
      };
      const metadata = {
        ...(transfer.reconciliation_metadata || {}),
        orchestration_transfer: orchestrationTransfer,
      };
      const augmented: InternationalTransfer = {
        ...transfer,
        reconciliation_metadata: metadata,
        orchestration_transfer_id: normalized.id,
        orchestration_public_ref: normalized.public_ref,
      };

      const existing = (transfer.reconciliation_metadata || {}).orchestration_transfer as any;
      if (existing?.id === normalized.id && existing?.state === normalized.state) {
        return augmented;
      }

      const persisted = await this.repository.updateTransfer(transfer.transfer_id, {
        reconciliation_metadata: metadata,
      });
      return {
        ...persisted,
        orchestration_transfer_id: normalized.id,
        orchestration_public_ref: normalized.public_ref,
      };
    } catch (error) {
      logger.warn(`[orchestration-bridge] sync_failed transfer_id=${transfer.transfer_id} status=${transfer.status} error=${error instanceof Error ? error.message : String(error)}`);
      return transfer;
    }
  }
}

export const internationalTransferService = new InternationalTransferService();
