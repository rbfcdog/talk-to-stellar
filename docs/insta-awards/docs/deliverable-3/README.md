# Deliverable 3 - Institutional Settlement Flow Demonstration

Status on 2026-06-13: foundation started; final demo video, screenshots, and evidence exports are still pending.

## Reviewer Goal

Reviewers should be able to understand the full institutional settlement route:

```text
PIX funding -> BRL/USD quote -> Stellar USDC settlement -> USD payout coordination -> reconciliation evidence
```

This folder is the reviewer-facing documentation package for the flow demonstration and technical walkthrough. It intentionally uses the current code surfaces instead of a separate one-off demo process.

## Artifact Map

| Artifact | Foundation file | Final evidence target |
|----------|-----------------|-----------------------|
| Demo video | `VIDEO-STORYBOARD.md` | `evidence/video/` |
| Screenshots | `SCREENSHOT-SHOTLIST.md` | `evidence/screenshots/` |
| Architecture diagrams | `ARCHITECTURE-DIAGRAMS.md` | Included in docs and final reviewer package |
| Technical walkthrough | `TECHNICAL-WALKTHROUGH.md` | Included in final reviewer package |
| Setup documentation | `SETUP.md` | Included in final reviewer package |
| Demo runbook | `DEMO-RUNBOOK.md` | Run log under `runs/` after execution |
| Evidence checklist | `EVIDENCE-CHECKLIST.md` | Final capture status table |
| Reviewer package | `REVIEWER-PACKAGE.md` | Final review index |

## Current Implementation Surfaces

| Surface | Current code path |
|---------|-------------------|
| Quote API | `backend/src/api/routes/quotes.router.ts`, `backend/src/api/controllers/quotes.controller.ts` |
| Transfer API | `backend/src/api/routes/international-transfers.router.ts`, `backend/src/api/controllers/international-transfers.controller.ts` |
| Transfer lifecycle service | `backend/src/api/services/international-transfer.service.ts` |
| Normalized lifecycle engine | `backend/src/orchestration/TransferOrchestrator.ts`, `backend/src/orchestration/stateMachine.ts` |
| PIX funding | `backend/src/api/services/pix-funding.service.ts`, `backend/src/api/services/anchor.service.ts` |
| Stellar settlement | `backend/src/api/services/stellar-settlement.service.ts`, `backend/src/api/services/stellar.service.ts` |
| USD payout adapter | `backend/src/api/services/usd-payout-adapters.ts`, `backend/src/api/services/usd-payout-coordination.service.ts` |
| Reconciliation/evidence builder | `backend/src/api/services/settlement-evidence.service.ts` |
| Ops dashboard | `backend/src/api/controllers/ops.controller.ts`, `backend/src/api/routes/ops.router.ts` |
| Demo frontend | `frontend/app/institution-settlement/page.tsx`, `frontend/app/international-transfer/` |
| Frontend admin evidence surface | `frontend/app/admin/transactions/` |

## Evidence Boundary

The current foundation can explain and prepare the reviewer package. It is not final evidence until one run produces:

1. One completed transfer ID and public reference.
2. A Stellar testnet transaction hash or an explicitly labeled mock/sandbox settlement.
3. A payout instruction or explicitly labeled compatibility payout record.
4. Reconciliation JSON for the same transfer.
5. Screenshots from the same transfer.
6. A recorded video using the same transfer and artifacts.

Do not mark this deliverable complete until `STATUS.md` is updated with concrete artifact paths and the run report under `runs/` records commands and results.

## Related Docs

- D1 lifecycle package: `docs/insta-awards/docs/deliverable-1/README.md`
- D2 payout package: `docs/insta-awards/docs/deliverable-2/README.md`
- Circle setup: `backend/docs/CIRCLE_INTEGRATION_SETUP.md`
- Circle adapter foundation: `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`
- Money flows: `docs/project-brain/architecture/MONEY-FLOWS.md`
- Environment setup: `docs/project-brain/operations/ENVIRONMENTS.md`
