# Institution Settlement Console

The reviewer console is available at:

```text
/institution-settlement
```

`/international-transfer` remains an alias.

## Purpose

The console demonstrates the scoped Instawards corridor:

```text
BRL source
-> payment-backed PIX funding intent
-> Stellar USDC settlement evidence
-> provider-agnostic USD payout instruction
-> reconciliation and reviewer evidence
```

It is an operations and evidence surface. It does not claim production
remittance, licensed FX operation, or production bank payout.

## Architecture

The UI is intentionally thin. Lifecycle semantics come from:

```text
GET /api/transfers/:id/workflow
```

The workflow response is the authoritative source for:

- Current state and progress.
- Completed, current, pending, or failed lifecycle steps.
- Evidence readiness.
- Same-name payout control.
- The next permitted action and required actor.

The frontend is split into:

```text
settlement-console.types.ts
settlement-console.model.ts
use-settlement-console.ts
settlement-console-view.tsx
```

## Required Setup

Apply:

```text
backend/migrations/20260613_00_full_schema.sql
```

Minimum backend configuration:

```bash
STELLAR_NETWORK=TESTNET
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=<issuer>
PAYOUT_PROVIDER=etherfuse
INTERNATIONAL_TRANSFER_OPS_SECRET=<operator-secret>
ENABLE_REAL_PAYOUT_EXECUTION=false
```

For payment-backed Etherfuse funding, configure the provider variables
documented in `docs/insta-awards/external-integrations-needed.md`.

## Controlled Flow

1. `Prepare funding route` creates the quote, transfer record, and PIX intent.
2. A real provider event advances `PIX_PENDING` to `PIX_RECEIVED`.
3. An authorized operator submits Stellar settlement.
4. Same-name control is evaluated before payout creation.
5. An authorized operator creates the payout instruction.
6. Payout status is refreshed until terminal or manual review.
7. Reviewer evidence is refreshed and exported.

Ops-only mock funding is available only when both backend mock policy and
`NEXT_PUBLIC_ALLOW_OPS_MOCKS` explicitly allow it.

## Security Boundaries

- Raw transfer and reconciliation reads require transfer-ops authorization.
- Reviewer evidence, orchestration logs, and workflow snapshots are redacted.
- The frontend proxy never creates an operator credential. It forwards only a
  credential explicitly supplied by the operator.
- Same-name-required routes cannot create payout instructions while identity
  alignment is `MISMATCHED` or `UNKNOWN`.
- Session tokens, PINs, API keys, identities, and full bank details are removed
  from copied and downloaded reviewer bundles.

## Evidence Capture

```bash
npm run instawards:evidence -- \
  --run-id final-review \
  --api-base=http://localhost:3001 \
  --dashboard-url=http://localhost:3000 \
  --transfer-id=<transfer-id> \
  --ops-secret=<operator-secret>
```

The generated package includes the redacted transfer record, reconciliation,
orchestration log, workflow snapshot, repository metadata, and dashboard
screenshot.
