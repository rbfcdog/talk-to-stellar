# Week 2 Reviewer Package

## USD Delivery & Payout Coordination Layer

The Week 2 package proves that a completed Stellar USDC settlement can be
converted into a provider-agnostic USD payout instruction, observed through
polling or signed provider events, and reconciled without claiming a bank
payout when execution is disabled.

## Required Evidence

| Artifact | Source |
| --- | --- |
| Adapter Interface Code | `backend/src/api/services/usd-payout-adapters.ts` |
| Stellar Transaction Hash | `GET /api/transfers/:id/payout-evidence` |
| Circle / Bridge Compatibility | `GET /api/transfers/payout-providers` |
| Payout Coordination Record | `GET /api/transfers/:id/payout-evidence` |

## Persistence

Apply:

```text
backend/migrations/20260606_00_usd_payout_coordination.sql
```

It creates:

- `international_payout_instructions`
- `international_payout_events`

Provider references are unique per provider. Provider event IDs are unique per
provider, so replayed webhook events do not advance the lifecycle twice.

## Execution Boundaries

- Circle and Bridge default to compatibility mode.
- Provider API execution requires credentials, configured create/status URLs,
  and `ENABLE_REAL_PAYOUT_EXECUTION=true`.
- Wise remains destination metadata only.
- Etherfuse remains a PIX off-ramp proof and is not presented as USD bank
  delivery.
- Provider events require `x-payout-webhook-secret`.

## Reviewer Flow

1. Open `/institution-settlement`.
2. Complete funding and attach Stellar settlement evidence.
3. Select Circle or Bridge and create a payout instruction.
4. Open the `USD payout` tab to inspect readiness, execution mode, identity
   control, status history, and the redacted coordination record.
5. Capture the Week 2 strip after it reports `4/4`.

Generate the evidence package with:

```bash
node scripts/instawards-evidence.mjs \
  --api-base=http://localhost:3001 \
  --dashboard-url=http://localhost:3000 \
  --transfer-id=<transfer-id>
```
