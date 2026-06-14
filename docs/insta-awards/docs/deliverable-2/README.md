# Deliverable 2 — USD Delivery & Payout Coordination Layer

Status on 2026-06-13: foundation in progress; 0/4 reviewer evidences submitted.

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
| Adapter Interface Code | Ready for code review | `backend/src/api/services/usd-payout-adapters.ts`, `backend/tests/payout-adapter-contract.test.ts` |
| Hash Transação Stellar | Pending | Needs an end-to-end transfer with confirmed Stellar settlement hash |
| Integração Circle/Bridge | Circle foundation ready; sandbox evidence pending | `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`, `backend/docs/CIRCLE_INTEGRATION_SETUP.md`, `GET /api/transfers/payout-providers` |
| Payout Instructions | Pending live transfer evidence | `POST /api/transfers/:id/payout-instruction`, `GET /api/transfers/:id/payout-evidence` |

## Implementation Map

- Adapter interface and providers: `backend/src/api/services/usd-payout-adapters.ts`
- Evidence builder: `backend/src/api/services/usd-payout-coordination.service.ts`
- Lifecycle orchestration: `backend/src/api/services/international-transfer.service.ts`
- HTTP routes: `backend/src/api/routes/international-transfers.router.ts`
- Persistence: `backend/src/api/repository/international-transfer.repository.ts`
- Schema: `backend/migrations/20260613_00_full_schema.sql`
- Backend foundation guide: `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`
- Circle setup guide: `backend/docs/CIRCLE_INTEGRATION_SETUP.md`

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

Keep `ENABLE_REAL_PAYOUT_EXECUTION=false` for compatibility evidence. Set it to `true` only when Circle sandbox credentials and a linked bank account destination ID are available.

## Verification

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend run build
```

## Remaining Evidence Work

1. Apply `backend/migrations/20260613_00_full_schema.sql` to the target Supabase database if not already applied.
2. Run one BRL→USDC transfer until `USDC_SETTLED`.
3. Create a Circle payout instruction in compatibility or sandbox mode.
4. Refresh payout status or apply a signed Circle webhook event.
5. Export `/api/transfers/:id/payout-evidence` and reconciliation output for submission.
