# Deliverable 2 — USD Delivery & Payout Coordination Layer

Status on 2026-06-15: all four D2 reviewer labels have active evidence files. Adapter code, Circle/Bridge compatibility, payout instruction routes, readiness checks, and documentation are assembled. Final real same-transfer payout evidence is still pending because the current database has no usable real D2 transfer and this backend shell does not have Circle sandbox execution enabled.

## Scope

Build a provider-agnostic payout adapter layer that turns completed Stellar USDC settlement events into USD payout instructions compatible with bank-account payout workflows.

Current provider focus:

- Circle: active foundation in `backend/src/api/services/usd-payout-adapters.ts`
- Bridge: compatibility-only until provider access responds
- Etherfuse: PIX proof mode, not USD bank payout proof
- Mock: ops-only evidence mode

## Week 2 Evidence Checklist

| Evidence | Status | Current artifact |
|----------|--------|------------------|
| Adapter Interface Code | Ready for code review | `evidence/adapter-interface-code.md`, `backend/src/api/services/usd-payout-adapters.ts`, `backend/tests/payout-adapter-contract.test.ts` |
| Hash Transacao Stellar | Evidence file ready; final same-transfer hash pending | `evidence/stellar-transaction-hash.md`, `evidence/current-db-state.md` |
| Integracao Circle/Bridge | Circle linked-bank foundation ready; sandbox payout execution pending | `evidence/circle-bridge-integration.md`, `evidence/circle-readiness-redacted.json`, `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`, `backend/docs/CIRCLE_INTEGRATION_SETUP.md` |
| Payout Instructions | Foundation ready; no final payout rows yet | `evidence/payout-instructions.md`, `POST /api/transfers/:id/payout-instruction`, `GET /api/transfers/:id/payout-evidence` |

## Package Entry Points

- `STATUS.md` — reviewer status for all D2 deliverables.
- `DELIVERABLE-LOCATIONS.md` — exact file map for D2 and D1 cross-reference evidence.
- `SUBMISSION-CHECKLIST.md` — final execution checklist for the real same-transfer run.
- `evidence/current-db-state.md` — sanitized database inspection proving why no final D2 evidence is being claimed yet.

## Implementation Map

- Adapter interface and providers: `backend/src/api/services/usd-payout-adapters.ts`
- Circle readiness script: `backend/scripts/circle-payout-readiness.ts`
- Evidence builder: `backend/src/api/services/usd-payout-coordination.service.ts`
- Lifecycle orchestration: `backend/src/api/services/international-transfer.service.ts`
- HTTP routes: `backend/src/api/routes/international-transfers.router.ts`
- Persistence: `backend/src/api/repository/international-transfer.repository.ts`
- Schema: `backend/migrations/20260613_00_full_schema.sql`
- Backend foundation guide: `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`
- Circle setup guide: `backend/docs/CIRCLE_INTEGRATION_SETUP.md`

## Database Migration

No new D2 migration was added in this foundation pass. D2 uses the existing schema from `backend/migrations/20260613_00_full_schema.sql`, specifically:

- `public.international_transfers`
- `public.international_payout_instructions`
- `public.international_payout_events`
- `public.international_transfer_reconciliations`

## Circle Environment

```bash
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=false
CIRCLE_API_KEY=
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_PAYOUT_DESTINATION_ID=
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
CIRCLE_PAYOUT_WEBHOOK_SECRET=
```

Keep `ENABLE_REAL_PAYOUT_EXECUTION=false` for compatibility evidence. Set it to `true` only when Circle sandbox credentials, Circle balance, and a linked bank account destination ID are available. The current linked bank destination should be stored in backend secret/env as `CIRCLE_PAYOUT_DESTINATION_ID`; do not commit the raw ID or API key.

## Circle Readiness

```bash
npm --prefix backend run circle:payout-readiness
```

The command prints a redacted readiness snapshot for the Circle sandbox payout path.

Current redacted snapshot: `evidence/circle-readiness-redacted.json`.

Current result in this shell:

- linked Circle wire destination: present
- API key available to backend process: no
- `ENABLE_REAL_PAYOUT_EXECUTION`: false
- Circle sandbox API execution: not ready
- compatibility evidence: ready

This means the package can prove adapter compatibility and linked-bank readiness, but it must not claim Circle sandbox payout execution until the backend has the rotated sandbox key, execution gate enabled, and a settled transfer to pay out.

## Verification

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
npm --prefix backend run build
```

## Evidence Assembly

Use `SUBMISSION-CHECKLIST.md` to build the final reviewer package. It lists the exact files, commands, SQL queries, API responses, dashboard screenshot, and claim boundaries needed for each requested artifact.

Current database inspection is in `evidence/current-db-state.md`. It shows:

- `international_transfers`: 2 rows
- `international_payout_instructions`: 0 rows
- `international_payout_events`: 0 rows
- `international_transfer_reconciliations`: 2 rows
- usable final D2 transfer count: 0

The two current `international_transfers` rows contain mock-prefixed Stellar and PIX identifiers and cannot be used as final D2 evidence.

## Deliverable 1 Cross-Reference

Deliverable 1 evidence is in `docs/insta-awards/deliverables/deliverable-1/evidence/`.

Current real JSON evidence files:

- `orchestration-logs-TTS-REAL-STELLAR-PAYMENT-2.json`
- `transfer-record-TTS-REAL-STELLAR-PAYMENT-2.json`

They are real historical Stellar testnet evidence because they were exported from live database `payment_logs.id = 2`, include matching `operations` rows, and verify transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094` on Horizon testnet ledger `2488252` with `successful = true`. They are not the final same-transfer D1 PIX-to-payout package.

## Remaining Evidence Work

1. Apply `backend/migrations/20260613_00_full_schema.sql` to the target Supabase database if not already applied.
2. Run one BRL→USDC transfer until `USDC_SETTLED`.
3. Create a Circle payout instruction in compatibility or sandbox mode using the linked Circle wire bank destination.
4. Refresh payout status or apply a signed Circle webhook event.
5. Export `/api/transfers/:id/payout-evidence` and reconciliation output for submission.
