# D3 Foundation Run Report — 2026-06-14

## Scope

Architecture diagrams, screenshot/video instructions, and readiness assessment for Deliverable 3 (Final Review Package: Video, Screenshots, Architecture, Walkthrough).

## Architecture Diagrams Status

| Diagram | File | Status |
|---------|------|--------|
| End-to-End Flow (sequence) | `docs/insta-awards/deliverables/deliverable-3/ARCHITECTURE-DIAGRAMS.md` | Ready — mermaid sequence diagram covering Reviewer → Frontend → API → Quote → Pix → Stellar → Payout → Evidence |
| Service Map (flowchart) | `docs/insta-awards/deliverables/deliverable-3/ARCHITECTURE-DIAGRAMS.md` | Ready — service topology with all backend services |
| Evidence Model (class diagram) | `docs/insta-awards/deliverables/deliverable-3/ARCHITECTURE-DIAGRAMS.md` | Ready — Transfer, Event, Evidence, Reconciliation shapes |

## Code References for Diagrams

All diagram participants map to real code paths:

- `frontend/app/institution-settlement/page.tsx` — Reviewer-facing demo UI
- `frontend/app/international-transfer/use-settlement-console.ts` — Demo console hook
- `backend/src/api/routes/quotes.router.ts` — BRL/USD quote endpoint
- `backend/src/api/routes/international-transfers.router.ts` — Transfer lifecycle endpoints
- `backend/src/api/services/international-transfer.service.ts` — Core service (913 lines)
- `backend/src/api/services/brl-usd-quote.service.ts` — Quote engine
- `backend/src/api/services/stellar-settlement.service.ts` — Stellar settlement
- `backend/src/api/services/usd-payout-adapters.ts` — Payout adapter layer (943 lines)
- `backend/src/orchestration/TransferOrchestrator.ts` — Normalized lifecycle engine (625 lines)
- `backend/src/orchestration/stateMachine.ts` — Explicit transition map (67 lines)

## Screenshot Capture Instructions

Use `docs/insta-awards/deliverables/deliverable-3/SCREENSHOT-SHOTLIST.md` as the authoritative shot list. All screenshots must reference the same transfer.

### Prerequisites

```bash
# 1. Apply migrations
cd backend
npx ts-node scripts/run-required-migrations.ts

# 2. Start backend
LOG_FILE=/tmp/talktostellar-orchestration.jsonl OPS_DASHBOARD_TOKEN=<review-token> npm run dev

# 3. Start frontend (separate terminal)
cd frontend
BACKEND_URL=http://localhost:3001 npm run dev
```

### Capture Order

1. **`01-institution-settlement-overview.png`** — Open `http://localhost:3000/institution-settlement`, show the full demo flow with a selected transfer.
2. **`02-quote-and-transfer.png`** — Quote/transfer panel with BRL input, USD estimate, fee breakdown.
3. **`03-pix-funding.png`** — PIX funding step, funding state visible.
4. **`04-stellar-settlement.png`** — Stellar settlement step with `stellar_tx_hash` (if real testnet) or compatibility label.
5. **`05-payout-coordination.png`** — Payout tab showing provider, execution mode, payout instruction ID.
6. **`06-reviewer-evidence.png`** — Reviewer evidence/export area with checklist and export button.
7. **`07-ops-dashboard-list.png`** — `http://localhost:3000/ops?source=transfers` showing normalized transfer row.
8. **`08-ops-dashboard-detail.png`** — Transfer detail with lifecycle timeline, reconciliation, raw record.
9. **`09-admin-transactions.png`** — `http://localhost:3000/admin/transactions` for the same transfer.
10. **`10-json-evidence-folder.png`** — Terminal or file explorer showing exported JSON files.

All save to `insta-awards/deliverable-3/evidence/screenshots/`.

### Optional Screenshots

| File | When |
|------|------|
| `11-circle-provider-capabilities.png` | Circle compatibility/sandbox readiness is relevant |
| `12-stellar-explorer.png` | Real Stellar testnet hash exists |
| `13-circle-dashboard.png` | Circle sandbox payout was executed |

## Video Capture Instructions

Use `docs/insta-awards/deliverables/deliverable-3/VIDEO-STORYBOARD.md` for the narrative script. The video should demonstrate:

1. Starting the `/institution-settlement` demo.
2. Creating a BRL/USD quote.
3. Initiating a transfer with destination details.
4. Walking through PIX funding, Stellar settlement, and payout instruction.
5. Opening `/ops` to show the normalized lifecycle record.
6. Exporting evidence JSON.

Record with OBS or screen recording tool. Save to `insta-awards/deliverable-3/evidence/video/`.

## Technical Walkthrough Status

`docs/insta-awards/deliverables/deliverable-3/TECHNICAL-WALKTHROUGH.md` — Foundation ready. Maps each demo step to API routes, services, and code files.

## What's Ready vs What Needs a Real Transfer

### Ready (no transfer needed)

| Artifact | Status |
|----------|--------|
| Architecture diagrams (mermaid) | Ready in `ARCHITECTURE-DIAGRAMS.md` |
| Technical walkthrough | Ready in `TECHNICAL-WALKTHROUGH.md` |
| Setup documentation | Ready in `SETUP.md` |
| Reviewer package structure | Ready in `REVIEWER-PACKAGE.md` |
| Screenshot shot list | Ready in `SCREENSHOT-SHOTLIST.md` |
| Video storyboard | Ready in `VIDEO-STORYBOARD.md` |
| Evidence checklist | Ready in `EVIDENCE-CHECKLIST.md` |
| Claims boundary | Ready in `CLAIMS-BOUNDARY.md` |

### Needs a Real Transfer

| Artifact | What's needed |
|----------|---------------|
| All 10 screenshots | One completed transfer with all lifecycle stages |
| Demo video | Same transfer, recorded end-to-end |
| Stellar explorer screenshot | Real Stellar testnet tx hash |
| Circle sandbox evidence (optional) | `ENABLE_REAL_PAYOUT_EXECUTION=true` + Circle credentials |
| Final evidence JSON bundle | Export scripts run against the completed transfer |

## Final Checklist (from STATUS.md)

- [ ] Same transfer ID appears across all screenshots, video, and evidence JSON.
- [ ] Stellar screenshot shows real testnet hash or visible compatibility label.
- [ ] Payout screenshot shows provider and execution mode.
- [ ] No secrets visible in any capture.
- [ ] Evidence JSON paths in screenshots match `REVIEWER-PACKAGE.md` references.
- [ ] Run report (`runs/<timestamp>.md`) records final commands and outputs.

## Verification

```bash
# Architecture docs are plain markdown — verify they render:
cat docs/insta-awards/deliverables/deliverable-3/ARCHITECTURE-DIAGRAMS.md | head -5

# Screenshot directory exists:
ls insta-awards/deliverable-3/evidence/screenshots/ 2>/dev/null || echo "empty — capture screenshots after real transfer"

# Video directory exists:
ls insta-awards/deliverable-3/evidence/video/ 2>/dev/null || echo "empty — record video after real transfer"
```
