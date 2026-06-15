# Deliverable 2 — Submission Checklist

| # | Item | Status | Artifact Path | Verification Command |
|---|---|---|---|---|
| 1 | **Adapter interface code** | Ready | `backend/src/api/services/usd-payout-adapters.ts:28-35` | `npm --prefix backend run build` |
| 2 | **Stellar transaction hash** | Template ready; real testnet transfer pending | `insta-awards/deliverable-2/evidence/stellar-transaction-hash.md` | Run a real testnet transfer and capture the tx hash from Stellar Expert. |
| 3 | **Circle / Bridge integration** | Ready (compatibility mode) | `backend/src/api/services/usd-payout-adapters.ts:525-813` | `npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts` |
| 4 | **Payout instructions (create + track)** | Ready | `backend/src/api/services/usd-payout-adapters.ts:28-35` (interface), `backend/src/api/services/usd-payout-coordination.service.ts:57-231` (service) | `npx ts-node -e "import { UsdPayoutCoordinationService } from './backend/src/api/services/usd-payout-coordination.service'; console.log(JSON.stringify(new UsdPayoutCoordinationService().getCapabilities(), null, 2));"` |

## Status Summary

| Status | Count |
|---|---|
| Ready | 3 |
| Needs real transfer | 1 |

## How to Mark Items as Complete

1. Item 1 is **complete** — the TypeScript interface compiles and all 8 contract tests pass.
2. Item 2 needs a **real Stellar testnet transfer** executed and the tx hash pasted into `evidence/stellar-transaction-hash.md`.
3. Item 3 is **complete** — the compatibility payloads for Circle and Bridge are built, redacted, and tested.
4. Item 4 is **complete** — the coordination service builds the full `PayoutCoordinationEvidence` object with all 4 checklist items tracked.

## One-Command Verification

```bash
npm --prefix backend run build \
  && npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts tests/international-transfer.routes.test.ts tests/international-transfer.service.test.ts
```
