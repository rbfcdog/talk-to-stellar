# Run 2026-06-15 - Circle Linked Bank Foundation

## Summary

Started the Deliverable 2 Circle foundation using the operator-created Circle sandbox wire bank destination. The raw API key and raw bank details were not committed.

The linked bank response showed Circle sandbox returned a wire bank account with status `pending` and bank description `WELLS FARGO BANK, NA ****0010`. The returned bank `id` must be stored as `CIRCLE_PAYOUT_DESTINATION_ID` in backend secret storage before sandbox payout execution.

## Files Changed

| File | Purpose |
|---|---|
| `backend/src/api/controllers/international-transfers.controller.ts` | Allows protected payout-instruction requests to pass Circle destination/source/idempotency options. |
| `backend/scripts/circle-payout-readiness.ts` | Prints redacted Circle sandbox readiness from backend env. |
| `backend/package.json` | Adds `circle:payout-readiness`. |
| `backend/tests/payout-adapter-contract.test.ts` | Proves Circle execution can use a per-request linked destination ID. |
| `backend/tests/international-transfer.routes.test.ts` | Proves protected route forwards Circle provider options. |
| `docs/insta-awards/deliverables/deliverable-2/evidence/` | Adds active D2 foundation evidence files. |

## Operator Env

Use these backend env values; do not commit the raw key:

```bash
PAYOUT_PROVIDER=circle
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_KEY=<sandbox key in backend secret storage>
CIRCLE_PAYOUT_DESTINATION_ID=<linked Circle wire bank id>
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
ENABLE_REAL_PAYOUT_EXECUTION=false
```

Switch `ENABLE_REAL_PAYOUT_EXECUTION=true` only for the settled-transfer sandbox execution run.

## Commands

```bash
npm --prefix backend run circle:payout-readiness
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts tests/international-transfer.routes.test.ts
npm --prefix backend run build
git diff --check
```

Readiness result in this shell:

- linked Circle destination present: yes
- linked destination tail: `cd88`
- linked destination hash prefix: `9c20e383eab6`
- Circle API key visible to this process: no
- `ENABLE_REAL_PAYOUT_EXECUTION`: false
- Circle sandbox API execution ready: no
- compatibility evidence ready: yes

The missing key result means the key pasted in the operator terminal is not available to this non-interactive backend process. Put the rotated sandbox key in backend secret storage or `backend/.env`, not in Git.

Verification result:

- `tests/payout-adapter-contract.test.ts` and `tests/international-transfer.routes.test.ts`: 2 suites, 14 tests passed.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed.
- Raw secret scan found no committed Circle API key, full linked destination ID, account number, routing number, tracking reference, or fingerprint.

## Database Migration

No new D2 migration was added. This foundation uses the existing `backend/migrations/20260613_00_full_schema.sql` tables: `international_transfers`, `international_payout_instructions`, `international_payout_events`, and `international_transfer_reconciliations`.

## D1 Evidence Reference

Deliverable 1 evidence lives at `docs/insta-awards/deliverables/deliverable-1/evidence/`.

The current JSON files are:

- `orchestration-logs-TTS-2026-STELLAR-000002.json`
- `transfer-record-TTS-2026-STELLAR-000002.json`

They were exported from live database `payment_logs.id = 2`, match database operation row `259de57a-ca16-409b-bf73-79c5641cbf16`, and include Horizon-confirmed transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`, ledger `2488252`, `successful = true`.

## Left Open

Final D2 evidence still needs one same-transfer run:

1. Real Stellar testnet settlement attached to `international_transfers.stellar_tx_hash`.
2. Circle payout instruction created for that transfer.
3. Circle provider payout ID persisted in `international_payout_instructions`.
4. Payout status refreshed or webhook event stored.
5. `/api/transfers/:id/payout-evidence` and `/api/transfers/:id/reconciliation` exported.
