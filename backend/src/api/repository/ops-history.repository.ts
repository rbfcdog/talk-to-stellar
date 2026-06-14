import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

export const OPS_HISTORY_SOURCES = [
  'transfers',
  'international_transfers',
  'operations',
  'payment_logs',
] as const;

export type OpsHistorySource = typeof OPS_HISTORY_SOURCES[number];
export type OpsHistoryCategory = 'active' | 'completed' | 'failed';

export type OpsHistoryRecord = {
  id: string;
  source: OpsHistorySource;
  source_record_id: string;
  lifecycle_transfer_id: string | null;
  reference: string;
  kind: string;
  status: string;
  category: OpsHistoryCategory;
  route: string;
  source_amount: string | null;
  source_asset: string | null;
  destination_amount: string | null;
  destination_asset: string | null;
  transaction_hash: string | null;
  external_reference: string | null;
  fee_amount: string | null;
  fee_asset: string | null;
  fee_label: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OpsHistoryResult = {
  records: OpsHistoryRecord[];
  source_counts: Record<OpsHistorySource, number>;
  source_errors: Partial<Record<OpsHistorySource, string>>;
};

const PAGE_SIZE = 1000;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function object(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value
      .map((item) => object(item))
      .filter((item) => Object.keys(item).length > 0);
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? objectArray(parsed) : [];
  } catch {
    return [];
  }
}

function nestedObject(source: Record<string, unknown>, key: string): Record<string, unknown> {
  return object(source[key]);
}

type FeeSummary = {
  amount: string | null;
  asset: string | null;
  label: string | null;
};

function emptyFee(): FeeSummary {
  return { amount: null, asset: null, label: null };
}

function feeFromItem(item: Record<string, unknown>): FeeSummary {
  return {
    amount: nullableText(item.amount || item.fee_amount || item.value),
    asset: nullableText(item.currency || item.asset || item.asset_code || item.fee_asset_code),
    label: nullableText(item.label || item.name || item.type || item.fee_type),
  };
}

function preferredFee(items: Array<Record<string, unknown>>): FeeSummary {
  const summaries = items.map(feeFromItem).filter((fee) => fee.amount);
  if (!summaries.length) return emptyFee();
  const preferred = summaries.find((fee) => /talktostellar|platform|app|admin/i.test(fee.label || ''));
  return preferred || summaries[0];
}

function feeFromFields(row: Record<string, unknown>, context: Record<string, unknown> = {}): FeeSummary {
  const candidates = [
    {
      amount: nullableText(row.platform_fee_amount || row.app_fee_amount || row.admin_fee_amount || row.fee_amount || row.developer_fee),
      asset: nullableText(row.platform_fee_asset || row.app_fee_asset || row.admin_fee_asset || row.fee_asset || row.fee_currency || row.currency),
      label: nullableText(row.platform_fee_label || row.app_fee_label || row.admin_fee_label || row.fee_label || 'app fee'),
    },
    {
      amount: nullableText(context.platform_fee_amount || context.app_fee_amount || context.admin_fee_amount || context.fee_amount || context.developer_fee),
      asset: nullableText(context.platform_fee_asset || context.app_fee_asset || context.admin_fee_asset || context.fee_asset || context.fee_currency || context.currency),
      label: nullableText(context.platform_fee_label || context.app_fee_label || context.admin_fee_label || context.fee_label || 'app fee'),
    },
  ];
  return candidates.find((fee) => fee.amount) || emptyFee();
}

function transferFee(row: Record<string, unknown>): FeeSummary {
  const quote = nestedObject(row, 'quote');
  const reconciliation = nestedObject(row, 'reconciliation');
  return preferredFee([
    ...objectArray(quote.fee_breakdown),
    ...objectArray(reconciliation.fees_total),
  ]);
}

function timestamp(value: unknown): string {
  const valueText = text(value);
  if (!valueText) return new Date(0).toISOString();
  const parsed = new Date(valueText);
  return Number.isNaN(parsed.getTime()) ? valueText : parsed.toISOString();
}

function categoryForStatus(value: unknown): OpsHistoryCategory {
  const status = text(value).toUpperCase();
  if (
    status.includes('FAIL') ||
    status.includes('ERROR') ||
    status.includes('CANCEL') ||
    status.includes('EXPIRED') ||
    status.includes('REFUND')
  ) {
    return 'failed';
  }
  if (
    status.includes('SUCCESS') ||
    status.includes('COMPLETED') ||
    status.includes('RECONCILED') ||
    status === 'SETTLED' ||
    status.includes('PAID')
  ) {
    return 'completed';
  }
  return 'active';
}

