# Run 2026-06-14-1155 - Database Evidence Export

## Scope

Refreshed the two reviewer-requested JSON artifacts from the database-backed lifecycle path:

- "Logs de Orquestracao"
- "Exemplo de Transfer Record"

The normalized `transfers` table was empty at the start of this run, while `international_transfers` contained legacy BRL/USD transfer rows. I used the existing idempotent `TransferOrchestrator.syncFromInternationalTransfer()` bridge to mirror one real database row into `transfers` and `transfer_events`, then ran the repository export scripts.

## Database Source

- Legacy source row: `international_transfers.id = tr_brl_usd_4413c4bb-475f-4cfa-a7e8-50c18e7605ec`
- Normalized transfer: `transfers.id = 972fda9f-fdec-47bd-a21c-a9326999e948`
- Public reference: `TTS-2026-000001`
- Final state in this run: `PAYOUT_INSTRUCTED`
- Event count: 8 lifecycle events
- Correlation ID: `instawards-evidence-export-2026-06-14`

Important limitation: this is database-backed evidence, but the source row is mock/testnet evidence from the existing legacy table. It proves the lifecycle orchestration architecture through payout instruction, not a completed real-money payout. Final submission still needs one same-transfer real Stellar testnet run through `PAYOUT_COMPLETED`/`RECONCILED`.

## Files Changed

| File | Change |
|---|---|
| `docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-2026-000001.json` | Regenerated orchestration log export from normalized `transfers` + `transfer_events`. |
| `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-2026-000001.json` | Regenerated transfer record export from normalized `transfers` + `transfer_events`. |
| `docs/insta-awards/deliverables/deliverable-1/STATUS.md` | Noted the interim database-backed evidence refresh and remaining final evidence gaps. |
| `docs/insta-awards/deliverables/deliverable-1/evidence/DOCS-SUMMARY.md` | Added current artifact provenance note. |
| `docs/project-brain/funding/GRANTS.md` | Added the 2026-06-14 interim evidence export status. |
| `docs/insta-awards/deliverables/deliverable-1/runs/2026-06-14-1155-evidence-export.md` | This run report. |

## Commands Run

```bash
cd backend
npx ts-node -e "import { supabase } from './src/config/supabase'; import { orchestrator } from './src/orchestration/TransferOrchestrator'; (async () => { const legacyId = 'tr_brl_usd_4413c4bb-475f-4cfa-a7e8-50c18e7605ec'; const { data, error } = await supabase.from('international_transfers').select('*').eq('id', legacyId).single(); if (error) throw error; const transfer = await orchestrator.syncFromInternationalTransfer({ transfer_id: data.id, ...data }, 'system', 'instawards-evidence-export-2026-06-14'); console.log(JSON.stringify({ id: transfer?.id, public_ref: transfer?.public_ref, state: transfer?.state, legacy_transfer_id: transfer?.legacy_transfer_id, created_at: transfer?.created_at, updated_at: transfer?.updated_at }, null, 2)); })().catch((error) => { console.error(error); process.exit(1); });"
```

Result:

```json
{
  "id": "972fda9f-fdec-47bd-a21c-a9326999e948",
  "public_ref": "TTS-2026-000001",
  "state": "PAYOUT_INSTRUCTED",
  "legacy_transfer_id": "tr_brl_usd_4413c4bb-475f-4cfa-a7e8-50c18e7605ec"
}
```

```bash
cd backend
npx ts-node scripts/export-transfer-log.ts 972fda9f-fdec-47bd-a21c-a9326999e948
npx ts-node scripts/export-transfer-record.ts 972fda9f-fdec-47bd-a21c-a9326999e948
```

Result:

```text
docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-2026-000001.json
docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-2026-000001.json
```

## Evidence Contents

The exported lifecycle contains these ordered transitions:

1. `transfer_created`: `null -> CREATED`
2. `quote_attached`: `CREATED -> QUOTED`
3. `pix_charge_issued`: `QUOTED -> PIX_CHARGE_ISSUED`
4. `pix_funding_confirmed`: `PIX_CHARGE_ISSUED -> PIX_FUNDED`
5. `conversion_started`: `PIX_FUNDED -> CONVERTING`
6. `stellar_settled`: `CONVERTING -> STELLAR_SETTLED`
7. `payout_routing_started`: `STELLAR_SETTLED -> PAYOUT_ROUTING`
8. `payout_instructed`: `PAYOUT_ROUTING -> PAYOUT_INSTRUCTED`

The transfer record includes masked source/destination endpoints, quote, PIX evidence, Stellar settlement metadata, payout instruction metadata, and reconciliation metadata with no discrepancies.

## Open Items

- Capture final `/ops` list/detail screenshots for this `public_ref` or a later completed same-transfer run.
- Execute one real Stellar testnet end-to-end transfer and export all evidence from that same transfer.
- Complete payout provider execution to `PAYOUT_COMPLETED`/`RECONCILED` before marking Deliverable 1 final-submission ready.
