import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { supabase } from '../config/supabase';

const STELLAR_TX_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const DISALLOWED_EVIDENCE_MARKERS = [
  /mock/i,
  /fake/i,
  /dummy/i,
  /placeholder/i,
  /no_real_money/i,
  /simulated/i,
  /teste/i,
  /ana silva/i,
  /pagamento/i,
  /convers/i,
];

function maskEmail(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const [name, domain] = raw.split('@');
  if (!domain) return `***${raw.slice(-4)}`;
  const tld = domain.includes('.') ? domain.slice(domain.lastIndexOf('.')) : '';
  return `${name.slice(0, 2)}***@***${tld}`;
}

function tail(value: unknown, length = 8): string | null {
  const raw = String(value || '').trim();
  return raw ? `***${raw.slice(-length)}` : null;
}

async function fetchHorizonTransaction(hash: string): Promise<Record<string, unknown>> {
  const horizonUrl = String(process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org').replace(/\/$/, '');
  const response = await fetch(`${horizonUrl}/transactions/${encodeURIComponent(hash)}`);
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Horizon did not return transaction ${hash}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

function assertPositiveDecimal(value: unknown, label: string): void {
  if (!(Number(String(value || '0')) > 0)) {
    throw new Error(`${label} must be positive.`);
  }
}

function assertCleanEvidencePayload(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const marker = DISALLOWED_EVIDENCE_MARKERS.find((pattern) => pattern.test(serialized));
  if (marker) {
    throw new Error(`Refusing to write evidence with disallowed marker: ${marker}`);
  }
}

async function main(): Promise<void> {
  const paymentLogId = Number(process.argv[2] || 2);
  if (!Number.isInteger(paymentLogId) || paymentLogId <= 0) {
    throw new Error('Usage: npx ts-node src/scripts/export-real-stellar-payment-evidence.ts <payment_log_id>');
  }

  const { data: paymentLog, error } = await supabase
    .from('payment_logs')
    .select('*')
    .eq('id', paymentLogId)
    .single();
  if (error) throw error;
  if (!paymentLog) throw new Error(`payment_logs.id=${paymentLogId} not found.`);
  if (paymentLog.status !== 'success') {
    throw new Error(`payment_logs.id=${paymentLogId} is not successful.`);
  }

  const hash = String(paymentLog.payment_hash || '').trim();
  if (!STELLAR_TX_HASH_PATTERN.test(hash)) {
    throw new Error(`payment_logs.id=${paymentLogId} does not have a valid Stellar hash.`);
  }
  assertPositiveDecimal(paymentLog.source_amount, 'source_amount');
  assertPositiveDecimal(paymentLog.destination_amount, 'destination_amount');

  const horizon = await fetchHorizonTransaction(hash);
  if (horizon.successful !== true || Number(horizon.ledger || 0) <= 0) {
    throw new Error(`Horizon transaction ${hash} is not successful with a positive ledger.`);
  }

  const { data: operationRows, error: operationsError } = await supabase
    .from('operations')
    .select('id,type,status,amount,asset_code,context,stellar_transaction_hash,transaction_hash,created_at,updated_at')
    .or(`stellar_transaction_hash.eq.${hash},transaction_hash.eq.${hash}`);
  if (operationsError) throw operationsError;
  if (!operationRows?.length) {
    throw new Error(`No operations rows found for Stellar hash ${hash}.`);
  }

  const reference = `TTS-2026-STELLAR-${String(paymentLogId).padStart(6, '0')}`;
  const exportedAt = new Date().toISOString();
  const common = {
    exported_at: exportedAt,
    reference,
    evidence_scope: 'stellar_testnet_payment',
    source_note: `Database export from payment_logs.id=${paymentLog.id} with matching operations row and Horizon testnet confirmation.`,
    source_tables: {
      payment_logs_id: paymentLog.id,
      operation_ids: (operationRows || []).map((row: any) => row.id),
    },
  };

  const redactedPayment = {
    id: paymentLog.id,
    user_id_masked: maskEmail(paymentLog.user_id),
    session_id_masked: tail(paymentLog.session_id),
    source_public_key: paymentLog.source_public_key,
    destination_public_key: paymentLog.destination_public_key,
    source_amount: paymentLog.source_amount,
    source_asset_code: paymentLog.source_asset_code,
    source_asset_issuer: paymentLog.source_asset_issuer,
    destination_amount: paymentLog.destination_amount,
    destination_asset_code: paymentLog.destination_asset_code,
    destination_asset_issuer: paymentLog.destination_asset_issuer,
    fee_xlm: paymentLog.fee_xlm,
    payment_hash: hash,
    operation_type: paymentLog.operation_type,
    status: paymentLog.status,
    route_path: paymentLog.route_path,
    created_at: paymentLog.created_at,
    completed_at: paymentLog.completed_at,
  };

  const redactedOperations = (operationRows || []).map((row: any) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    amount: row.amount,
    asset_code: row.asset_code,
    context_redacted: Boolean(row.context),
    stellar_transaction_hash: row.stellar_transaction_hash,
    transaction_hash: row.transaction_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const horizonEvidence = {
    hash: horizon.hash,
    ledger: horizon.ledger,
    successful: horizon.successful,
    created_at: horizon.created_at,
    source_account: horizon.source_account,
    operation_count: horizon.operation_count,
    fee_charged: horizon.fee_charged,
    memo_type: horizon.memo_type,
    paging_token: horizon.paging_token,
    links: {
      self: (horizon._links as any)?.self?.href,
      operations: (horizon._links as any)?.operations?.href,
      effects: (horizon._links as any)?.effects?.href,
      explorer: `https://stellar.expert/explorer/testnet/tx/${hash}`,
    },
  };

  const orchestrationLogEvidence = {
    ...common,
    records: [
      {
        event_type: 'payment_log_success',
        source: 'payment_logs',
        actor: 'api',
        created_at: paymentLog.completed_at || paymentLog.created_at,
        payload: redactedPayment,
      },
      ...redactedOperations.map((operation: any) => ({
        event_type: 'operation_completed',
        source: 'operations',
        actor: 'system',
        created_at: operation.updated_at || operation.created_at,
        payload: operation,
      })),
      {
        event_type: 'horizon_transaction_confirmed',
        source: 'stellar_horizon_testnet',
        actor: 'horizon',
        created_at: horizon.created_at,
        payload: horizonEvidence,
      },
    ],
    summary: {
      total_records: 2 + redactedOperations.length,
      stellar_hash: hash,
      stellar_ledger: horizon.ledger,
      successful: horizon.successful,
    },
  };

  const transferRecordEvidence = {
    ...common,
    transfer_record_type: 'stellar_payment_log',
    payment_log: redactedPayment,
    operations: redactedOperations,
    stellar: horizonEvidence,
    redaction: {
      applied: true,
      notes: [
        'User and session identifiers are masked.',
        'No raw secrets or private keys are included.',
        'Public Stellar account IDs and transaction hashes remain visible because they are public-chain evidence.',
      ],
    },
  };

  const outDir = resolve(__dirname, '../../../docs/insta-awards/deliverables/deliverable-1/evidence');
  mkdirSync(outDir, { recursive: true });
  const logsPath = resolve(outDir, `orchestration-logs-${reference}.json`);
  const recordPath = resolve(outDir, `transfer-record-${reference}.json`);

  assertCleanEvidencePayload(orchestrationLogEvidence);
  assertCleanEvidencePayload(transferRecordEvidence);

  writeFileSync(logsPath, JSON.stringify(orchestrationLogEvidence, null, 2));
  writeFileSync(recordPath, JSON.stringify(transferRecordEvidence, null, 2));
  console.log(logsPath);
  console.log(recordPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
