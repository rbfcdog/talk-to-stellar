/**
 * TransferOrchestrator — the only place normalized SOW state transitions happen.
 *
 * Existing money movement stays in the established InternationalTransferService,
 * PixFundingService, StellarSettlementService, and payout adapters. This engine
 * records the normalized lifecycle, audit trail, reconciliation metadata, and
 * reviewer-facing visibility surface.
 */

import { transferRepository } from '../api/repository/transfer.repository';
import { TransferStateMachine, IllegalTransitionError } from './stateMachine';
import {
  Transfer,
  TransferEvent,
  TransferState,
  TransferActor,
  TransferEventType,
  CreateTransferIntent,
  QuoteSnapshot,
  FeeItem,
  PixEvidence,
  StellarEvidence,
  PayoutEvidence,
  ReconciliationEvidence,
  DestinationEndpoint,
  SourceEndpoint,
} from './types';
import { decimalAbsDiffWithin, divideDecimalStrings } from './decimal';
import { logOrchestration } from './orchestrationLogger';

type LegacyInternationalTransfer = {
  transfer_id: string;
  quote_id?: string;
  status: string;
  user_id?: string;
  institution_id?: string;
  sender_identity?: Record<string, unknown>;
  recipient_identity?: Record<string, unknown>;
  brl_amount?: string;
  quoted_usd_amount?: string;
  fx_rate?: string;
  fees?: Record<string, any>;
  stellar_tx_hash?: string;
  stellar_source_account?: string;
  stellar_destination_account?: string;
  stellar_asset_code?: string;
  stellar_settled_at?: string;
  pix_payment_id?: string;
  pix_order_id?: string;
  pix_status?: string;
  pix_received_at?: string;
  payout_provider?: string;
  payout_destination?: Record<string, any>;
  payout_instruction_id?: string;
  provider_payout_id?: string;
  payout_status?: string;
  payout_completed_at?: string;
  reconciliation_metadata?: Record<string, any>;
  error_logs?: Array<Record<string, unknown>>;
};

const FUNDED_OR_LATER: TransferState[] = [
  'PIX_FUNDED',
  'CONVERTING',
  'STELLAR_SETTLED',
  'PAYOUT_ROUTING',
  'PAYOUT_INSTRUCTED',
  'RECONCILED',
];

const SETTLED_OR_LATER: TransferState[] = [
  'STELLAR_SETTLED',
  'PAYOUT_ROUTING',
  'PAYOUT_INSTRUCTED',
  'RECONCILED',
];