function transferCategory(status: string): OpsHistoryCategory {
  if (['FAILED', 'REFUND_REQUIRED', 'QUOTE_EXPIRED', 'PIX_EXPIRED'].includes(status.toUpperCase())) {
    return 'failed';
  }
  return status.toUpperCase() === 'RECONCILED' ? 'completed' : 'active';
}

function internationalTransferCategory(status: string): OpsHistoryCategory {
  const normalized = status.toUpperCase();
  if (
    normalized.includes('FAIL') ||
    normalized.includes('ERROR') ||
    normalized.includes('CANCEL') ||
    normalized.includes('EXPIRED') ||
    normalized.includes('REFUND')
  ) {
    return 'failed';
  }
  return normalized === 'PAYOUT_COMPLETED' ? 'completed' : 'active';
}

function endpointLabel(value: unknown, fallback: string): string {
  const endpoint = object(value);
  return text(
    endpoint.institution_type ||
    endpoint.provider_type ||
    endpoint.type ||
    endpoint.provider ||
    fallback,
  );
}

function mapTransfer(row: Record<string, unknown>): OpsHistoryRecord {
  const pix = object(row.pix);
  const stellar = object(row.stellar);
  const payout = object(row.payout);
  const id = text(row.id);
  const status = text(row.state) || 'CREATED';
  const destinationAmount = nullableText(row.amount_usdc_settled || row.amount_usd_out_expected);
  const fee = transferFee(row);

  return {
    id: `transfers:${id}`,
    source: 'transfers',
    source_record_id: id,
    lifecycle_transfer_id: id,
    reference: text(row.public_ref) || id,
    kind: 'D1 lifecycle transfer',
    status,
    category: transferCategory(status),
    route: `${endpointLabel(row.source_endpoint, 'PIX')} -> ${endpointLabel(row.destination_endpoint, 'USD payout')}`,
    source_amount: nullableText(row.amount_brl_in),
    source_asset: row.amount_brl_in ? 'BRL' : null,
    destination_amount: destinationAmount,
    destination_asset: row.amount_usdc_settled ? 'USDC' : row.amount_usd_out_expected ? 'USD' : null,
    transaction_hash: nullableText(stellar.tx_hash),
    external_reference: nullableText(pix.e2e_id || pix.txid || pix.charge_id || payout.reference_id),
    fee_amount: fee.amount,
    fee_asset: fee.asset,
    fee_label: fee.label,
    user_id: null,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at || row.created_at),
  };
}

function mapInternationalTransfer(row: Record<string, unknown>): OpsHistoryRecord {
  const id = text(row.id);
  const status = text(row.status) || 'QUOTE_CREATED';
  const payoutProvider = text(row.payout_provider) || 'USD payout';
  const fee = feeFromFields(row, object(row.economics || row.evidence || row.metadata));

  return {
    id: `international_transfers:${id}`,
    source: 'international_transfers',
    source_record_id: id,
    lifecycle_transfer_id: null,
    reference: id,
    kind: 'International transfer',
    status,
    category: internationalTransferCategory(status),
    route: `PIX / BRL -> Stellar / USDC -> ${payoutProvider}`,
    source_amount: nullableText(row.brl_amount),
    source_asset: row.brl_amount ? 'BRL' : null,
    destination_amount: nullableText(row.quoted_usd_amount),
    destination_asset: row.quoted_usd_amount ? 'USD' : null,
    transaction_hash: nullableText(row.stellar_tx_hash),
    external_reference: nullableText(
      row.provider_payout_id ||
      row.payout_instruction_id ||
      row.pix_payment_id ||
      row.pix_order_id,
    ),
    fee_amount: fee.amount,
    fee_asset: fee.asset,
    fee_label: fee.label,
    user_id: nullableText(row.user_id),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at || row.created_at),
  };
}

