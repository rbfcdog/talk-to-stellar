# Claims Boundary

This document prevents accidental overclaiming in the demo video, screenshots, and reviewer package.

## Allowed Claims From Current Foundation

The package may claim:

- The code contains a BRL/USD quote route at `POST /api/quotes/brl-usd`.
- The code contains institutional transfer routes under `/api/transfers`.
- The code contains a normalized orchestration state machine in `backend/src/orchestration/stateMachine.ts`.
- The code contains a Stellar settlement service in `backend/src/api/services/stellar-settlement.service.ts`.
- The code contains Circle payout adapter foundation in `backend/src/api/services/usd-payout-adapters.ts`.
- The code contains reviewer evidence endpoints for workflow, reviewer evidence, payout evidence, orchestration log, and reconciliation.
- The `/institution-settlement` page routes to the settlement console client.
- The `/ops` dashboard shows normalized transfer records and details.

## Conditional Claims

Only claim these when the final artifacts prove them:

| Claim | Required proof |
|-------|----------------|
| Real Stellar testnet settlement happened | Stellar transaction hash from the run, network marked testnet, and supporting evidence JSON. |
| Circle sandbox payout executed | Circle adapter mode `sandbox_api`, provider payout ID, and redacted Circle response evidence. |
| USD bank payout completed | Provider status evidence says completed, and the provider response or webhook is persisted. |
| End-to-end flow completed | Quote, PIX, Stellar, payout, and reconciliation artifacts all reference the same transfer. |
| Dashboard proves lifecycle | Screenshots show the same transfer/public reference as the JSON evidence. |

## Claims To Avoid Until Proven

Do not claim:

- production PIX money movement unless provider evidence proves it.
- production Stellar mainnet settlement unless mainnet validation was intentionally enabled and evidence is captured.
- real Circle bank payout when `ENABLE_REAL_PAYOUT_EXECUTION=false`.
- Bridge execution while Bridge access is still pending.
- final grant completion when screenshots/video/JSON artifacts are still missing.

## Required Labels

Use these exact labels in run reports and narration:

| Mode | Label |
|------|-------|
| Real Stellar testnet | `real_stellar_testnet` |
| Mock Stellar settlement | `mock_stellar_settlement` |
| Circle compatibility payload only | `circle_compatibility_no_bank_payout` |
| Circle sandbox API call | `circle_sandbox_api` |
| Circle production API call | `circle_live_api` |
| Mock PIX funding | `mock_pix_no_real_money` |
| Etherfuse sandbox PIX | `etherfuse_sandbox_pix` |

## Redaction Rules

Never show:

- `STELLAR_SECRET_KEY`
- API keys.
- ops tokens.
- session tokens.
- PINs.
- full bank account numbers.
- full routing numbers.
- unredacted tax IDs.
- private customer emails in public evidence.

Reviewer evidence may show:

- short hashes.
- last four account digits.
- public Stellar transaction hashes.
- public Stellar account IDs when they are part of testnet evidence.
- transfer IDs and public references.
