/**
 * Export orchestration logs + transfer events for a given transfer.
 * Usage: npx ts-node scripts/export-transfer-log.ts <transfer_id>
 * Output: docs/insta-awards/deliverable-1/evidence/orchestration-logs-<public_ref>.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { readLogFileEntriesForTransfer } from '../orchestration/orchestrationLogger';

async function main() {
  const transferId = process.argv[2];
  if (!transferId) {
    console.error('Usage: npx ts-node scripts/export-transfer-log.ts <transfer_id>');
    process.exit(1);
  }

  // Dynamic import to avoid circular dependencies
  const { orchestrator } = await import('../orchestration/TransferOrchestrator');
  const { transferRepository } = await import('../api/repository/transfer.repository');

  const { transfer, events } = await orchestrator.getTransferWithEvents(transferId);
  const orchestrationLogs = readLogFileEntriesForTransfer({
    transferId: transfer.id,
    publicRef: transfer.public_ref,
  });

  const log = {
    exported_at: new Date().toISOString(),
    transfer: {
      id: transfer.id,
      public_ref: transfer.public_ref,
      state: transfer.state,
      state_version: transfer.state_version,
      amount_brl_in: transfer.amount_brl_in,
      amount_usdc_settled: transfer.amount_usdc_settled,
      amount_usd_out_expected: transfer.amount_usd_out_expected,
      quote: transfer.quote,
      pix: transfer.pix,
      stellar: transfer.stellar,
      payout: transfer.payout,
      reconciliation: transfer.reconciliation,
      created_at: transfer.created_at,
      updated_at: transfer.updated_at,
    },
    log_file: process.env.LOG_FILE || null,
    orchestration_logs: orchestrationLogs,
    transfer_events: events.map((e: any) => ({
      id: e.id,
      transfer_id: e.transfer_id,
      from_state: e.from_state,
      to_state: e.to_state,
      event_type: e.event_type,
      payload: e.payload,
      actor: e.actor,
      correlation_id: e.correlation_id,
      created_at: e.created_at,
    })),
    summary: {
      total_events: events.length,
      total_log_lines: orchestrationLogs.length,
      lifecycle: events.map((e: any) => `${e.from_state || 'START'} → ${e.to_state} (${e.event_type})`),
      terminal: ['RECONCILED', 'REFUND_REQUIRED'].includes(transfer.state),
    },
  };

  const outDir = resolve(__dirname, '../../../docs/insta-awards/deliverable-1/evidence');
  mkdirSync(outDir, { recursive: true });

  const filename = `orchestration-logs-${transfer.public_ref}.json`;
  const outPath = resolve(outDir, filename);

  writeFileSync(outPath, JSON.stringify(log, null, 2));
  console.log(`✅ Exported to ${outPath}`);
  console.log(`   Transfer: ${transfer.public_ref} (${transfer.state})`);
  console.log(`   Events: ${events.length}`);
}

main().catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
