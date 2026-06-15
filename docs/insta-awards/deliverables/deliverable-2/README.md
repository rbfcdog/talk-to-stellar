# Deliverable 2 — USD Delivery & Payout Coordination Layer

Status on 2026-06-15: foundation in progress. Circle sandbox linked-bank setup exists, active evidence docs are initialized, and final same-transfer payout evidence is still pending.

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
| Adapter Interface Code | Ready for code review | `backend/src/api/services/usd-payout-adapters.ts`, `backend/tests/payout-adapter-contract.test.ts`, `SUBMISSION-CHECKLIST.md` |
| Hash Transação Stellar | Pending | Needs an end-to-end transfer with confirmed Stellar settlement hash; capture using `SUBMISSION-CHECKLIST.md` |
| Integração Circle/Bridge | Circle linked-bank foundation ready; sandbox payout execution pending | `evidence/circle-bridge-integration.md`, `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`, `backend/docs/CIRCLE_INTEGRATION_SETUP.md`, `GET /api/transfers/payout-providers` |
| Payout Instructions | Foundation ready; pending settled-transfer execution | `evidence/payout-instructions.md`, `POST /api/transfers/:id/payout-instruction`, `GET /api/transfers/:id/payout-evidence` |

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

## Verification

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
npm --prefix backend run build
```

## Evidence Assembly

Use `SUBMISSION-CHECKLIST.md` to build the final reviewer package. It lists the exact files, commands, SQL queries, API responses, dashboard screenshot, and claim boundaries needed for each requested artifact.

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
