# Deliverable 2 — USD Delivery & Payout Coordination Layer

**Week 2 / Deliverable 2 of the Instawards grant.**

## What Was Promised vs. Delivered

Per the SOW, D2 covers:

| SOW Commitment | Delivered? | Evidence |
|---|---|---|
| Adapter interface for multiple payout providers | Yes | Code lives at `backend/src/api/services/usd-payout-adapters.ts:28-35` |
| Stellar transaction hash linking settlement to payout | Template ready; real testnet run pending | See `evidence/stellar-transaction-hash.md` |
| Circle / Bridge integration skeleton | Yes — compatibility mode with full payload shape | See `evidence/circle-bridge-integration.md` |
| Payout instruction lifecycle (create → track → webhook) | Yes — dual state machine + same-name gate | See `evidence/payout-instructions.md` |

All four checklist items are evidenced below. The **code** is complete; the **real testnet execution** run is pending.

## Quick Links

| Item | File |
|---|---|
| Submission checklist | `SUBMISSION-CHECKLIST.md` |
| Adapter interface code | `evidence/adapter-interface-code.md` |
| Stellar transaction hash (template) | `evidence/stellar-transaction-hash.md` |
| Circle / Bridge compatibility | `evidence/circle-bridge-integration.md` |
| Payout instruction lifecycle | `evidence/payout-instructions.md` |
| Summary of D2 state | `DOCS-SUMMARY.md` |

## Reference Documents

| Document | Path |
|---|---|
| SOW (Statement of Work) | `docs/insta-awards/` |
| Architecture map | `docs/project-brain/architecture/SYSTEM-MAP.md` |
| Money flows | `docs/project-brain/architecture/MONEY-FLOWS.md` |
| D1 evidence | `docs/insta-awards/deliverables/deliverable-1/` |

## Verification Commands

```bash
# Build and typecheck
npm --prefix backend run build

# Adapter contract tests (225+ lines, 8 tests)
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts

# Full coordination layer tests
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts tests/international-transfer.service.test.ts
```

## Reviewers

- Search for `payout` across `backend/src/api/services/` to trace the full flow.
- See `backend/src/api/services/international-transfer.types.ts` for all types.
- See `backend/src/orchestration/types.ts:105-116` for `PayoutEvidence` and `SameNameCheck`.
