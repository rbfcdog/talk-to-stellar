# BRL to USD Stellar/Wise Lab - Build Log

Status: mock sandbox implementation
Date: 2026-05-18

## What was built

1. Created the technical design document in `docs/settlement/BRL_USD_STELLAR_WISE_TECHNICAL_DESIGN.md`.
   - It explains the PIX -> BRL ledger -> BRL/USD quote -> USDC -> Stellar -> USD off-ramp -> Wise/international payout thesis.
   - It separates what Stellar solves from what regulated partners still need to solve.
   - It includes the minimum ledger statuses, provider options, compliance constraints, cost model and MVP boundaries.

2. Added a frontend testing surface for the idea.
   - Route: `/global-transfer`.
   - Purpose: simulate quotes, costs, statuses and payloads without moving real money.
   - The screen is intentionally operational, not a marketing landing page.

3. Added the mock calculations needed for the first product test.
   - BRL amount.
   - BRL/USD rate.
   - Platform fee.
   - Liquidity spread.
   - Off-ramp fee.
   - IOF estimate.
   - ACH, wire or SWIFT-local bank fee.
   - Provider choice: Bridge-style, Circle Mint, Rail-style or own Stellar anchor.

4. Added the mock operational view.
   - Gross USD.
   - Net USD delivered.
   - Effective total cost.
   - USDC settlement estimate.
   - Timeline from quote to bank payout.
   - Cost breakdown.
   - Compliance and product risk flags.
   - JSON previews for quote creation and transfer creation.

5. Added a landing navigation link to the new lab.
   - The main landing navbar now links to `/global-transfer` as `USD Lab`.

6. Extended the lab into a full PIX anchor and external payout surface.
   - Added anchor provider selection.
   - Added payer/KYC inputs.
   - Added PIX PSP and anchor fee controls.
   - Added recipient bank detail inputs.
   - Added actions for creating the PIX anchor order, marking PIX paid and sending USD externally.
   - Added anchor order, release gate, external payout and fee-by-stage panels.

7. Added fee and anchor-flow documentation.
   - New file: `docs/settlement/BRL_USD_STELLAR_WISE_FEES_AND_ANCHOR_FLOW.md`.
   - It describes what is needed to make the mock real and which fees are paid at each stage.

8. Handled local sandbox artifacts safely.
   - `debug-telegram-image.png` was already deleted locally and is staged as a tracked deletion.
   - `sandbox/regional-starter-pack` was already deleted locally and is staged as a tracked deletion.
   - `deprecated/sandbox/` is not committed because it contains a nested Git repo, `node_modules` and `.env`.
   - `.gitignore` now ignores `deprecated/sandbox/` to prevent accidental secret or artifact commits.

## Validation performed

Run from the repository root:

```bash
cd frontend
npm run build
```

Expected result: the Next.js production build completes successfully.

## Current limitation

The interface is a deterministic mock. It does not call a backend, create PIX charges, sign Stellar transactions, call an off-ramp provider or send ACH/wire payouts.
