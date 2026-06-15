# Run 2026-06-15-1402 - Stellar Evidence Label Cleanup

## Summary

Renamed the active Stellar payment JSON evidence from the old self-referential label to a neutral transaction reference derived from `payment_logs.id = 2`.

## Files Changed

| File | Change |
|---|---|
| `docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-2026-STELLAR-000002.json` | Replaced top-level commentary fields with `reference`, `evidence_scope`, and DB/Horizon provenance. |
| `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-2026-STELLAR-000002.json` | Replaced top-level commentary fields with neutral transaction metadata and kept the DB/Horizon payload intact. |
| `backend/src/scripts/export-real-stellar-payment-evidence.ts` | Updated future exports to use the same neutral reference and metadata shape. |
| `docs/insta-awards/deliverables/deliverable-1/` | Updated D1 indexes/status references to the renamed JSON files. |
| `docs/insta-awards/deliverables/deliverable-2/` and `insta-awards/deliverable-2/` | Updated D2 cross-references to the renamed D1 files. |
| `docs/project-brain/funding/` | Updated grant status references to the renamed D1 evidence files. |

## Provenance Preserved

- Source database row: `payment_logs.id = 2`
- Matching operation row: `259de57a-ca16-409b-bf73-79c5641cbf16`
- Stellar testnet transaction: `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`
- Horizon ledger: `2488252`
- Horizon status: `successful = true`

## Verification

```bash
rg -n '<old self-referential evidence labels>' docs/insta-awards/deliverables/deliverable-1/evidence/*.json
# PASS: no matches in active JSON evidence

rg -n '<old evidence filenames and marker fields>' docs/insta-awards docs/project-brain insta-awards
# PASS: no matches in active references

jq empty docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-2026-STELLAR-000002.json docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-2026-STELLAR-000002.json
# PASS

npm --prefix backend run build
# PASS

npx ts-node -e '<read-only Supabase payment_logs/operations provenance query>'
# PASS: payment_logs.id=2 status=success, operation_count=1, operation_id=259de57a-ca16-409b-bf73-79c5641cbf16

curl -s https://horizon-testnet.stellar.org/transactions/e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094 | jq '{hash, ledger, successful, created_at, operation_count, source_account}'
# PASS: ledger=2488252, successful=true, operation_count=1
```