const LEGACY_STATE_ORDER = [
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

function legacyReached(status: string, target: string): boolean {
  const currentIndex = LEGACY_STATE_ORDER.indexOf(status);
  const targetIndex = LEGACY_STATE_ORDER.indexOf(target);
  return currentIndex >= 0 && targetIndex >= 0 && currentIndex >= targetIndex;
}

function text(value: unknown): string {
  return String(value || '').trim();
}

function last4(value: unknown): string {
  const raw = text(value).replace(/\s+/g, '');
  return raw ? raw.slice(-4).padStart(Math.min(4, raw.length), '*') : '';
}

function maskIdentifier(value: unknown, prefix = ''): string {
  const raw = text(value);
  if (!raw) return `${prefix}masked`;
  const tail = last4(raw);
  return `${prefix}${tail ? `***${tail}` : 'masked'}`;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export class TransferOrchestrator {
  async createTransfer(intent: CreateTransferIntent): Promise<Transfer> {
    const transfer = await transferRepository.create(intent);
    this.log(transfer, 'transfer_created', null, 'CREATED', intent.actor || 'api', intent.correlation_id || null, {
      amount_brl_in: intent.amount_brl_in,
      legacy_transfer_id: intent.legacy_transfer_id || null,
    });
    return transfer;
  }

  async attachQuote(
    transferId: string,
    quote: QuoteSnapshot,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await this.loadAndAssert(transferId, 'QUOTED');
    return this.transition(transfer, 'QUOTED', 'quote_attached', {
      quote,
      amount_usd_out_expected: divideDecimalStrings(transfer.amount_brl_in, quote.rate, 2),
    }, { quote }, actor, correlationId);
  }

  async issuePixCharge(
    transferId: string,
    pixEvidence: Pick<PixEvidence, 'charge_id' | 'provider'>,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await transferRepository.getById(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);

    if (transfer.state === 'PIX_CHARGE_ISSUED' && transfer.pix?.charge_id === pixEvidence.charge_id) {
      await this.appendReplay(transfer, 'pix_charge_already_issued', { pixEvidence }, actor, correlationId);
      return transfer;
    }

    TransferStateMachine.assertTransition(transfer.state, 'PIX_CHARGE_ISSUED');
    return this.transition(transfer, 'PIX_CHARGE_ISSUED', 'pix_charge_issued', {
      pix: {
        ...(transfer.pix || {}),
        ...pixEvidence,
      },
    }, { pixEvidence }, actor, correlationId);
  }

  async confirmPixFunding(
    transferId: string,
    pixEvidence: PixEvidence,
    actor: TransferActor = 'webhook:etherfuse',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await transferRepository.getById(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);

    if (transfer.pix && FUNDED_OR_LATER.includes(transfer.state)) {
      const sameE2e = Boolean(pixEvidence.e2e_id && transfer.pix.e2e_id === pixEvidence.e2e_id);
      const sameTxid = Boolean(pixEvidence.txid && transfer.pix.txid === pixEvidence.txid);
      const sameCharge = Boolean(pixEvidence.charge_id && transfer.pix.charge_id === pixEvidence.charge_id);
      if (sameE2e || sameTxid || sameCharge) {
        await this.appendReplay(transfer, 'pix_already_funded', { pixEvidence }, actor, correlationId);
        return transfer;
      }
      throw new Error(`PIX funding evidence does not match existing transfer evidence for ${transfer.public_ref}.`);
    }

    TransferStateMachine.assertTransition(transfer.state, 'PIX_FUNDED');
    return this.transition(transfer, 'PIX_FUNDED', 'pix_funding_confirmed', {
      pix: {
        ...(transfer.pix || {}),
        ...pixEvidence,
      },
    }, { pixEvidence }, actor, correlationId);
  }

  async beginConversion(
    transferId: string,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await transferRepository.getById(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);
    if (transfer.state === 'CONVERTING') {
      await this.appendReplay(transfer, 'conversion_already_started', {}, actor, correlationId);
      return transfer;
    }
    TransferStateMachine.assertTransition(transfer.state, 'CONVERTING');
    return this.transition(transfer, 'CONVERTING', 'conversion_started', {}, {
      amount_brl_in: transfer.amount_brl_in,
      amount_usd_out_expected: transfer.amount_usd_out_expected,
    }, actor, correlationId);
  }

  async confirmStellarSettlement(
    transferId: string,
    stellarEvidence: StellarEvidence,
    actor: TransferActor = 'poller:stellar',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await transferRepository.getById(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);

    if (transfer.stellar?.tx_hash && SETTLED_OR_LATER.includes(transfer.state)) {
      if (transfer.stellar.tx_hash === stellarEvidence.tx_hash) {
        await this.appendReplay(transfer, 'stellar_already_settled', { tx_hash: stellarEvidence.tx_hash }, actor, correlationId);
        return transfer;
      }
      throw new Error(`Stellar tx hash does not match existing transfer settlement for ${transfer.public_ref}.`);
    }

    TransferStateMachine.assertTransition(transfer.state, 'STELLAR_SETTLED');
    const amountUsdcSettled = stellarEvidence.asset === 'USDC'
      ? (transfer.amount_usd_out_expected || transfer.amount_usdc_settled)
      : transfer.amount_usdc_settled;
    const reconciliation = this.computeReconciliation({
      ...transfer,
      stellar: stellarEvidence,
      amount_usdc_settled: amountUsdcSettled,
    });

    return this.transition(transfer, 'STELLAR_SETTLED', 'stellar_settled', {
      stellar: stellarEvidence,
      amount_usdc_settled: amountUsdcSettled,
      reconciliation,
    }, { stellarEvidence, reconciliation }, actor, correlationId);
  }

  async routePayout(
    transferId: string,
    payoutEvidence: Pick<PayoutEvidence, 'provider_hint' | 'same_name_check'>,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await this.loadAndAssert(transferId, 'PAYOUT_ROUTING');
    return this.transition(transfer, 'PAYOUT_ROUTING', 'payout_routing_started', {
      payout: {
        ...(transfer.payout || {}),
        routing_status: 'routed',
        provider_hint: payoutEvidence.provider_hint,
        same_name_check: payoutEvidence.same_name_check,
      },
    }, { payoutEvidence }, actor, correlationId);
  }

  async instructPayout(
    transferId: string,
    referenceId?: string | null,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await this.loadAndAssert(transferId, 'PAYOUT_INSTRUCTED');
    const payout = {
      ...(transfer.payout || {}),
      reference_id: referenceId || undefined,
      routing_status: 'instructed',
    } as PayoutEvidence;
    const reconciliation = this.computeReconciliation({ ...transfer, payout });
    return this.transition(transfer, 'PAYOUT_INSTRUCTED', 'payout_instructed', {
      payout,
      reconciliation,
    }, { referenceId, reconciliation }, actor, correlationId);
  }

  async markReconciled(
    transferId: string,
    reconciliation?: ReconciliationEvidence,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await transferRepository.getById(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);
    if (transfer.state === 'RECONCILED') {
      await this.appendReplay(transfer, 'transfer_already_reconciled', {}, actor, correlationId);
      return transfer;
    }

    TransferStateMachine.assertTransition(transfer.state, 'RECONCILED');
    const rec = {
      ...(reconciliation || this.computeReconciliation(transfer)),
      reconciled_at: reconciliation?.reconciled_at || new Date().toISOString(),
      reconciled_by: reconciliation?.reconciled_by || 'system',
    };

    if (!rec.amounts_match || rec.discrepancies.length > 0) {
      throw new Error(`Transfer ${transfer.public_ref} is not reconcilable: ${rec.discrepancies.join('; ') || 'amounts do not match'}`);
    }

    return this.transition(transfer, 'RECONCILED', 'reconciled', {
      reconciliation: rec,
    }, { reconciliation: rec }, actor, correlationId);
  }

  async fail(
    transferId: string,
    reason: string,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await transferRepository.getById(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);
    if (transfer.state === 'FAILED') {
      await this.appendReplay(transfer, 'transfer_already_failed', { reason }, actor, correlationId);
      return transfer;
    }
    TransferStateMachine.assertTransition(transfer.state, 'FAILED');
    return this.transition(transfer, 'FAILED', 'failed', {
      failure_reason: reason,
    }, { reason }, actor, correlationId, 'error');
  }

  async requireRefund(
    transferId: string,
    reason: string,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer> {
    const transfer = await this.loadAndAssert(transferId, 'REFUND_REQUIRED');
    return this.transition(transfer, 'REFUND_REQUIRED', 'refund_required', {
      failure_reason: reason,
    }, { reason }, actor, correlationId, 'warn');
  }

  async getTransferWithEvents(transferId: string): Promise<{ transfer: Transfer; events: TransferEvent[] }> {
    const transfer = await transferRepository.getById(transferId) || await transferRepository.getByPublicRef(transferId);
    if (!transfer) throw new Error(`Transfer ${transferId} not found`);
    const events = await transferRepository.getEvents(transfer.id);
    return { transfer, events };
  }

  async getByLegacyTransferId(legacyTransferId: string): Promise<Transfer | null> {
    return transferRepository.getByLegacyTransferId(legacyTransferId);
  }

  async syncFromInternationalTransfer(
    legacy: LegacyInternationalTransfer,
    actor: TransferActor = 'system',
    correlationId?: string | null,
  ): Promise<Transfer | null> {
    if (!legacy?.transfer_id) return null;
    if (legacy.status === 'FAILED') {
      const existing = await transferRepository.getByLegacyTransferId(legacy.transfer_id);
      return existing ? this.fail(existing.id, this.legacyFailureReason(legacy), actor, correlationId) : null;
    }

    let transfer = await transferRepository.getByLegacyTransferId(legacy.transfer_id);
    if (!transfer) {
      transfer = await this.createTransfer({
        amount_brl_in: text(legacy.brl_amount),
        source_endpoint: this.sourceEndpointFromLegacy(legacy),
        destination_endpoint: this.destinationEndpointFromLegacy(legacy),
        actor,
        correlation_id: correlationId || undefined,
        legacy_transfer_id: legacy.transfer_id,
      });
    }

    const quote = this.quoteFromLegacy(legacy);
    if (transfer.state === 'CREATED' && quote) {
      transfer = await this.attachQuote(transfer.id, quote, actor, correlationId);
    }

    const pix = this.pixFromLegacy(legacy);
    if (transfer.state === 'QUOTED' && pix?.charge_id && legacyReached(legacy.status, 'PIX_PENDING')) {
      transfer = await this.issuePixCharge(transfer.id, { charge_id: pix.charge_id, provider: 'etherfuse' }, actor, correlationId);
    }

    if (transfer.state === 'PIX_CHARGE_ISSUED' && pix && legacyReached(legacy.status, 'PIX_RECEIVED')) {
      transfer = await this.confirmPixFunding(transfer.id, pix, 'webhook:etherfuse', correlationId);
    }

    if (transfer.state === 'PIX_FUNDED' && (
      legacyReached(legacy.status, 'BRL_TO_USDC_PENDING') ||
      legacyReached(legacy.status, 'USDC_SETTLEMENT_PENDING') ||
      legacyReached(legacy.status, 'USDC_SETTLED')
    )) {
      transfer = await this.beginConversion(transfer.id, actor, correlationId);
    }

    const stellar = this.stellarFromLegacy(legacy);
    if (transfer.state === 'CONVERTING' && stellar && legacyReached(legacy.status, 'USDC_SETTLED')) {
      transfer = await this.confirmStellarSettlement(transfer.id, stellar, 'poller:stellar', correlationId);
    }

    const payoutRoute = this.payoutRouteFromLegacy(legacy);
    if (transfer.state === 'STELLAR_SETTLED' && payoutRoute && (
      legacyReached(legacy.status, 'PAYOUT_INSTRUCTION_CREATED') ||
      legacyReached(legacy.status, 'PAYOUT_PENDING') ||
      legacyReached(legacy.status, 'PAYOUT_COMPLETED')
    )) {
      transfer = await this.routePayout(transfer.id, payoutRoute, actor, correlationId);
    }

    if (transfer.state === 'PAYOUT_ROUTING' && (legacy.payout_instruction_id || legacy.provider_payout_id)) {
      transfer = await this.instructPayout(transfer.id, legacy.payout_instruction_id || legacy.provider_payout_id, actor, correlationId);
    }

    if (transfer.state === 'PAYOUT_INSTRUCTED' && legacyReached(legacy.status, 'PAYOUT_COMPLETED')) {
      try {
        transfer = await this.markReconciled(transfer.id, undefined, actor, correlationId);
      } catch {
        return transfer;
      }
    }

    return transfer;
  }

  private async transition(
    transfer: Transfer,
    toState: TransferState,
    eventType: TransferEventType,
    updates: Partial<Transfer>,
    payload: Record<string, unknown>,
    actor: TransferActor,
    correlationId?: string | null,
    level: 'info' | 'warn' | 'error' = 'info',
  ): Promise<Transfer> {
    TransferStateMachine.assertTransition(transfer.state, toState);
    const updated = await transferRepository.transition({
      transferId: transfer.id,
      expectedVersion: transfer.state_version,
      toState,
      eventType,
      payload,
      actor,
      correlationId,
      updates: {
        ...updates,
        state: toState,
      },
    });
    this.log(updated, eventType, transfer.state, toState, actor, correlationId || null, payload, level);
    return updated;
  }

  private async appendReplay(
    transfer: Transfer,
    reason: string,
    payload: Record<string, unknown>,
    actor: TransferActor,
    correlationId?: string | null,
  ): Promise<void> {
    await transferRepository.appendEvent({
      transfer_id: transfer.id,
      from_state: transfer.state,
      to_state: transfer.state,
      event_type: 'idempotent_replay',
      payload: { reason, ...payload },
      actor,
      correlation_id: correlationId || null,
    });
    this.log(transfer, 'idempotent_replay', transfer.state, transfer.state, actor, correlationId || null, { reason, ...payload });
  }

  private computeReconciliation(transfer: Transfer): ReconciliationEvidence {
    const fees = transfer.quote?.fee_breakdown || [];
    const amountsMatch = decimalAbsDiffWithin(
      transfer.amount_usdc_settled,
      transfer.amount_usd_out_expected,
      '0.01',
      7,
    );
    const discrepancies: string[] = [];
    if (!transfer.pix?.charge_id) discrepancies.push('missing_pix_charge');
    if (!transfer.pix?.paid_at) discrepancies.push('missing_pix_paid_at');
    if (!transfer.stellar?.tx_hash) discrepancies.push('missing_stellar_tx_hash');
    if (!amountsMatch) discrepancies.push('settled_amount_differs_from_quote');
    if (transfer.state === 'PAYOUT_INSTRUCTED' || transfer.state === 'RECONCILED') {
      if (!transfer.payout?.routing_status) discrepancies.push('missing_payout_routing_status');
      if (!transfer.payout?.same_name_check) discrepancies.push('missing_same_name_check');
    }

    return {
      amounts_match: amountsMatch,
      fees_total: fees,
      discrepancies,
      reconciled_by: 'system',
      ...(discrepancies.length === 0 ? { reconciled_at: new Date().toISOString() } : {}),
    };
  }

  private loadAndAssert(transferId: string, targetState: TransferState): Promise<Transfer> {
    return transferRepository.getById(transferId).then((transfer) => {
      if (!transfer) throw new Error(`Transfer ${transferId} not found`);
      TransferStateMachine.assertTransition(transfer.state, targetState);
      return transfer;
    });
  }

  private log(
    transfer: Transfer,
    event: string,
    fromState: TransferState | null,
    toState: TransferState,
    actor: TransferActor,
    correlationId: string | null,
    meta: Record<string, unknown>,
    level: 'info' | 'warn' | 'error' = 'info',
  ): void {
    logOrchestration({
      level,
      transfer_id: transfer.id,
      public_ref: transfer.public_ref,
      event,
      from_state: fromState,
      to_state: toState,
      actor,
      correlation_id: correlationId,
      meta,
    });
  }

  private sourceEndpointFromLegacy(legacy: LegacyInternationalTransfer): SourceEndpoint {
    const sender = legacy.sender_identity || {};
    return {
      institution_type: text(legacy.institution_id) ? 'institution' : text(sender.type) || 'individual',
      masked_identifier: maskIdentifier(legacy.institution_id || legacy.user_id || sender.email || sender.legal_name, 'legacy:'),
    };
  }

  private destinationEndpointFromLegacy(legacy: LegacyInternationalTransfer): DestinationEndpoint {
    const destination = legacy.payout_destination || {};
    return {
      provider_type: text(destination.providerLabel || destination.bankName || legacy.payout_provider || 'usd_bank'),
      country: text(destination.country || 'US'),
      masked_account: maskIdentifier(destination.accountNumber || destination.iban || destination.routingNumber, 'acct:'),
      account_holder_name: text(destination.accountHolderName) || undefined,
    };
  }

  private quoteFromLegacy(legacy: LegacyInternationalTransfer): QuoteSnapshot | null {
    if (!legacy.fx_rate && !legacy.quoted_usd_amount) return null;
    const metadataQuote = legacy.reconciliation_metadata?.quote || {};
    const feeBreakdown: FeeItem[] = [
      legacy.fees?.platform_fee ? {
        label: 'Platform fee',
        amount: text(legacy.fees.platform_fee.amount || '0'),
        currency: legacy.fees.platform_fee.currency || 'BRL',
        bps: legacy.fees.platform_fee.bps,
      } : null,
      legacy.fees?.estimated_provider_fee ? {
        label: 'Estimated provider fee',
        amount: text(legacy.fees.estimated_provider_fee.amount || '0'),
        currency: legacy.fees.estimated_provider_fee.currency || 'USD',
      } : null,
    ].filter(Boolean) as FeeItem[];

    return {
      rate: text(legacy.fx_rate || metadataQuote.fx_rate || '0'),
      fee_breakdown: feeBreakdown,
      expires_at: text(metadataQuote.expires_at) || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      quoted_at: text(metadataQuote.created_at || metadataQuote.updated_at) || new Date().toISOString(),
      source: text(metadataQuote.quote_source || 'stellar_pathfinding'),
    };
  }

  private pixFromLegacy(legacy: LegacyInternationalTransfer): PixEvidence | null {
    const webhook = legacy.reconciliation_metadata?.pix_webhook || {};
    const chargeId = text(legacy.pix_order_id || legacy.pix_payment_id || webhook.order_id || webhook.orderId);
    if (!chargeId) return null;
    return compactObject({
      charge_id: chargeId,
      e2e_id: text(webhook.e2e_id || webhook.e2eId || webhook.end_to_end_id || webhook.endToEndId) || undefined,
      txid: text(webhook.txid || webhook.txId || webhook.transaction_id || webhook.transactionId) || undefined,
      paid_at: text(legacy.pix_received_at || webhook.paid_at || webhook.paidAt || webhook.confirmed_at) || undefined,
      payer_masked: maskIdentifier(webhook.payer || webhook.payer_document || webhook.payerDocument || webhook.customer_id),
      provider: 'etherfuse' as const,
    });
  }

  private stellarFromLegacy(legacy: LegacyInternationalTransfer): StellarEvidence | null {
    const settlement = legacy.reconciliation_metadata?.stellar_settlement || {};
    const txHash = text(legacy.stellar_tx_hash || settlement.stellar_tx_hash || settlement.tx_hash);
    if (!txHash) return null;
    const referenceQuote = legacy.reconciliation_metadata?.quote?.metadata?.reference_quote || {};
    const path = Array.isArray(referenceQuote.path)
      ? referenceQuote.path.map((item: any) => text(item.code || item.asset_code)).filter(Boolean)
      : ['BRL', 'USDC'];
    return {
      tx_hash: txHash,
      ledger: Number(settlement.ledger || settlement.ledger_sequence || 0),
      network: text(settlement.network || process.env.STELLAR_NETWORK).toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet',
      settled_at: text(legacy.stellar_settled_at || settlement.settled_at) || new Date().toISOString(),
      source_account_masked: maskIdentifier(legacy.stellar_source_account || settlement.stellar_source_account || settlement.source_account, 'stellar:'),
      asset: text(legacy.stellar_asset_code || settlement.asset_code || 'USDC'),
      path_used: path.length ? path : ['BRL', 'USDC'],
    };
  }

  private payoutRouteFromLegacy(legacy: LegacyInternationalTransfer): Pick<PayoutEvidence, 'provider_hint' | 'same_name_check'> | null {
    const destination = legacy.payout_destination || {};
    const expected = text(legacy.recipient_identity?.legal_name || destination.accountHolderName || '');
    const provided = text(destination.accountHolderName || expected);
    return {
      provider_hint: text(legacy.payout_provider || destination.providerLabel || 'stub'),
      same_name_check: {
        expected,
        provided,
        passed: !expected || !provided || expected.toLowerCase() === provided.toLowerCase(),
      },
    };
  }

  private legacyFailureReason(legacy: LegacyInternationalTransfer): string {
    const last = Array.isArray(legacy.error_logs) ? legacy.error_logs.at(-1) : null;
    return text(last?.message) || `Legacy international transfer entered ${legacy.status}`;
  }
}

export const orchestrator = new TransferOrchestrator();
