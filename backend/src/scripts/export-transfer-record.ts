/**
 * Export the complete normalized Transfer Record for reviewer evidence.
 * Usage: npx ts-node src/scripts/export-transfer-record.ts <transfer_id_or_public_ref>
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const transferId = process.argv[2];
  if (!transferId) {
    console.error('Usage: npx ts-node src/scripts/export-transfer-record.ts <transfer_id_or_public_ref>');
    process.exit(1);
  }

  const { orchestrator } = await import('../orchestration/TransferOrchestrator');
  const { transfer, events } = await orchestrator.getTransferWithEvents(transferId);

  const record = {
    exported_at: new Date().toISOString(),
    transfer,
    events,
    redaction: {
      applied: true,
      notes: [
        'Endpoint identifiers are masked in source_endpoint and destination_endpoint.',
        'PIX payer details are stored only as payer_masked.',
        'Stellar source account is stored as source_account_masked.',
      ],
    },
  };

  const outDir = resolve(__dirname, '../../../docs/insta-awards/deliverable-1/evidence');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `transfer-record-${transfer.public_ref}.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2));
  console.log(`Exported transfer record to ${outPath}`);
}

main().catch((error) => {
  console.error('Export failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
