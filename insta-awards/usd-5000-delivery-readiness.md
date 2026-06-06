# USD 5,000 Delivery Readiness

This checklist defines what makes the scoped Instawards delivery technically
coherent and reviewer-ready.

## Architecture

- One backend lifecycle definition controls state rank, progress, next action,
  and reviewer workflow output.
- The frontend consumes `GET /api/transfers/:id/workflow` instead of maintaining
  a second state machine.
- Quote, transfer, PIX funding, Stellar evidence, payout instruction, and
  reconciliation remain separate persisted concerns.
- Raw operational records require operator authorization.
- Reviewer contracts are redacted by construction.

## Financial Integrity

- Source BRL, gross USD, charged fee components, and destination USD are shown
  together.
- Reconciliation validates that charged fees explain the route delta.
- Financial values remain visible in reviewer evidence.
- Identity, credentials, and bank details remain redacted.
- Same-name-required payout routes are blocked unless identity alignment is
  `MATCHED`.

## Evidence Integrity

- Repository link and exact commit.
- Reviewer dashboard screenshot.
- Redacted transfer record.
- Redacted orchestration log.
- Workflow snapshot.
- Reconciliation JSON.
- Stellar transaction hash with explicit `mock`, `testnet`, or
  `mainnet_validation` mode.
- Payout instruction with explicit provider mode.
- Correlation and request IDs.

## Required Validation

```bash
npm --prefix backend test -- --runInBand
npm --prefix backend run build
npm --prefix frontend test -- --run
npm --prefix frontend run build
```

The final evidence run must be generated from a clean `main` commit:

```bash
npm run instawards:evidence -- \
  --run-id final-review \
  --api-base=<backend-url> \
  --dashboard-url=<frontend-url> \
  --transfer-id=<persisted-transfer-id> \
  --ops-secret=<operator-secret>
```

## External Blockers

These are configuration or partner dependencies, not code-completion claims:

- Real Etherfuse payment confirmation.
- Configured Stellar testnet signer and destination.
- Circle or Bridge sandbox credentials if provider API validation is required.
- Demo video recording and final submission upload.

No blocker may be represented as completed evidence without the corresponding
provider response, transaction hash, screenshot, or exported artifact.