function mapOperation(row: Record<string, unknown>): OpsHistoryRecord {
  const id = text(row.id);
  const status = text(row.status) || 'PENDING';
  const context = object(row.context);
  const sourceAmount = nullableText(row.amount_brl || row.amount);
  const sourceAsset = row.amount_brl ? 'BRL' : nullableText(row.asset_code);
  const fee = feeFromFields(row, context);

  return {
    id: `operations:${id}`,
    source: 'operations',
    source_record_id: id,
    lifecycle_transfer_id: null,
    reference: id,
    kind: text(row.type) || 'Operation',
    status,
    category: categoryForStatus(status),
    route: text(row.type) || 'Internal operation',
    source_amount: sourceAmount,
    source_asset: sourceAsset,
    destination_amount: nullableText(row.amount_usdc || context.final_amount || context.destination_amount),
    destination_asset: row.amount_usdc
      ? 'USDC'
      : nullableText(context.final_asset_code || context.destination_asset_code),
    transaction_hash: nullableText(row.transaction_hash || row.stellar_transaction_hash),
    external_reference: nullableText(
      context.anchor_order_id ||
      context.order_id ||
      context.intent_id ||
      row.operation_fingerprint,
    ),
    fee_amount: fee.amount,
    fee_asset: fee.asset,
    fee_label: fee.label,
    user_id: nullableText(row.user_id),
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at || row.created_at),
  };
}

function mapPaymentLog(row: Record<string, unknown>): OpsHistoryRecord {
  const id = text(row.id);
  const status = text(row.status) || 'pending';
  const sourceAsset = nullableText(row.source_asset_code);
  const destinationAsset = nullableText(row.destination_asset_code);
  const metadata = object(row.metadata || row.context);
  const fee = feeFromFields(row, metadata);

  return {
    id: `payment_logs:${id}`,
    source: 'payment_logs',
    source_record_id: id,
    lifecycle_transfer_id: null,
    reference: text(row.payment_hash) || `payment-log-${id}`,
    kind: text(row.operation_type) || 'Payment',
    status,
    category: categoryForStatus(status),
    route: `${sourceAsset || 'source'} -> ${destinationAsset || 'destination'}`,
    source_amount: nullableText(row.source_amount),
    source_asset: sourceAsset,
    destination_amount: nullableText(row.destination_amount),
    destination_asset: destinationAsset,
    transaction_hash: nullableText(row.payment_hash),
    external_reference: nullableText(row.operation_fingerprint),
    fee_amount: fee.amount,
    fee_asset: fee.asset,
    fee_label: fee.label,
    user_id: nullableText(row.user_id),
    created_at: timestamp(row.completed_at || row.created_at),
    updated_at: timestamp(row.completed_at || row.created_at),
  };
}

export function mapOpsHistoryRow(source: OpsHistorySource, row: Record<string, unknown>): OpsHistoryRecord {
  if (source === 'transfers') return mapTransfer(row);
  if (source === 'international_transfers') return mapInternationalTransfer(row);
  if (source === 'operations') return mapOperation(row);
  return mapPaymentLog(row);
}

async function loadAllRows(source: OpsHistorySource): Promise<{
  rows: Array<Record<string, unknown>>;
  error?: string;
}> {
  const rows: Array<Record<string, unknown>> = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(source)
      .select('*')
      .order('created_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1);

    if (error) {
      logger.warn(`[ops-history] Could not load ${source}: ${error.message}`);
      return { rows, error: error.message };
    }

    const page = (data || []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { rows };
}

export class OpsHistoryRepository {
  async list(input: {
    source?: string;
    status?: string;
    category?: string;
  } = {}): Promise<OpsHistoryResult> {
    const selectedSources = OPS_HISTORY_SOURCES.filter((source) => !input.source || source === input.source);
    const loaded = await Promise.all(selectedSources.map(async (source) => ({
      source,
      ...(await loadAllRows(source)),
    })));

    const sourceCounts = Object.fromEntries(
      OPS_HISTORY_SOURCES.map((source) => [source, 0]),
    ) as Record<OpsHistorySource, number>;
    const sourceErrors: Partial<Record<OpsHistorySource, string>> = {};
    const statusFilter = text(input.status).toUpperCase();
    const categoryFilter = text(input.category).toLowerCase();

    const records = loaded.flatMap(({ source, rows, error }) => {
      sourceCounts[source] = rows.length;
      if (error) sourceErrors[source] = error;
      return rows.map((row) => mapOpsHistoryRow(source, row));
    }).filter((record) => {
      if (statusFilter && record.status.toUpperCase() !== statusFilter) return false;
      if (categoryFilter && record.category !== categoryFilter) return false;
      return true;
    }).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

    return {
      records,
      source_counts: sourceCounts,
      source_errors: sourceErrors,
    };
  }
}

export const opsHistoryRepository = new OpsHistoryRepository();
