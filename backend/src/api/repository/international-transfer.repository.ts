import { supabase } from '../../config/supabase';
import {
  InternationalTransfer,
  InternationalTransferQuote,
  TransferReconciliation,
} from '../services/international-transfer.types';

function omitUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function quoteToRow(quote: InternationalTransferQuote): Record<string, unknown> {
  return omitUndefined({
    id: quote.quote_id,
    user_id: quote.user_id,
    institution_id: quote.institution_id,
    source_currency: quote.source_currency,
    destination_currency: quote.destination_currency,
    brl_amount: quote.brl_amount,
    estimated_usdc_amount: quote.estimated_usdc_amount,
    estimated_usd_amount: quote.estimated_usd_amount,
    fx_rate: quote.fx_rate,
    platform_fee: quote.platform_fee,
    estimated_provider_fee: quote.estimated_provider_fee,
    total_fee: quote.total_fee,
    quote_status: quote.quote_status,
    quote_source: quote.quote_source,
    expires_at: quote.expires_at,
    metadata: quote.metadata || {},
    created_at: quote.created_at,
    updated_at: quote.updated_at,
  });
}

function rowToQuote(row: any): InternationalTransferQuote {
  return {
    quote_id: String(row.id),
    user_id: row.user_id || undefined,
    institution_id: row.institution_id || undefined,
    source_currency: 'BRL',
    destination_currency: 'USD',
    brl_amount: String(row.brl_amount),
    estimated_usdc_amount: String(row.estimated_usdc_amount),
    estimated_usd_amount: String(row.estimated_usd_amount),
    fx_rate: String(row.fx_rate),
    platform_fee: row.platform_fee || { amount: '0', currency: 'BRL' },
    estimated_provider_fee: row.estimated_provider_fee || { amount: '0', currency: 'USD' },
    total_fee: row.total_fee || { amount_brl_equivalent: '0', amount_usd_equivalent: '0' },
    expires_at: String(row.expires_at),
    quote_status: row.quote_status || 'ACTIVE',
    quote_source: row.quote_source || 'stellar_pathfinding',
    metadata: row.metadata || {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function transferToRow(transfer: InternationalTransfer): Record<string, unknown> {
  return omitUndefined({
    id: transfer.transfer_id,
    quote_id: transfer.quote_id,
    status: transfer.status,
    user_id: transfer.user_id,
    institution_id: transfer.institution_id,
    sender_identity: transfer.sender_identity,
    recipient_identity: transfer.recipient_identity,
    brl_amount: transfer.brl_amount,
    quoted_usd_amount: transfer.quoted_usd_amount,
    fx_rate: transfer.fx_rate,
    fees: transfer.fees,
    stellar_asset_code: transfer.stellar_asset_code,
    stellar_asset_issuer: transfer.stellar_asset_issuer,
    stellar_tx_hash: transfer.stellar_tx_hash,
    stellar_memo: transfer.stellar_memo,
    stellar_source_account: transfer.stellar_source_account,
    stellar_destination_account: transfer.stellar_destination_account,
    payout_provider: transfer.payout_provider,
    payout_destination: transfer.payout_destination,
    payout_instruction_id: transfer.payout_instruction_id,
    provider_payout_id: transfer.provider_payout_id,
    payout_status: transfer.payout_status,
    pix_payment_id: transfer.pix_payment_id,
    pix_order_id: transfer.pix_order_id,
    pix_status: transfer.pix_status,
    same_name_payout_required: transfer.same_name_payout_required,
    same_name_match_status: transfer.same_name_match_status,
    identity_risk_notes: transfer.identity_risk_notes,
    reconciliation_metadata: transfer.reconciliation_metadata,
    error_logs: transfer.error_logs,
    pix_received_at: transfer.pix_received_at,
    stellar_settled_at: transfer.stellar_settled_at,
    payout_completed_at: transfer.payout_completed_at,
    created_at: transfer.created_at,
    updated_at: transfer.updated_at,
  });
}

function rowToTransfer(row: any): InternationalTransfer {
  return {
    transfer_id: String(row.id),
    quote_id: String(row.quote_id),
    status: row.status,
    user_id: row.user_id || undefined,
    institution_id: row.institution_id || undefined,
    sender_identity: row.sender_identity || {},
    recipient_identity: row.recipient_identity || {},
    brl_amount: String(row.brl_amount),
    quoted_usd_amount: String(row.quoted_usd_amount),
    fx_rate: String(row.fx_rate),
    fees: row.fees || {},
    stellar_asset_code: String(row.stellar_asset_code || 'USDC'),
    stellar_asset_issuer: row.stellar_asset_issuer || undefined,
    stellar_tx_hash: row.stellar_tx_hash || undefined,
    stellar_memo: row.stellar_memo || undefined,
    stellar_source_account: row.stellar_source_account || undefined,
    stellar_destination_account: row.stellar_destination_account || undefined,
    payout_provider: row.payout_provider || undefined,
    payout_destination: row.payout_destination || {},
    payout_instruction_id: row.payout_instruction_id || undefined,
    provider_payout_id: row.provider_payout_id || undefined,
    payout_status: row.payout_status || undefined,
    pix_payment_id: row.pix_payment_id || undefined,
    pix_order_id: row.pix_order_id || undefined,
    pix_status: row.pix_status || undefined,
    same_name_payout_required: Boolean(row.same_name_payout_required),
    same_name_match_status: row.same_name_match_status || 'UNKNOWN',
    identity_risk_notes: Array.isArray(row.identity_risk_notes) ? row.identity_risk_notes : [],
    reconciliation_metadata: row.reconciliation_metadata || {},
    error_logs: Array.isArray(row.error_logs) ? row.error_logs : [],
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    pix_received_at: row.pix_received_at || undefined,
    stellar_settled_at: row.stellar_settled_at || undefined,
    payout_completed_at: row.payout_completed_at || undefined,
  };
}

function reconciliationToRow(reconciliation: TransferReconciliation): Record<string, unknown> {
  return omitUndefined({
    transfer_id: reconciliation.transfer_id,
    quote_id: reconciliation.quote_id,
    pix_payment_id: reconciliation.pix_payment_id,
    pix_order_id: reconciliation.pix_order_id,
    stellar_tx_hash: reconciliation.stellar_tx_hash,
    stellar_memo: reconciliation.stellar_memo,
    payout_instruction_id: reconciliation.payout_instruction_id,
    provider_payout_id: reconciliation.provider_payout_id,
    final_payout_status: reconciliation.final_payout_status,
    evidence: reconciliation.evidence || {},
    created_at: reconciliation.created_at,
    updated_at: reconciliation.updated_at,
  });
}

function rowToReconciliation(row: any): TransferReconciliation {
  return {
    transfer_id: String(row.transfer_id),
    quote_id: String(row.quote_id),
    pix_payment_id: row.pix_payment_id || undefined,
    pix_order_id: row.pix_order_id || undefined,
    stellar_tx_hash: row.stellar_tx_hash || undefined,
    stellar_memo: row.stellar_memo || undefined,
    payout_instruction_id: row.payout_instruction_id || undefined,
    provider_payout_id: row.provider_payout_id || undefined,
    final_payout_status: row.final_payout_status || undefined,
    evidence: row.evidence || {},
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export interface InternationalTransferRepository {
  createQuote(quote: InternationalTransferQuote): Promise<InternationalTransferQuote>;
  getQuote(quoteId: string): Promise<InternationalTransferQuote | null>;
  updateQuote(quoteId: string, updates: Partial<InternationalTransferQuote>): Promise<InternationalTransferQuote>;
  createTransfer(transfer: InternationalTransfer): Promise<InternationalTransfer>;
  getTransfer(transferId: string): Promise<InternationalTransfer | null>;
  updateTransfer(transferId: string, updates: Partial<InternationalTransfer>): Promise<InternationalTransfer>;
  findTransferByPixReference(reference: string): Promise<InternationalTransfer | null>;
  upsertReconciliation(reconciliation: TransferReconciliation): Promise<TransferReconciliation>;
  getReconciliation(transferId: string): Promise<TransferReconciliation | null>;
}

export class SupabaseInternationalTransferRepository implements InternationalTransferRepository {
  async createQuote(quote: InternationalTransferQuote): Promise<InternationalTransferQuote> {
    const { data, error } = await supabase
      .from('international_transfer_quotes')
      .insert(quoteToRow(quote))
      .select('*')
      .single();

    if (error) throw new Error(`Failed to create BRL/USD quote: ${error.message}`);
    return rowToQuote(data);
  }

  async getQuote(quoteId: string): Promise<InternationalTransferQuote | null> {
    const { data, error } = await supabase
      .from('international_transfer_quotes')
      .select('*')
      .eq('id', quoteId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load BRL/USD quote: ${error.message}`);
    return data ? rowToQuote(data) : null;
  }

  async updateQuote(quoteId: string, updates: Partial<InternationalTransferQuote>): Promise<InternationalTransferQuote> {
    const patch = quoteToRow({
      ...(updates as InternationalTransferQuote),
      quote_id: quoteId,
      source_currency: 'BRL',
      destination_currency: 'USD',
      created_at: updates.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    delete (patch as any).id;
    delete (patch as any).created_at;

    const { data, error } = await supabase
      .from('international_transfer_quotes')
      .update(patch)
      .eq('id', quoteId)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to update BRL/USD quote: ${error.message}`);
    return rowToQuote(data);
  }

  async createTransfer(transfer: InternationalTransfer): Promise<InternationalTransfer> {
    const { data, error } = await supabase
      .from('international_transfers')
      .insert(transferToRow(transfer))
      .select('*')
      .single();

    if (error) throw new Error(`Failed to create international transfer: ${error.message}`);
    return rowToTransfer(data);
  }

  async getTransfer(transferId: string): Promise<InternationalTransfer | null> {
    const { data, error } = await supabase
      .from('international_transfers')
      .select('*')
      .eq('id', transferId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load international transfer: ${error.message}`);
    return data ? rowToTransfer(data) : null;
  }

  async updateTransfer(transferId: string, updates: Partial<InternationalTransfer>): Promise<InternationalTransfer> {
    const patch = transferToRow({
      ...(updates as InternationalTransfer),
      transfer_id: transferId,
      quote_id: updates.quote_id || '',
      status: updates.status || 'QUOTE_CREATED',
      sender_identity: updates.sender_identity || {},
      recipient_identity: updates.recipient_identity || {},
      brl_amount: updates.brl_amount || '0',
      quoted_usd_amount: updates.quoted_usd_amount || '0',
      fx_rate: updates.fx_rate || '0',
      fees: updates.fees || {} as any,
      stellar_asset_code: updates.stellar_asset_code || 'USDC',
      payout_destination: updates.payout_destination || {} as any,
      same_name_payout_required: updates.same_name_payout_required || false,
      same_name_match_status: updates.same_name_match_status || 'UNKNOWN',
      identity_risk_notes: updates.identity_risk_notes || [],
      reconciliation_metadata: updates.reconciliation_metadata || {},
      error_logs: updates.error_logs || [],
      created_at: updates.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    delete (patch as any).id;
    delete (patch as any).created_at;
    Object.keys(patch).forEach((key) => {
      if ((updates as Record<string, unknown>)[key] === undefined && key !== 'updated_at') {
        delete (patch as any)[key];
      }
    });

    const { data, error } = await supabase
      .from('international_transfers')
      .update(patch)
      .eq('id', transferId)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to update international transfer: ${error.message}`);
    return rowToTransfer(data);
  }

  async findTransferByPixReference(reference: string): Promise<InternationalTransfer | null> {
    const normalized = String(reference || '').trim();
    if (!normalized) return null;

    const { data: byPaymentId, error: paymentError } = await supabase
      .from('international_transfers')
      .select('*')
      .eq('pix_payment_id', normalized)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) throw new Error(`Failed to find transfer by PIX payment reference: ${paymentError.message}`);
    if (byPaymentId) return rowToTransfer(byPaymentId);

    const { data: byOrderId, error: orderError } = await supabase
      .from('international_transfers')
      .select('*')
      .eq('pix_order_id', normalized)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError) throw new Error(`Failed to find transfer by PIX order reference: ${orderError.message}`);
    return byOrderId ? rowToTransfer(byOrderId) : null;
  }

  async upsertReconciliation(reconciliation: TransferReconciliation): Promise<TransferReconciliation> {
    const { data, error } = await supabase
      .from('international_transfer_reconciliations')
      .upsert(reconciliationToRow(reconciliation), { onConflict: 'transfer_id' })
      .select('*')
      .single();

    if (error) throw new Error(`Failed to upsert transfer reconciliation: ${error.message}`);
    return rowToReconciliation(data);
  }

  async getReconciliation(transferId: string): Promise<TransferReconciliation | null> {
    const { data, error } = await supabase
      .from('international_transfer_reconciliations')
      .select('*')
      .eq('transfer_id', transferId)
      .maybeSingle();

    if (error) throw new Error(`Failed to load transfer reconciliation: ${error.message}`);
    return data ? rowToReconciliation(data) : null;
  }
}

export const internationalTransferRepository = new SupabaseInternationalTransferRepository();
