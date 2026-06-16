# GRANTS.md — Funding & Deliverables

> **Living document.** Updated when grant statuses change or new deliverables complete.

## Instawards (Active)

### Grant: BRL→USD Rail (Instawards)
- **SOW**: `docs/funding/sow/SOW_instawards_submission_brl_usd_rail_20260520.md`
- **Scope**: PIX-to-Stellar transfer lifecycle engine, payout routing, reconciliation
- **Deliverables**: 3 (see `docs/insta-awards/deliverables/deliverable-1/`, `docs/insta-awards/deliverables/deliverable-2/`, `docs/insta-awards/deliverables/deliverable-3/`)

#### Deliverable 1 — Transfer Lifecycle Engine (IN PROGRESS)
- **Status**: Implementation improved on 2026-06-13. Code compiles and targeted lifecycle/API tests pass. The active evidence folder now contains two Stellar-payment JSON files from `payment_logs.id = 2`, verified on Horizon testnet ledger `2488252`. Final completion still requires applying `backend/migrations/20260613_00_full_schema.sql` to Supabase if not already applied in the target env, executing one real same-transfer PIX-to-Stellar-to-payout run through completion/reconciliation, exporting guarded final logs/record JSON, and capturing dashboard screenshots.
- **Evidence target**: `docs/insta-awards/deliverables/deliverable-1/evidence/`
- **Files**: `backend/src/orchestration/`, `backend/src/api/repository/transfer.repository.ts`, `backend/src/api/repository/ops-history.repository.ts`, `backend/src/api/routes/ops.router.ts`, `backend/src/api/controllers/ops.controller.ts`
- **Run docs**: `docs/insta-awards/deliverables/deliverable-1/runs/`

#### Deliverable 2 — Payout Adapter (FOUNDATION PACKAGE READY; FINAL EXECUTION PENDING)
- **Scope**: Real payout adapter execution (Circle/Bridge), identity alignment, settlement evidence
- **Status**: All four requested D2 evidence labels were assembled on 2026-06-15 and executed/refreshed on 2026-06-16: Adapter Interface Code, Hash Transacao Stellar, Integracao Circle/Bridge, and Payout Instructions. Circle Mint payout adapter builds official `/v1/businessAccount/payouts` payloads, supports linked bank destination IDs through env or protected request options, carries USDC rail metadata (`PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK`), and keeps gated sandbox/live execution, status polling, webhook normalization, and redacted evidence. Circle sandbox auth and linked wire lookup are verified from backend env: balances HTTP 200, wires HTTP 200, destination found with status `complete`. TTS created a Circle sandbox payout instruction for transfer `tr_d2_circle_stellar_payment_2`, persisted provider response in `international_payout_instructions`, refreshed provider status to `completed`, and exposed `/api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence` with `ready=true`, `ready_count=4`, and `execution_mode=sandbox_api`. Raw API key, raw linked destination ID, and raw provider payout ID are not committed. Do not claim production bank delivery from sandbox evidence; capture a signed webhook later if reviewer asks for webhook proof.
- **Files**: `backend/src/api/services/usd-payout-adapters.ts`, `backend/src/api/services/usd-payout-coordination.service.ts`, `backend/src/api/services/international-transfer.service.ts`, `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`, `backend/docs/CIRCLE_INTEGRATION_SETUP.md`
- **Evidence package**: `docs/insta-awards/deliverables/deliverable-2/STATUS.md`, `docs/insta-awards/deliverables/deliverable-2/DELIVERABLE-LOCATIONS.md`, `docs/insta-awards/deliverables/deliverable-2/evidence/`, `docs/insta-awards/deliverables/deliverable-2/runs/`

#### Deliverable 3 — End-to-End Transfer Routing Demonstration (FOUNDATION PACKAGE READY; FINAL MEDIA PENDING)
- **Scope**: Demo video, screenshots, architecture diagrams, technical walkthrough, setup documentation, and reviewer package showing PIX funding to Stellar settlement to international USD payout orchestration.
- **Status**: Week 4 evidence-label files were assembled on 2026-06-15 for Video Demo Completo, Diagramas de Arquitetura, Screenshot Fluxo Completo, and Transfer Record Final. The architecture evidence is Mermaid-based and ready for reviewer submission. Final completion still requires one same-transfer run, JSON evidence exports, screenshots, and recorded demo video.
- **Files**: `docs/insta-awards/deliverables/deliverable-3/DELIVERABLE-LOCATIONS.md`, `docs/insta-awards/deliverables/deliverable-3/evidence/video-demo-completo.md`, `docs/insta-awards/deliverables/deliverable-3/evidence/diagramas-de-arquitetura.md`, `docs/insta-awards/deliverables/deliverable-3/evidence/screenshot-fluxo-completo.md`, `docs/insta-awards/deliverables/deliverable-3/evidence/transfer-record-final.md`

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
| Instaward D2 | TBD | Circle sandbox payout instruction completed through TTS application; webhook proof optional |
| Instaward D3 | TBD | Foundation package ready; final media/evidence pending |
