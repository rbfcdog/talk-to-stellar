import { InternationalTransferRepository } from '../src/api/repository/international-transfer.repository';
import { BrlUsdQuoteService } from '../src/api/services/brl-usd-quote.service';
import { IdentityAlignmentService } from '../src/api/services/identity-alignment.service';
import { InternationalTransferService } from '../src/api/services/international-transfer.service';
import {
  InternationalTransfer,
  InternationalTransferQuote,
  PayoutInstruction,
  TransferReconciliation,
} from '../src/api/services/international-transfer.types';

class MemoryTransferRepository implements InternationalTransferRepository {
  quotes = new Map<string, InternationalTransferQuote>();
  transfers = new Map<string, InternationalTransfer>();
  reconciliations = new Map<string, TransferReconciliation>();

  async createQuote(quote: InternationalTransferQuote) {
    this.quotes.set(quote.quote_id, quote);
    return quote;
  }

  async getQuote(quoteId: string) {
    return this.quotes.get(quoteId) || null;
  }

  async updateQuote(quoteId: string, updates: Partial<InternationalTransferQuote>) {
    const quote = this.quotes.get(quoteId);
    if (!quote) throw new Error('quote not found');
    const updated = { ...quote, ...updates, updated_at: new Date().toISOString() };
    this.quotes.set(quoteId, updated);
    return updated;
  }

  async createTransfer(transfer: InternationalTransfer) {
    this.transfers.set(transfer.transfer_id, transfer);
    return transfer;
  }

  async getTransfer(transferId: string) {
    return this.transfers.get(transferId) || null;
  }

  async updateTransfer(transferId: string, updates: Partial<InternationalTransfer>) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) throw new Error('transfer not found');
    const updated = { ...transfer, ...updates, updated_at: new Date().toISOString() };
    this.transfers.set(transferId, updated);
    return updated;
  }

  async findTransferByPixReference(reference: string) {
    return Array.from(this.transfers.values()).find((transfer) =>
      transfer.pix_order_id === reference || transfer.pix_payment_id === reference
    ) || null;
  }

  async upsertReconciliation(reconciliation: TransferReconciliation) {
    const existing = this.reconciliations.get(reconciliation.transfer_id);
    const updated = {
      ...(existing || reconciliation),
      ...reconciliation,
      created_at: existing?.created_at || reconciliation.created_at,
      updated_at: reconciliation.updated_at,
    };
    this.reconciliations.set(reconciliation.transfer_id, updated);
    return updated;
  }

  async getReconciliation(transferId: string) {
    return this.reconciliations.get(transferId) || null;
  }
}

function referenceQuote(destinationAmount = '100.0000000') {
  return {
    source: 'transaction_values' as const,
    symbol: 'USDC/BRL' as const,
    brlPerUsdc: '5.60000000',
    usdcPerBrl: '0.17857143',
    fetchedAt: new Date().toISOString(),
    sourceAsset: { code: 'TESOURO', issuer: 'GTESOURO' },
    destinationAsset: { code: 'USDC', issuer: 'GUSDC' },
    sourceAmount: '560.0000000',
    destinationAmount,
    path: [],
  };
}

function payoutDestination() {
  return {
    accountHolderName: 'Rodrigo Banin',
    accountHolderType: 'individual' as const,
    bankName: 'International USD Bank',
    routingNumber: '021000021',
    accountNumber: '123456789',
    accountType: 'checking' as const,
    country: 'US',
    providerLabel: 'other' as const,
  };
}

async function createPixPendingTransfer(input: {
  repository: MemoryTransferRepository;
  pixFunding?: any;
  stellarSettlement?: any;
  payoutAdapter?: any;
}) {
  const quoteService = new BrlUsdQuoteService({
    repository: input.repository,
    quoteBrlToUsdc: async () => referenceQuote(),
  });
  const service = new InternationalTransferService({
    repository: input.repository,
    quoteService,
    pixFunding: input.pixFunding || {
      createPixIntent: jest.fn(async () => ({
        provider: 'etherfuse',
        pix_payment_id: 'mock_pix_order-1',
        pix_order_id: 'mock_pix_order-1',
        operation_id: 'op-1',
        status: 'pending',
        payment_instructions: { mode: 'mock' },
        raw: { mode: 'mock', no_real_pix_created: true },
      })),
    } as any,
    stellarSettlement: input.stellarSettlement,
    payoutAdapter: input.payoutAdapter,
  });
  const quote = await quoteService.createQuote({
    brl_amount: '560',
    user_id: 'user-1',
    request_id: 'req-service-1',
    correlation_id: 'corr-service-1',
  });
  let transfer = await service.createTransfer({
    quote_id: quote.quote_id,
    user_id: 'user-1',
    sender_identity: { legal_name: 'Rodrigo Banin', email: 'rodrigo@example.com' },
    recipient_identity: { legal_name: 'Rodrigo Banin' },
    payout_destination: payoutDestination(),
    request_id: 'req-transfer-1',
    correlation_id: 'corr-service-1',
  });
  transfer = await service.createPixIntent(transfer.transfer_id, {
    session_id: 'session-1',
    session_token: 'token-1',
    request_id: 'req-pix-1',
    correlation_id: 'corr-service-1',
  });
  return { service, quoteService, quote, transfer };
}

