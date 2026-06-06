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
  PayoutInstruction,
  TransferOrchestrationLog,
  TransferReconciliation,
  UsdBankDestination,
} from './international-transfer.types';
import { InternationalTransferStateMachine } from './international-transfer-state.service';
import { PixFundingService, pixFundingService } from './pix-funding.service';
import { SettlementEvidenceService } from './settlement-evidence.service';
import { StellarSettlementService, stellarSettlementService } from './stellar-settlement.service';
import { getPayoutProviderAdapter, PayoutProviderAdapter } from './usd-payout-adapters';

type ServiceDeps = {
  repository?: InternationalTransferRepository;
  quoteService?: BrlUsdQuoteService;
  pixFunding?: PixFundingService;
  stellarSettlement?: StellarSettlementService;
  payoutAdapter?: PayoutProviderAdapter;
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

const STATE_ORDER: InternationalTransferState[] = [
  'QUOTE_CREATED',
  'PIX_PENDING',
  'PIX_RECEIVED',
  'BRL_TO_USDC_PENDING',
  'USDC_SETTLEMENT_PENDING',
  'USDC_SETTLED',
  'PAYOUT_INSTRUCTION_CREATED',
  'PAYOUT_PENDING',
  'PAYOUT_COMPLETED',
];

function hasReachedState(status: InternationalTransferState, target: InternationalTransferState): boolean {
  const currentIndex = STATE_ORDER.indexOf(status);
  const targetIndex = STATE_ORDER.indexOf(target);
  return currentIndex >= 0 && targetIndex >= 0 && currentIndex >= targetIndex;
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
  return 'mock';
}

export class InternationalTransferService {
  private readonly repository: InternationalTransferRepository;
  private readonly quoteService: BrlUsdQuoteService;
  private readonly pixFunding: PixFundingService;
  private readonly stellarSettlement: StellarSettlementService;
  private readonly payoutAdapter?: PayoutProviderAdapter;

  constructor(deps: ServiceDeps = {}) {
    this.repository = deps.repository || internationalTransferRepository;
    this.quoteService = deps.quoteService || brlUsdQuoteService;
    this.pixFunding = deps.pixFunding || pixFundingService;
    this.stellarSettlement = deps.stellarSettlement || stellarSettlementService;
    this.payoutAdapter = deps.payoutAdapter;
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
    if (!input.quote_id) throw new Error('quote_id is required.');
    if (!input.payout_destination?.accountHolderName || !input.payout_destination?.country) {
      throw new Error('payout_destination.accountHolderName and payout_destination.country are required.');
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
    return created;
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
      return updated;
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
      if (transfer.status === 'FAILED') return transfer;
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
      return updated;
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
      return updated;
    }

    if (hasReachedState(transfer.status, 'PIX_RECEIVED')) {
      const updated = await this.repository.updateTransfer(transfer.transfer_id, {
        pix_status: transfer.pix_status || 'completed',
        reconciliation_metadata: {
          ...mergeTraceMetadata(transfer.reconciliation_metadata, trace, 'pix_confirmation_replayed'),
          pix_webhook_replay: input,
          pix_webhook_replayed_at: now(),
        },
      });
      await this.refreshReconciliation(updated);
      return updated;
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
    return updated;
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

    if (hasReachedState(current.status, 'USDC_SETTLED') && current.stellar_tx_hash) {
      const updated = await this.repository.updateTransfer(current.transfer_id, {
        reconciliation_metadata: {
          ...mergeTraceMetadata(current.reconciliation_metadata, input, 'stellar_settlement_replayed'),
          stellar_settlement_replayed_at: now(),
        },
      });
      await this.refreshReconciliation(updated);
      return updated;
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
      return current;
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
    if (hasReachedState(transfer.status, 'PAYOUT_INSTRUCTION_CREATED') && transfer.payout_instruction_id) {
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
      return updated;
    }

    this.assertTransition(transfer, 'PAYOUT_INSTRUCTION_CREATED');
    const selectedProvider = normalizePayoutProvider(provider);
    const adapter = this.payoutAdapter || getPayoutProviderAdapter(selectedProvider);

    try {
      const instruction = await adapter.createPayoutInstruction({
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
        },
      });

      const nextState: InternationalTransferState = instruction.status === 'completed' ? 'PAYOUT_COMPLETED' : 'PAYOUT_PENDING';
      this.assertTransition(updated, nextState);
      updated = await this.repository.updateTransfer(updated.transfer_id, {
        status: nextState,
        payout_status: instruction.status,
        payout_completed_at: instruction.status === 'completed' ? now() : undefined,
        reconciliation_metadata: {
          ...(updated.reconciliation_metadata || {}),
          payout_instruction: instruction,
          off_ramp_provider: adapter.providerName,
          next_action: instruction.status === 'completed' ? 'done' : 'poll_payout_status',
        },
      });

      await this.refreshReconciliation(updated, { payout: instruction });
      return updated;
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
    const adapter = this.payoutAdapter || getPayoutProviderAdapter(transfer.payout_provider);
    const status = await adapter.getPayoutStatus(transfer.provider_payout_id);
    const refreshedAt = now();
    const metadata = transfer.reconciliation_metadata || {};
    const existingInstruction = metadata.payout_instruction as PayoutInstruction | undefined;
    const instruction: PayoutInstruction = {
      payout_instruction_id: transfer.payout_instruction_id,
      provider_name: transfer.payout_provider,
      provider_payout_id: transfer.provider_payout_id,
      status,
      destination: transfer.payout_destination,
      amount_usd: transfer.quoted_usd_amount,
      currency: 'USD',
      created_at: existingInstruction?.created_at || transfer.updated_at || transfer.created_at,
      metadata: {
        ...(existingInstruction?.metadata || {}),
        payout_status_refreshed_at: refreshedAt,
        previous_payout_status: transfer.payout_status,
        ...requestTrace(trace),
      },
    };

    let nextState = transfer.status;
    const errorLogs = [...(transfer.error_logs || [])];
    if (status === 'completed' && transfer.status !== 'PAYOUT_COMPLETED' && transfer.status !== 'FAILED' && transfer.status !== 'REFUNDED') {
      this.assertTransition(transfer, 'PAYOUT_COMPLETED');
      nextState = 'PAYOUT_COMPLETED';
    }
    if ((status === 'failed' || status === 'cancelled') && transfer.status !== 'FAILED' && transfer.status !== 'REFUNDED') {
      this.assertTransition(transfer, 'FAILED');
      nextState = 'FAILED';
      errorLogs.push({
        at: refreshedAt,
        stage: 'payout_status',
        message: `Payout provider status refreshed as ${status}.`,
      });
    }

    const updated = await this.repository.updateTransfer(transfer.transfer_id, {
      status: nextState,
      payout_status: status,
      payout_completed_at: status === 'completed'
        ? (transfer.payout_completed_at || refreshedAt)
        : transfer.payout_completed_at,
      error_logs: errorLogs,
      reconciliation_metadata: {
        ...mergeTraceMetadata(metadata, trace, 'payout_status_refreshed'),
        payout_instruction: instruction,
        payout_status_refresh: {
          provider: adapter.providerName,
          provider_payout_id: transfer.provider_payout_id,
          status,
          refreshed_at: refreshedAt,
        },
        next_action: status === 'completed'
          ? 'done'
          : status === 'failed' || status === 'cancelled'
            ? 'refund_or_manual_review'
            : 'poll_payout_status',
      },
    });

    await this.refreshReconciliation(updated, { payout: instruction });
    return updated;
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

  private assertTransition(transfer: Pick<InternationalTransfer, 'status'>, next: InternationalTransferState) {
    InternationalTransferStateMachine.assertTransition(transfer.status, next);
  }

  private async requireTransfer(transferId: string): Promise<InternationalTransfer> {
    const transfer = await this.repository.getTransfer(transferId);
    if (!transfer) throw new Error('International transfer not found.');
    return transfer;
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
}

export const internationalTransferService = new InternationalTransferService();
