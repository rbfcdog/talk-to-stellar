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

describe('BRL -> USDC -> USD international transfer layer', () => {
  it('creates BRL/USD quote using Stellar pathfinding output', async () => {
    const repository = new MemoryTransferRepository();
    const quoteService = new BrlUsdQuoteService({
      repository,
      quoteBrlToUsdc: async () => ({
        source: 'configured_brl_asset',
        symbol: 'USDC/BRL',
        brlPerUsdc: '5.60000000',
        usdcPerBrl: '0.17857143',
        fetchedAt: new Date().toISOString(),
        sourceAsset: { code: 'BRL', issuer: 'GBRL' },
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
    expect(Number(quote.estimated_usdc_amount)).toBeGreaterThan(0);
    expect(Number(quote.estimated_usd_amount)).toBeGreaterThan(0);
    expect(repository.quotes.get(quote.quote_id)).toBeDefined();
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
        source: 'configured_brl_asset',
        symbol: 'USDC/BRL',
        brlPerUsdc: '5.60000000',
        usdcPerBrl: '0.17857143',
        fetchedAt: new Date().toISOString(),
        sourceAsset: { code: 'BRL', issuer: 'GBRL' },
        destinationAsset: { code: 'USDC', issuer: 'GUSDC' },
        sourceAmount: '560.0000000',
        destinationAmount: '100.0000000',
        path: [],
      }),
    });
    const pixFunding = {
      createPixIntent: jest.fn(async () => ({
        provider: 'etherfuse',
        pix_payment_id: 'pix-order-1',
        pix_order_id: 'pix-order-1',
        operation_id: 'op-1',
        status: 'pending',
        payment_instructions: { pixCode: '000201' },
        raw: {},
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

    const quote = await quoteService.createQuote({ brl_amount: '560', user_id: 'user-1' });
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
    });
    expect(transfer.status).toBe('QUOTE_CREATED');

    transfer = await service.createPixIntent(transfer.transfer_id, {
      session_id: 'session-1',
      session_token: 'token-1',
    });
    expect(transfer.status).toBe('PIX_PENDING');
    expect(transfer.pix_order_id).toBe('pix-order-1');

    transfer = await service.handlePixConfirmation({ order_id: 'pix-order-1', status: 'completed' });
    expect(transfer.status).toBe('PIX_RECEIVED');

    transfer = await service.settleStellar(transfer.transfer_id);
    expect(transfer.status).toBe('USDC_SETTLED');
    expect(transfer.stellar_tx_hash).toBe('stellar-hash-1');

    transfer = await service.createPayoutInstruction(transfer.transfer_id, 'mock');
    expect(transfer.status).toBe('PAYOUT_PENDING');
    expect(transfer.provider_payout_id).toBe('provider-payout-1');

    const reconciliation = await service.getReconciliation(transfer.transfer_id);
    expect(reconciliation.pix_order_id).toBe('pix-order-1');
    expect(reconciliation.stellar_tx_hash).toBe('stellar-hash-1');
    expect(reconciliation.provider_payout_id).toBe('provider-payout-1');
    const evidence = reconciliation.evidence as any;
    expect(evidence.on_off_ramp).toMatchObject({
      on_ramp_provider: 'etherfuse',
      on_ramp_order_id: 'pix-order-1',
      off_ramp_provider: 'mock',
    });
    expect(evidence.metrics).toMatchObject({
      source_amount_brl: '560',
      fx_rate_brl_per_usd: '5.6',
      baseline_usd_before_route_costs: '100',
    });
    expect(evidence.metric_validation).toMatchObject({
      source_amount_positive: true,
      fx_rate_positive: true,
      fee_math_matches_delta: true,
      route_delta_explained_by_fees: true,
    });
    expect(evidence.metrics_valid).toBe(true);
  });
});
