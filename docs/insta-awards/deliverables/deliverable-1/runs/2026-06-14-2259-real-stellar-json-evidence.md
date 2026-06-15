# Run 2026-06-14-2259 - Real Stellar JSON Evidence

## Summary

Added two real JSON evidence files for the D1 evidence folder using an existing successful Stellar testnet payment from the live database, verified against Horizon testnet before writing:

- `docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-REAL-STELLAR-PAYMENT-2.json`
- `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-REAL-STELLAR-PAYMENT-2.json`

These files are real historical Stellar payment evidence from `payment_logs.id = 2`, transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`, ledger `2488252`. They are not the final D1 PIX-to-Stellar-to-payout evidence package.

## Files Changed

| File | Purpose |
|---|---|
| `backend/package.json` | Added `instawards:export-real-stellar-payment` script. |
| `backend/src/scripts/export-real-stellar-payment-evidence.ts` | Exports real payment-log evidence only after DB, Horizon, positive-amount, operation-row, and marker validation. |
| `docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-REAL-STELLAR-PAYMENT-2.json` | Real orchestration-log-style JSON for the verified Stellar payment. |
| `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-REAL-STELLAR-PAYMENT-2.json` | Real transfer-record-style JSON for the same verified Stellar payment. |
| `docs/insta-awards/deliverables/deliverable-1/STATUS.md` | Points D1 evidence readers to the real JSON files and keeps the final D1 blocker explicit. |
| `docs/insta-awards/deliverables/deliverable-1/DELIVERABLE-LOCATIONS.md` | Adds exact paths for the real JSON files. |
| `docs/insta-awards/deliverables/deliverable-1/evidence/DOCS-SUMMARY.md` | Adds the JSON evidence index. |

## Validation

Commands run:

```bash
npm run instawards:export-real-stellar-payment -- 2
npm --prefix backend run build
rg -n "mock|Mock|MOCK|fake|Fake|FAKE|dummy|Dummy|DUMMY|placeholder|Placeholder|no_real_money|simulated|Simulated|SIMULATED|teste|Teste|Ana Silva|Pagamento|Convers|context\"" docs/insta-awards/deliverables/deliverable-1/evidence -g '*.json'
```

Results:

- Export succeeded and wrote both JSON files.
- TypeScript build passed.
- Evidence JSON scan returned no matches for mocked/generated/test/demo markers or unredacted free-text operation context.
- The exporter fetched Horizon before writing and required `successful = true`, a positive ledger, positive payment amounts, at least one matching operations row, and no disallowed evidence markers.

## Libraries Added

None.

## Screenshots

None produced in this run. Dashboard screenshots still require a final same-transfer D1 lifecycle run.

## Left Open

Final D1 evidence still requires one real same-transfer PIX-to-Stellar-to-payout lifecycle run that reaches reconciliation. The guarded final exporters should then create `orchestration-logs-<public_ref>.json` and `transfer-record-<public_ref>.json` for that exact transfer.
