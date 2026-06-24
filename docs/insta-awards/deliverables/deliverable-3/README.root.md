# Deliverable 3: End-to-End Transfer Routing Demonstration

**TalkToStellar — Instawards BRL→USD Transfer Routing on Stellar**
**Deliverable**: D3 of 3 (PIX-to-Stellar Transfer Lifecycle Engine, USD Delivery & Payout Coordination Layer, End-to-End Transfer Routing Demonstration)
**SOW**: `docs/funding/sow/SOW_instawards_submission_brl_usd_rail_20260520.md`

---

## What This Deliverable Proves

D3 is the **reviewer-facing evidence package** that demonstrates the complete transfer-routing flow end to end:

1. **Transfer intake** — A BRL amount enters the system via API or conversational surfaces (WhatsApp/Telegram/Web).
2. **Quote generation** — BRL/USDC pathfinding produces a rate, fee breakdown, and expected USD output.
3. **PIX funding** — The PIX charge is issued, tracked, and confirmed (Etherfuse sandbox).
4. **Stellar settlement** — USDC moves on Stellar testnet with a verifiable transaction hash.
5. **Payout routing** — The system selects a payout provider (Circle, Bridge, Etherfuse, or mock) and performs same-name identity checks.
6. **Payout instruction** — A payout instruction is generated through the provider-agnostic adapter interface.
7. **Reconciliation** — Inbound BRL, settled USDC, and outbound USD amounts are compared; discrepancies are flagged.
8. **Audit trail** — Every state transition is recorded as an append-only `transfer_events` row with actor, correlation ID, payload, and structured JSON log.

The reviewer can verify every step through:
- The `/ops` dashboard (HTML UI with metrics, table, and drill-down)
- The `/ops/transfers/:id` detail page (lifecycle timeline, reconciliation panel, evidence links, raw JSON record)
- The stellar.expert explorer for the settlement transaction hash
- Structured JSON orchestration logs emitted per transition

---

## What Was Built (D1 + D2 Recap)

| Deliverable | What | Key files |
|---|---|---|
| D1: Transfer Lifecycle Engine | 13-state TransferOrchestrator, state machine, atomic `transition_transfer()` RPC, append-only `transfer_events`, structured logging | `backend/src/orchestration/TransferOrchestrator.ts`, `stateMachine.ts`, `types.ts`, `transfer.repository.ts`, `orchestrationLogger.ts` |
| D2: USD Delivery & Payout Coordination Layer | Provider-agnostic `PayoutProviderAdapter` interface, Circle/Bridge/Etherfuse/mock adapters, payout coordination service, sandbox execution mode | `backend/src/api/services/usd-payout-adapters.ts`, `usd-payout-coordination.service.ts` |
| D3: End-to-End Transfer Routing Demonstration | Ops dashboard, transfer detail forensics view, reconciliation panel, evidence/links panel, raw JSON record, video storyboard, reviewer package | `backend/src/api/controllers/ops.controller.ts`, `backend/src/api/views/ops-dashboard.view.ts`, `backend/src/api/repository/ops-history.repository.ts` |

---

## Files in This Deliverable

| File | Purpose |
|---|---|
| `README.md` | This overview |
| `ARCHITECTURE-DIAGRAMS.md` | Mermaid diagrams for system architecture, transfer lifecycle state machine, and money flow sequence |
| `VIDEO-STORYBOARD.md` | Scene-by-scene 90-second demo video script with timestamps |
| `REVIEWER-PACKAGE.md` | Consolidated reviewer submission covering all evidence pieces from D1+D2+D3 |
| `SCREENSHOT-SHOTLIST.md` | Exact URLs and what each screenshot must show |
| `SETUP.md` | Reproduction instructions: env vars, migrations, commands, test transfer seeding |
| `TECHNICAL-WALKTHROUGH.md` | Code walkthrough of TransferOrchestrator, StellarSettlementWatcher, ops dashboard, evidence export, reconciliation |
| `CLAIMS-BOUNDARY.md` | What this demo proves vs what it does NOT claim |

---

## Quick Start for Reviewers

1. Read `REVIEWER-PACKAGE.md` for the submission overview.
2. Read `CLAIMS-BOUNDARY.md` to understand testnet/sandbox boundaries.
3. Read `ARCHITECTURE-DIAGRAMS.md` for the system model.
4. Read `TECHNICAL-WALKTHROUGH.md` to understand the code.
5. Watch the video following `VIDEO-STORYBOARD.md`.
6. Use `SETUP.md` to reproduce the flow locally.

---

## Evidence Location

Evidence artifacts (JSON exports, orchestration logs, screenshots) are captured using:

```
npm run instawards:evidence -- \
  --api-base=http://localhost:3333 \
  --transfer-id=<uuid> \
  --dashboard-url=http://localhost:3000
```

This writes to `insta-awards/evidence-runs/<run-id>/` and captures:
- Redacted transfer record
- Reconciliation payload
- Orchestration log entries
- Workflow snapshot
- Payout coordination evidence
- Dashboard screenshots (via Playwright)

The submission-ready evidence snapshot for this deliverable is at:
`insta-awards/evidence-runs/<run-id>/`

---

## Repository

**URL**: https://github.com/rbfcdog/talk-to-stellar
**Branch**: `main`
**Key code paths**:
- Orchestration: `backend/src/orchestration/`
- Ops dashboard: `backend/src/api/controllers/ops.controller.ts`
- Transfer repository: `backend/src/api/repository/transfer.repository.ts`
- Payout adapters: `backend/src/api/services/usd-payout-adapters.ts`
- DB migrations: `backend/migrations/`