describe('BRL -> USDC -> USD international transfer layer', () => {
  it('creates BRL/USD quote using Stellar pathfinding output', async () => {
    const repository = new MemoryTransferRepository();
    const quoteService = new BrlUsdQuoteService({
      repository,
      quoteBrlToUsdc: async () => ({
        source: 'transaction_values',
        symbol: 'USDC/BRL',
        brlPerUsdc: '5.60000000',
        usdcPerBrl: '0.17857143',
        fetchedAt: new Date().toISOString(),
        sourceAsset: { code: 'TESOURO', issuer: 'GTESOURO' },
        destinationAsset: { code: 'USDC', issuer: 'GUSDC' },
        sourceAmount: '560.0000000',
        destinationAmount: '100.0000000',
        path: [],
      }),
    });

    const quote = await quoteService.createQuote({ brl_amount: '560', user_id: 'user-1' });

    expect(quote.source_currency).toBe('BRL');
    expect(quote.destination_currency).toBe('USD');
    expect(quote.quote_source).toBe('stellar_pathfinding');
    expect(quote.estimated_provider_fee).toMatchObject({
      amount: '0',
      currency: 'USD',
    });
    expect((quote.metadata as any)?.fee_model).toBe('charged_on_off_ramp_transaction_fees_only');
    expect((quote.metadata as any)?.fee_breakdown?.total_charged_fee_usd).toBeDefined();
    expect(quote.provenance).toMatchObject({
      kind: 'live_path_quote',
      live: true,
      fallback: false,
      executable: true,
    });
    expect((quote.metadata as any)?.quote_provenance).toMatchObject({
      source: 'stellar_horizon_strict_send_paths',
    });
    expect(Number(quote.estimated_usdc_amount)).toBeGreaterThan(0);
    expect(Number(quote.estimated_usd_amount)).toBeGreaterThan(0);
    expect(repository.quotes.get(quote.quote_id)).toBeDefined();
  });

  it('expires stale quotes before transfer creation can use them', async () => {
    const repository = new MemoryTransferRepository();
    const issuedAt = new Date('2026-06-05T12:00:00.000Z');
    let currentTime = issuedAt;
    const quoteService = new BrlUsdQuoteService({
      repository,
      now: () => currentTime,
      quoteBrlToUsdc: async () => referenceQuote(),
    });

    const quote = await quoteService.createQuote({ brl_amount: '560', user_id: 'user-1' });
    currentTime = new Date(issuedAt.getTime() + 301_000);

    await expect(quoteService.getActiveQuote(quote.quote_id)).rejects.toThrow(/expired/i);
    expect(repository.quotes.get(quote.quote_id)?.quote_status).toBe('EXPIRED');
  });

  it('flags same-name payout matches and mismatches without blocking', () => {
    const matched = IdentityAlignmentService.evaluateSameName({
      senderIdentity: { legal_name: 'Rodrigo Banin' },
      recipientIdentity: { legal_name: 'Rodrigo Banin' },
      payoutDestination: {
        accountHolderName: 'Rodrigo Banin',
        accountHolderType: 'individual',
        country: 'US',
      },
    });
    const mismatched = IdentityAlignmentService.evaluateSameName({
      senderIdentity: { legal_name: 'Rodrigo Banin' },
      recipientIdentity: { legal_name: 'Ana Silva' },
      payoutDestination: {
        accountHolderName: 'Mercury Test LLC',
        accountHolderType: 'business',
        country: 'US',
      },
    });

    expect(matched.same_name_match_status).toBe('MATCHED');
    expect(mismatched.same_name_match_status).toBe('MISMATCHED');
    expect(mismatched.identity_risk_notes.join(' ')).toMatch(/manual review/i);
  });

  it('moves transfer through Pix, Stellar settlement, payout instruction and reconciliation', async () => {
    const repository = new MemoryTransferRepository();
    const quoteService = new BrlUsdQuoteService({
      repository,
      quoteBrlToUsdc: async () => ({
        source: 'transaction_values',
        symbol: 'USDC/BRL',
        brlPerUsdc: '5.60000000',
        usdcPerBrl: '0.17857143',
        fetchedAt: new Date().toISOString(),
        sourceAsset: { code: 'TESOURO', issuer: 'GTESOURO' },
        destinationAsset: { code: 'USDC', issuer: 'GUSDC' },
        sourceAmount: '560.0000000',
        destinationAmount: '100.0000000',
        path: [],
      }),
    });
    const pixFunding = {
      createPixIntent: jest.fn(async () => ({
        provider: 'etherfuse',
        pix_payment_id: 'mock_pix_order-1',
        pix_order_id: 'mock_pix_order-1',
        operation_id: 'op-1',
        status: 'pending',
        payment_instructions: { pixCode: '000201' },
        raw: {
          mode: 'mock',
          no_real_pix_created: true,
          quote: {
            id: 'etherfuse-on-quote-1',
            fromAmount: '560',
            toAmount: '99.9',
            feeAmount: '0.56',
            feeBps: '10',
          },
        },
      })),
    };
    const stellarSettlement = {
      settleUsdc: jest.fn(async (transfer: InternationalTransfer) => ({
        stellar_tx_hash: 'stellar-hash-1',
        stellar_memo: 'tts-test',
        stellar_source_account: 'GSOURCE',
        stellar_destination_account: 'GDEST',
        asset_code: 'USDC',
        asset_issuer: 'GUSDC',
        amount: transfer.quoted_usd_amount,
        network: 'testnet',
        status: 'mocked',
        execution_mode: 'mock',
        settled_at: new Date().toISOString(),
      })),
    };
    const payoutInstruction: PayoutInstruction = {
      payout_instruction_id: 'payout-instruction-1',
      provider_name: 'mock',
      provider_payout_id: 'provider-payout-1',
      status: 'pending',
      amount_usd: '99',
      currency: 'USD',
      created_at: new Date().toISOString(),
      metadata: {
        quote: {
          id: 'etherfuse-off-quote-1',
          fromAmount: '99.7',
          toAmount: '557.2',
          feeAmount: '0.28',
          feeBps: '5',
        },
        provider_off_ramp_fee_currency: 'BRL',
      },
      destination: {
        accountHolderName: 'Rodrigo Banin',
        accountHolderType: 'individual',
        country: 'US',
      },
    };
    const payoutAdapter = {
      providerName: 'mock',
      createPayoutInstruction: jest.fn(async () => payoutInstruction),
      getPayoutStatus: jest.fn(async () => 'pending'),
    };
    const service = new InternationalTransferService({
      repository,
      quoteService,
      pixFunding: pixFunding as any,
      stellarSettlement: stellarSettlement as any,
      payoutAdapter: payoutAdapter as any,
    });

    const quote = await quoteService.createQuote({
      brl_amount: '560',
      user_id: 'user-1',
      request_id: 'req-lifecycle-quote',
      correlation_id: 'corr-service-1',
    });
    let transfer = await service.createTransfer({
      quote_id: quote.quote_id,
      user_id: 'user-1',
      sender_identity: { legal_name: 'Rodrigo Banin', email: 'rodrigo@example.com' },
      recipient_identity: { legal_name: 'Rodrigo Banin' },
      payout_destination: {
        accountHolderName: 'Rodrigo Banin',
        accountHolderType: 'individual',
        bankName: 'International USD Bank',
        routingNumber: '021000021',
        accountNumber: '123456789',
        accountType: 'checking',
        country: 'US',
        providerLabel: 'other',
      },
      request_id: 'req-lifecycle-transfer',
      correlation_id: 'corr-service-1',
    });
    expect(transfer.status).toBe('QUOTE_CREATED');

    transfer = await service.createPixIntent(transfer.transfer_id, {
      session_id: 'session-1',
      session_token: 'token-1',
      request_id: 'req-lifecycle-pix',
      correlation_id: 'corr-service-1',
    });
    expect(transfer.status).toBe('PIX_PENDING');
    expect(transfer.pix_order_id).toBe('mock_pix_order-1');

    transfer = await service.confirmSandboxFunding(transfer.transfer_id);
    expect(transfer.status).toBe('PIX_RECEIVED');

    transfer = await service.confirmSandboxFunding(transfer.transfer_id);
    expect(transfer.status).toBe('PIX_RECEIVED');
    expect((transfer.reconciliation_metadata as any).trace.correlation_id).toBe('corr-service-1');

    transfer = await service.settleStellar(transfer.transfer_id);
    expect(transfer.status).toBe('USDC_SETTLED');
    expect(transfer.stellar_tx_hash).toBe('stellar-hash-1');

    transfer = await service.settleStellar(transfer.transfer_id);
    expect(transfer.status).toBe('USDC_SETTLED');
    expect(stellarSettlement.settleUsdc).toHaveBeenCalledTimes(1);

    transfer = await service.createPayoutInstruction(transfer.transfer_id, 'mock');
    expect(transfer.status).toBe('PAYOUT_PENDING');
    expect(transfer.provider_payout_id).toBe('provider-payout-1');

    transfer = await service.createPayoutInstruction(transfer.transfer_id, 'mock');
    expect(transfer.status).toBe('PAYOUT_PENDING');
    expect(payoutAdapter.createPayoutInstruction).toHaveBeenCalledTimes(1);

    const reconciliation = await service.getReconciliation(transfer.transfer_id);
    expect(reconciliation.pix_order_id).toBe('mock_pix_order-1');
    expect(reconciliation.stellar_tx_hash).toBe('stellar-hash-1');
    expect(reconciliation.provider_payout_id).toBe('provider-payout-1');
    const evidence = reconciliation.evidence as any;
    expect(evidence.on_off_ramp).toMatchObject({
      on_ramp_provider: 'etherfuse',
      on_ramp_order_id: 'mock_pix_order-1',
      off_ramp_provider: 'mock',
    });
    expect(evidence.metrics).toMatchObject({
      source_amount_brl: '560',
      fx_rate_brl_per_usd: '5.6',
      baseline_usd_before_route_costs: '100',
      provider_on_ramp_fee_brl_equivalent: '0.56',
      provider_on_ramp_fee_usd_equivalent: '0.1',
      provider_off_ramp_fee_brl_equivalent: '0.28',
      provider_off_ramp_fee_usd_equivalent: '0.05',
      total_empirical_fee_usd: '0.45',
    });
    expect(evidence.metric_validation).toMatchObject({
      source_amount_positive: true,
      fx_rate_positive: true,
      fee_math_matches_delta: true,
      route_delta_explained_by_fees: true,
    });
    expect(evidence.metrics_valid).toBe(true);

    const orchestrationLog = await service.getOrchestrationLog(transfer.transfer_id);
    expect(orchestrationLog).toMatchObject({
      transfer_id: transfer.transfer_id,
      quote_id: quote.quote_id,
      current_status: 'PAYOUT_PENDING',
      correlation_id: 'corr-service-1',
      evidence_status: {
        quote: 'captured',
        pix_funding: 'captured',
        stellar_settlement: 'mock',
        payout_instruction: 'mock',
        reconciliation: 'captured',
      },
      destination: {
        account_number_last4: '6789',
        routing_number_last4: '0021',
      },
      redaction: {
        applied: true,
      },
    });
    expect(orchestrationLog.destination).not.toHaveProperty('accountNumber');
    expect(orchestrationLog.destination).not.toHaveProperty('account_number');
    expect(orchestrationLog.quote_provenance).toMatchObject({
      kind: 'live_path_quote',
      source: 'stellar_horizon_strict_send_paths',
    });
    expect(orchestrationLog.timeline.map((entry) => entry.step)).toEqual(expect.arrayContaining([
      'quote_created',
      'pix_intent_created',
      'pix_funding_confirmed',
      'pix_funding_replay',
      'stellar_settlement',
      'stellar_settlement_replay',
      'payout_instruction',
      'payout_instruction_replay',
      'reconciliation',
    ]));
  });

  it('marks Pix funding failure events as FAILED with an error log', async () => {
    const repository = new MemoryTransferRepository();
    const { service, transfer } = await createPixPendingTransfer({ repository });

    const failed = await service.handlePixConfirmation({
      transfer_id: transfer.transfer_id,
      order_id: transfer.pix_order_id,
      status: 'failed',
      request_id: 'req-pix-failed',
      correlation_id: 'corr-service-1',
    });

    expect(failed.status).toBe('FAILED');
    expect(failed.pix_status).toBe('failed');
    expect(failed.error_logs.at(-1)).toMatchObject({ stage: 'pix_funding' });
    expect((failed.reconciliation_metadata as any).next_action).toBe('refund_or_retry');
  });

  it('marks Pix intent creation failures as FAILED', async () => {
    const repository = new MemoryTransferRepository();
    const pixFunding = {
      createPixIntent: jest.fn(async () => {
        throw new Error('Etherfuse Pix intent rejected');
      }),
    };
    const quoteService = new BrlUsdQuoteService({
      repository,
      quoteBrlToUsdc: async () => referenceQuote(),
    });
    const service = new InternationalTransferService({
      repository,
      quoteService,
      pixFunding: pixFunding as any,
    });
    const quote = await quoteService.createQuote({ brl_amount: '560', user_id: 'user-1' });
    const transfer = await service.createTransfer({
      quote_id: quote.quote_id,
      user_id: 'user-1',
      sender_identity: { legal_name: 'Rodrigo Banin' },
      recipient_identity: { legal_name: 'Rodrigo Banin' },
      payout_destination: payoutDestination(),
    });

    await expect(service.createPixIntent(transfer.transfer_id, {
      session_id: 'session-1',
      session_token: 'token-1',
    })).rejects.toThrow(/Pix intent rejected/);
    expect(repository.transfers.get(transfer.transfer_id)?.status).toBe('FAILED');
    expect(repository.transfers.get(transfer.transfer_id)?.error_logs.at(-1)).toMatchObject({ stage: 'pix_intent' });
  });

  it('marks settlement failures as FAILED without creating mock evidence', async () => {
    const repository = new MemoryTransferRepository();
    const stellarSettlement = {
      settleUsdc: jest.fn(async () => {
        throw new Error('STELLAR_SECRET_KEY is required for real settlement');
      }),
    };
    const { service, transfer } = await createPixPendingTransfer({
      repository,
      stellarSettlement: stellarSettlement as any,
    });
    const funded = await service.confirmSandboxFunding(transfer.transfer_id);

    await expect(service.settleStellar(funded.transfer_id)).rejects.toThrow(/STELLAR_SECRET_KEY/);
    expect(repository.transfers.get(funded.transfer_id)?.status).toBe('FAILED');
    expect(repository.transfers.get(funded.transfer_id)?.error_logs.at(-1)).toMatchObject({ stage: 'stellar_settlement' });
  });

  it('marks payout adapter failures as FAILED', async () => {
    const repository = new MemoryTransferRepository();
    const stellarSettlement = {
      settleUsdc: jest.fn(async (transfer: InternationalTransfer) => ({
        stellar_tx_hash: 'stellar-hash-1',
        stellar_memo: 'tts-test',
        stellar_source_account: 'GSOURCE',
        stellar_destination_account: 'GDEST',
        asset_code: 'USDC',
        asset_issuer: 'GUSDC',
        amount: transfer.quoted_usd_amount,
        network: 'testnet',
        status: 'submitted',
        execution_mode: 'testnet',
        settled_at: new Date().toISOString(),
      })),
    };
    const payoutAdapter = {
      providerName: 'etherfuse',
      createPayoutInstruction: jest.fn(async () => {
        throw new Error('provider rejected payout instruction');
      }),
      getPayoutStatus: jest.fn(async () => 'pending'),
    };
    const { service, transfer } = await createPixPendingTransfer({
      repository,
      stellarSettlement: stellarSettlement as any,
      payoutAdapter: payoutAdapter as any,
    });
    const funded = await service.confirmSandboxFunding(transfer.transfer_id);
    const settled = await service.settleStellar(funded.transfer_id);

    await expect(service.createPayoutInstruction(settled.transfer_id, 'etherfuse')).rejects.toThrow(/provider rejected/);
    expect(repository.transfers.get(settled.transfer_id)?.status).toBe('FAILED');
    expect(repository.transfers.get(settled.transfer_id)?.error_logs.at(-1)).toMatchObject({ stage: 'payout_instruction' });
  });

  it('refreshes payout status and moves completed payouts to terminal success', async () => {
    const repository = new MemoryTransferRepository();
    const stellarSettlement = {
      settleUsdc: jest.fn(async (transfer: InternationalTransfer) => ({
        stellar_tx_hash: 'stellar-hash-1',
        stellar_memo: 'tts-test',
        stellar_source_account: 'GSOURCE',
        stellar_destination_account: 'GDEST',
        asset_code: 'USDC',
        asset_issuer: 'GUSDC',
        amount: transfer.quoted_usd_amount,
        network: 'testnet',
        status: 'submitted',
        execution_mode: 'testnet',
        settled_at: new Date().toISOString(),
      })),
    };
    const payoutInstruction: PayoutInstruction = {
      payout_instruction_id: 'payout-instruction-refresh',
      provider_name: 'etherfuse',
      provider_payout_id: 'provider-payout-refresh',
      status: 'pending',
      amount_usd: '99',
      currency: 'USD',
      created_at: new Date().toISOString(),
      metadata: { mode: 'etherfuse_sandbox_payload_prepared' },
      destination: payoutDestination(),
    };
    const payoutAdapter = {
      providerName: 'etherfuse',
      createPayoutInstruction: jest.fn(async () => payoutInstruction),
      getPayoutStatus: jest.fn(async () => 'completed'),
    };
    const { service, transfer } = await createPixPendingTransfer({
      repository,
      stellarSettlement: stellarSettlement as any,
      payoutAdapter: payoutAdapter as any,
    });
    const funded = await service.confirmSandboxFunding(transfer.transfer_id);
    const settled = await service.settleStellar(funded.transfer_id);
    const pending = await service.createPayoutInstruction(settled.transfer_id, 'etherfuse');

    const completed = await service.refreshPayoutStatus(pending.transfer_id, {
      request_id: 'req-payout-refresh',
      correlation_id: 'corr-service-1',
    });

    expect(payoutAdapter.getPayoutStatus).toHaveBeenCalledWith('provider-payout-refresh');
    expect(completed.status).toBe('PAYOUT_COMPLETED');
    expect(completed.payout_status).toBe('completed');
    expect(completed.payout_completed_at).toBeDefined();
    expect((completed.reconciliation_metadata as any).payout_status_refresh).toMatchObject({
      provider: 'etherfuse',
      provider_payout_id: 'provider-payout-refresh',
      status: 'completed',
    });
    const reconciliation = await service.getReconciliation(completed.transfer_id);
    expect(reconciliation.final_payout_status).toBe('completed');
  });

  it('refreshes failed payout status into FAILED with reconciliation evidence', async () => {
    const repository = new MemoryTransferRepository();
    const stellarSettlement = {
      settleUsdc: jest.fn(async (transfer: InternationalTransfer) => ({
        stellar_tx_hash: 'stellar-hash-1',
        stellar_memo: 'tts-test',
        asset_code: 'USDC',
        asset_issuer: 'GUSDC',
        amount: transfer.quoted_usd_amount,
        network: 'testnet',
        status: 'submitted',
        execution_mode: 'testnet',
        settled_at: new Date().toISOString(),
      })),
    };
    const payoutAdapter = {
      providerName: 'bridge',
      createPayoutInstruction: jest.fn(async () => ({
        payout_instruction_id: 'payout-instruction-failed',
        provider_name: 'bridge',
        provider_payout_id: 'provider-payout-failed',
        status: 'pending',
        amount_usd: '99',
        currency: 'USD',
        created_at: new Date().toISOString(),
        metadata: { mode: 'sandbox' },
        destination: payoutDestination(),
      })),
      getPayoutStatus: jest.fn(async () => 'failed'),
    };
    const { service, transfer } = await createPixPendingTransfer({
      repository,
      stellarSettlement: stellarSettlement as any,
      payoutAdapter: payoutAdapter as any,
    });
    const funded = await service.confirmSandboxFunding(transfer.transfer_id);
    const settled = await service.settleStellar(funded.transfer_id);
    const pending = await service.createPayoutInstruction(settled.transfer_id, 'bridge');

    const failed = await service.refreshPayoutStatus(pending.transfer_id);

    expect(failed.status).toBe('FAILED');
    expect(failed.payout_status).toBe('failed');
    expect(failed.error_logs.at(-1)).toMatchObject({ stage: 'payout_status' });
    expect((failed.reconciliation_metadata as any).next_action).toBe('refund_or_manual_review');
  });
});
