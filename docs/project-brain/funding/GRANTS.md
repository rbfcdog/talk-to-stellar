# GRANTS.md — Funding & Deliverables

> **Living document.** Updated when grant statuses change or new deliverables complete.

## Instawards (Active)

### Grant: BRL→USD Rail (Instawards)
- **SOW**: `docs/funding/sow/SOW_instawards_submission_brl_usd_rail_20260520.md`
- **Scope**: PIX-to-Stellar transfer lifecycle engine, payout routing, reconciliation
- **Deliverables**: 3 (see `docs/insta-awards/deliverables/deliverable-1/`, `docs/insta-awards/deliverables/deliverable-2/`, `docs/insta-awards/deliverables/deliverable-3/`)

#### Deliverable 1 — Transfer Lifecycle Engine (IN PROGRESS)
- **Status**: Implementation improved on 2026-06-13. Code compiles and targeted lifecycle/API tests pass. The active evidence folder now contains two real historical Stellar-payment JSON files from `payment_logs.id = 2`, verified on Horizon testnet ledger `2488252`. Final completion still requires applying `backend/migrations/20260613_00_full_schema.sql` to Supabase if not already applied in the target env, executing one real same-transfer PIX-to-Stellar-to-payout run through completion/reconciliation, exporting guarded final logs/record JSON, and capturing dashboard screenshots.
- **Evidence target**: `docs/insta-awards/deliverables/deliverable-1/evidence/`
- **Files**: `backend/src/orchestration/`, `backend/src/api/repository/transfer.repository.ts`, `backend/src/api/repository/ops-history.repository.ts`, `backend/src/api/routes/ops.router.ts`, `backend/src/api/controllers/ops.controller.ts`
- **Run docs**: `docs/insta-awards/deliverables/deliverable-1/runs/`

#### Deliverable 2 — Payout Adapter (PENDING)
- **Scope**: Real payout adapter execution (Circle/Bridge), identity alignment, settlement evidence
- **Status**: Foundation started on 2026-06-13. Circle Mint payout adapter now builds official `/v1/businessAccount/payouts` payloads, supports linked bank destination IDs, gated sandbox/live execution, status polling, webhook normalization, and redacted evidence. Bridge remains compatibility-oriented while provider access is pending. Completion still requires Circle sandbox credentials, a linked bank account ID, an end-to-end transfer run after Stellar settlement, and evidence capture.
- **Files**: `backend/src/api/services/usd-payout-adapters.ts`, `backend/src/api/services/usd-payout-coordination.service.ts`, `backend/src/api/services/international-transfer.service.ts`, `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`, `backend/docs/CIRCLE_INTEGRATION_SETUP.md`

#### Deliverable 3 — Institutional Settlement Flow Demonstration (PENDING)
- **Scope**: Demo video, screenshots, architecture diagrams, technical walkthrough, setup documentation, and reviewer package showing PIX funding to Stellar settlement to international USD payout orchestration.
- **Status**: Foundation started on 2026-06-13. Documentation package now exists under `docs/insta-awards/deliverables/deliverable-3/` with setup, diagrams, technical walkthrough, demo runbook, screenshot shot list, video storyboard, evidence checklist, reviewer package, and claims boundary. Final completion still requires one same-transfer run, JSON evidence exports, screenshots, and recorded demo video.
- **Files**: `docs/insta-awards/deliverables/deliverable-3/README.md`, `docs/insta-awards/deliverables/deliverable-3/DEMO-RUNBOOK.md`, `docs/insta-awards/deliverables/deliverable-3/TECHNICAL-WALKTHROUGH.md`, `docs/insta-awards/deliverables/deliverable-3/ARCHITECTURE-DIAGRAMS.md`, `docs/insta-awards/deliverables/deliverable-3/REVIEWER-PACKAGE.md`

## Stellar Community Fund (SCF)

- **SOW**: `docs/funding/sow/SOW_inital.md` (original scope) → superseded by Instawards
- **Scope**: Original project build — conversational PIX-to-Stellar
- **Status**: Superseded by Instawards SOW

## Other Deliverables

### Admin Fee Wallet (✅)
- **Evidence**: `docs/operations/ADMIN_FEE_WALLET_RUNBOOK.md`
- **Config**: `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY`

### BlindPay Integration (🔄)
- **Folder**: `blindpay/`
- **Status**: Development instance only. Needs production instance for mainnet PIX → USDC on Stellar.

### DentPeg Integration (🔄)
- **Folder**: `dentpeg/`
- **Status**: Ready for API key. No Stellar payout (Liquid/BSC/ETH/SOL only).

## Deadlines

| Deliverable | Due | Status |
|-------------|-----|--------|
| Instaward D1 | Active sprint | In progress |
| Instaward D2 | TBD | Foundation in progress |
| Instaward D3 | TBD | Foundation in progress |
