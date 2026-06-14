# D3 Foundation Run - 2026-06-13

## Scope

Started the documentation foundation for the Institutional Settlement Flow Demonstration and Technical Walkthrough.

## Added

| File | Purpose |
|------|---------|
| `README.md` | D3 reviewer entry point and artifact map. |
| `STATUS.md` | Acceptance checklist, blockers, and completion rule. |
| `SETUP.md` | Environment, database, backend, frontend, Stellar, and Circle setup. |
| `ARCHITECTURE-DIAGRAMS.md` | Mermaid diagrams for sequence, services, states, evidence, and reviewer screens. |
| `TECHNICAL-WALKTHROUGH.md` | API and service walkthrough from quote to reconciliation. |
| `DEMO-RUNBOOK.md` | Execution steps for transfer, payout, evidence export, screenshots, and video. |
| `SCREENSHOT-SHOTLIST.md` | Required screenshot list and capture rules. |
| `VIDEO-STORYBOARD.md` | Demo chapter plan, narration script, and recording checklist. |
| `EVIDENCE-CHECKLIST.md` | Readiness gates for final review. |
| `REVIEWER-PACKAGE.md` | Final package index. |
| `CLAIMS-BOUNDARY.md` | Allowed/conditional claims and redaction rules. |
| `evidence/README.md` | Evidence folder structure. |
| `evidence/screenshots/README.md` | Screenshot folder rules. |
| `evidence/video/README.md` | Video metadata placeholder. |

## Code References Verified

- Quote route: `backend/src/api/routes/quotes.router.ts`
- Transfer routes: `backend/src/api/routes/international-transfers.router.ts`
- Transfer controller evidence methods: `backend/src/api/controllers/international-transfers.controller.ts`
- Transfer lifecycle service: `backend/src/api/services/international-transfer.service.ts`
- Stellar settlement service: `backend/src/api/services/stellar-settlement.service.ts`
- Payout adapters: `backend/src/api/services/usd-payout-adapters.ts`
- Normalized state machine: `backend/src/orchestration/stateMachine.ts`
- Demo page: `frontend/app/institution-settlement/page.tsx`
- Settlement console: `frontend/app/international-transfer/`

## Not Captured Yet

- Demo video.
- Screenshots.
- JSON evidence exports for a final transfer.
- Real Stellar testnet hash.
- Circle sandbox payout response.

## Next Run

Execute `DEMO-RUNBOOK.md` after the target environment is configured. The next run should fill transfer IDs, capture screenshots/video, export JSON evidence, and update `STATUS.md`.
