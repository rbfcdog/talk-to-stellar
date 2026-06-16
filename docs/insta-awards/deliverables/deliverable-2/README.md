# Deliverable 2 — USD Delivery & Payout Coordination Layer

Status on 2026-06-16: all four D2 reviewer labels have active evidence files. Adapter code, Circle/Bridge compatibility, payout instruction routes, readiness checks, and documentation are assembled. Circle sandbox auth, balance access, linked wire destination lookup, Circle sandbox payout instruction creation, and protected status refresh to `completed` have been executed through the TTS application.

## Scope

Build a provider-agnostic payout adapter layer that turns completed Stellar USDC settlement events into USD payout instructions compatible with bank-account payout workflows.

Current USDC rail:

```text
PIX BRL funding -> Stellar USDC settlement -> Circle USD bank payout instruction
```

Current provider focus:

- Circle: active foundation in `backend/src/api/services/usd-payout-adapters.ts`
- Bridge: compatibility-only until provider access responds
- Etherfuse: PIX proof mode, not USD bank payout proof
- Mock: ops-only evidence mode

## Week 2 Evidence Checklist

| Evidence | Status | Current artifact |
|----------|--------|------------------|
| Adapter Interface Code | Ready for code review | `evidence/adapter-interface-code.md`, `backend/src/api/services/usd-payout-adapters.ts`, `backend/tests/payout-adapter-contract.test.ts` |
| Hash Transacao Stellar | Ready; D2 transfer uses a 64-character Stellar testnet hash | `evidence/stellar-transaction-hash.md`, `evidence/current-db-state.md` |
| Integracao Circle/Bridge | Circle sandbox execution complete; Bridge compatibility boundary documented | `evidence/circle-bridge-integration.md`, `evidence/circle-readiness-redacted.json`, `evidence/circle-sandbox-payout-redacted.json`, `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`, `backend/docs/CIRCLE_INTEGRATION_SETUP.md` |
| Payout Instructions | Ready; Circle sandbox payout instruction persisted | `evidence/payout-instructions.md`, `evidence/circle-sandbox-payout-redacted.json`, `GET /api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence` |

## Package Entry Points

- `STATUS.md` — reviewer status for all D2 deliverables.
- `SUBMIT-THIS.md` — exact code/evidence files and short text for the four Instawards fields.
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

Keep `ENABLE_REAL_PAYOUT_EXECUTION=false` for compatibility evidence. Set it to `true` only when Circle sandbox credentials, Circle balance, and a linked bank account destination ID are available. The current backend env is configured for sandbox execution, but the raw destination ID and API key must stay in backend secret/env only.

## Circle Readiness

```bash
npm --prefix backend run circle:payout-readiness
```

The command prints a redacted readiness snapshot for the Circle sandbox payout path.

Current redacted snapshot: `evidence/circle-readiness-redacted.json`.

Current result in this shell:

- linked Circle wire destination: present
- linked destination status: complete
- API key available to backend process: yes
- `ENABLE_REAL_PAYOUT_EXECUTION`: true
- Circle sandbox API execution: ready
- compatibility evidence: ready
- non-mutating Circle API proof: balances HTTP 200, wires HTTP 200, linked destination found

This means the package can prove adapter compatibility, Circle sandbox readiness, Circle sandbox payout creation, and Circle sandbox payout status completion through the TTS application.

## Circle Sandbox Execution Proof

```text
transfer_id: tr_d2_circle_stellar_payment_2
payout_instruction_id: circle_instruction_e0be3785-0b35-4690-9eb6-5f99b66167ab
provider: circle
execution_mode: sandbox_api
payout_status: completed
provider_payout_reference_hash: d6a354577130d3e1
provider_payout_reference_tail: ef7481
```

HTTP proof:

```text
GET /api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence
success=true
ready=true
ready_count=4
required_count=4
execution_mode=sandbox_api
instruction_status=completed
```

## Verification

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
npm --prefix backend run build
```

## Evidence Assembly

Use `SUBMISSION-CHECKLIST.md` to build the final reviewer package. It lists the exact files, commands, SQL queries, API responses, dashboard screenshot, and claim boundaries needed for each requested artifact.

Current database inspection is in `evidence/current-db-state.md`. It shows:

- `international_transfers`: 3 rows
- `international_payout_instructions`: 1 row
- `international_payout_events`: 0 rows
- `international_transfer_reconciliations`: 3 rows
- usable D2 Circle transfer count: 1

The active D2 transfer is `tr_d2_circle_stellar_payment_2`. It uses a database-backed Stellar testnet payment from `payment_logs.id=2` and has a persisted Circle sandbox payout instruction row.

## Deliverable 1 Cross-Reference

Deliverable 1 evidence is in `docs/insta-awards/deliverables/deliverable-1/evidence/`.

Current JSON evidence files:

- `orchestration-logs-TTS-2026-STELLAR-000002.json`
- `transfer-record-TTS-2026-STELLAR-000002.json`

They were exported from live database `payment_logs.id = 2`, include matching `operations` rows, and verify transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094` on Horizon testnet ledger `2488252` with `successful = true`. They are not the final same-transfer D1 PIX-to-payout package.

## Remaining Evidence Work

1. Capture a signed Circle webhook if reviewer requires webhook proof in addition to protected status polling.
2. For the later D3 full demo, run the whole PIX intake -> Stellar -> Circle path as one live walkthrough and capture screenshots/video.
