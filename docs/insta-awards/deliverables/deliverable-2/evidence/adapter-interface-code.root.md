# Evidence 1 — Adapter Interface Code

## Status

Ready for code review and test proof. The provider-agnostic payout adapter contract exists, supports Circle/Bridge/Etherfuse/mock providers, and is covered by backend tests.

## Code References

| Area | File |
|---|---|
| Adapter contract and providers | `backend/src/api/services/usd-payout-adapters.ts` |
| Payout evidence builder | `backend/src/api/services/usd-payout-coordination.service.ts` |
| Transfer payout orchestration | `backend/src/api/services/international-transfer.service.ts` |
| HTTP payout routes | `backend/src/api/routes/international-transfers.router.ts` |
| Contract tests | `backend/tests/payout-adapter-contract.test.ts` |

## Contract

The `PayoutProviderAdapter` interface requires every provider to expose capabilities, create payout instructions, poll status, and optionally normalize webhook events.

Supported providers:

| Provider | Purpose |
|---|---|
| `circle` | Circle Mint USD payout payloads and sandbox/live API execution when enabled. |
| `bridge` | Bridge-compatible payout payloads while provider access is pending. |
| `etherfuse` | PIX off-ramp proof path, not a USD bank payout claim. |
| `mock` | Ops-only mock evidence when mock policy explicitly allows it. |

Unknown provider names throw and do not fall back silently to mock.

## Current Foundation Addition

`POST /api/transfers/:id/payout-instruction` now forwards Circle-specific provider options to the payout service:

- `circleDestinationId` / `circle_destination_id`
- `circleDestinationType` / `circle_destination_type`
- `circleSourceWalletId` / `circle_source_wallet_id`
- `circleIdempotencyKey` / `circle_idempotency_key`

This lets the backend use either a global `CIRCLE_PAYOUT_DESTINATION_ID` or a per-request/per-transfer linked Circle bank account ID.

## Reviewer Claim

Use this claim:

```text
TalkToStellar implements a provider-agnostic payout adapter contract that can build USD payout instructions for Circle and Bridge-compatible workflows, preserve Etherfuse PIX proof metadata, and reject unsupported providers without silently falling back to mock behavior.
```

Do not claim final Circle payout execution from this artifact alone. Execution proof belongs in `circle-bridge-integration.md` and `payout-instructions.md` after a real same-transfer run.

## Verification

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts tests/international-transfer.routes.test.ts
npm --prefix backend run build
```
