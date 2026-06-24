# Deliverable Locations — D2 and D1 Evidence

Updated: 2026-06-15

## Deliverable 2 Active Package

Use this folder as the active D2 reviewer package:

```text
docs/insta-awards/deliverables/deliverable-2/
```

| Requested evidence label | Location |
|---|---|
| Adapter Interface Code | `docs/insta-awards/deliverables/deliverable-2/evidence/adapter-interface-code.md` |
| Hash Transacao Stellar | `docs/insta-awards/deliverables/deliverable-2/evidence/stellar-transaction-hash.md` |
| Integracao Circle/Bridge | `docs/insta-awards/deliverables/deliverable-2/evidence/circle-bridge-integration.md` and `docs/insta-awards/deliverables/deliverable-2/evidence/circle-readiness-redacted.json` |
| Payout Instructions | `docs/insta-awards/deliverables/deliverable-2/evidence/payout-instructions.md` |
| Current DB proof boundary | `docs/insta-awards/deliverables/deliverable-2/evidence/current-db-state.md` |
| Final execution checklist | `docs/insta-awards/deliverables/deliverable-2/SUBMISSION-CHECKLIST.md` |
| Run logs | `docs/insta-awards/deliverables/deliverable-2/runs/` |

## Backend Code References

| Area | Location |
|---|---|
| Adapter contract and providers | `backend/src/api/services/usd-payout-adapters.ts` |
| Payout evidence builder | `backend/src/api/services/usd-payout-coordination.service.ts` |
| Transfer payout orchestration | `backend/src/api/services/international-transfer.service.ts` |
| Payout routes | `backend/src/api/routes/international-transfers.router.ts` |
| Payout controller | `backend/src/api/controllers/international-transfers.controller.ts` |
| Repository/schema access | `backend/src/api/repository/international-transfer.repository.ts` |
| Schema source | `backend/migrations/20260613_00_full_schema.sql` |
| Circle setup guide | `backend/docs/CIRCLE_INTEGRATION_SETUP.md` |
| Circle foundation guide | `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md` |

## Deliverable 1 Verified Evidence Location

Deliverable 1 evidence is here:

```text
docs/insta-awards/deliverables/deliverable-1/evidence/
```

Current JSON files:

- `orchestration-logs-TTS-2026-STELLAR-000002.json`
- `transfer-record-TTS-2026-STELLAR-000002.json`

Why those D1 files are verified:

- They were exported from live database `payment_logs.id = 2`.
- They include the matching operations row `259de57a-ca16-409b-bf73-79c5641cbf16`.
- They include Stellar testnet transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`.
- Horizon testnet confirms ledger `2488252` and `successful = true`.
- Sensitive user/session/context values were redacted before commit.

Boundary: these D1 JSON files prove database-backed Stellar settlement evidence. They are not a substitute for the final D2 same-transfer Circle payout package.
