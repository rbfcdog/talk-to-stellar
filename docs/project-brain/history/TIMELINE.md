# TIMELINE.md — Project Evolution

> **Living document.** Updated when major phases complete or pivots happen.

Reconstructed from git log, doc folders, and SOW artifacts.

## Phase 1: Initial Build (Early 2026)
- WhatsApp/Telegram conversational agent via Evolution API
- Stellar wallet management (testnet)
- Basic send/receive via Stellar
- Web chat + web screens (Next.js frontend)
- Passkey authentication

## Phase 2: PIX On/Off-Ramp (April-May 2026)
- Etherfuse integration for PIX on-ramp (TESOURO → USDC)
- PIX off-ramp (USDC → BRL via PIX)
- KYC via Etherfuse (sandbox mode)
- Fee system: 30bps platform spread
- Admin fee wallet
- Receipt generation (SVG via Resvg)

## Phase 3: Multi-Asset + Investments (May 2026)
- BRL/TESOURO/CETES assets on Stellar
- Conversion engine: multi-asset pathfinding
- DeFindex vault integration (USDC + CETES yield)
- Defindex real execution mode
- Portfolio balance view
- Many UX improvements (see `docs/product/UX_*`)

## Phase 4: International Transfers (May-June 2026)
- BRL→USD rail: PIX funding → Stellar settlement → USD payout
- International transfer state machine (11 states)
- Payout adapter system (Mock, Circle, Bridge, Etherfuse)
- Reconciliation evidence framework
- Bridge.xyz PIX/ACH integration (alternate rail)
- Stellar mainnet infrastructure prepared (disabled)

## Phase 5: Instawards Deliverable 1 (June 2026)
- TransferOrchestrator — 13-state engine
- transfer_events append-only audit trail
- StellarSettlementWatcher — Horizon poller
- Ops dashboard (/ops)
- Programmatic API (/api/transfers)
- BlindPay + DentPeg integration folders

## Phase 6: Instawards Deliverable 2 Foundation (June 2026)
- Circle Mint USD payout foundation added on 2026-06-13
- Circle payout adapter builds `/v1/businessAccount/payouts` requests, supports linked bank destination IDs, status polling, webhook normalization, and redacted evidence
- Bridge remains compatibility-oriented while external provider access is pending

## Phase 7: Instawards Deliverable 3 Demonstration Foundation (June 2026)
- Institutional settlement flow demo documentation started on 2026-06-13
- D3 package now maps PIX funding -> Stellar USDC settlement -> USD payout coordination -> reconciliation evidence
- Final video, screenshots, and same-transfer evidence exports are still pending

## Key Pivots

1. **Etherfuse as primary PIX provider** — chosen over Bridge.xyz for the main flow. Bridge kept as alternate.
2. **Multi-asset strategy** — expanded from USDC-only to BRL/TESOURO/CETES/XLM for Brazilian market.
3. **WhatsApp-first surface** — conversational interface prioritized over web screens.
4. **"Invisible wallet" UX** — product redesign toward Nubank-style experience.

## Git Activity (Recent)
Most active areas: `backend/src/api/services/`, `frontend/`, `backend/src/orchestration/` (new).
Fix commits: fee adjustments, i18n fixes, flow state fixes, security hardening rounds.
