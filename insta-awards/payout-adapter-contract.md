# Payout Adapter Contract

The payout layer is provider-agnostic. It turns a completed Stellar settlement
record into a provider-shaped instruction and later refreshes that instruction's
status. It does not claim production bank payout execution unless a real
provider API is explicitly configured and enabled.

## Interface

Source:

```text
backend/src/api/services/usd-payout-adapters.ts
```

Contract:

```ts
interface PayoutProviderAdapter {
  providerName: 'mock' | 'circle' | 'bridge' | 'etherfuse';
  getCapabilities(): PayoutProviderCapabilities;
  createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction>;
  getPayoutStatus(providerPayoutId: string): Promise<PayoutStatus | PayoutStatusObservation>;
  normalizeWebhookEvent?(payload: Record<string, unknown>): PayoutProviderEvent | null;
  cancelPayout?(providerPayoutId: string): Promise<void>;
}
```

Required instruction fields:

- `payout_instruction_id`
- `provider_name`
- `provider_payout_id`
- `status`
- `destination`
- `amount_usd`
- `currency`
- `created_at`
- `updated_at`
- `execution_mode`
- `status_history`
- `metadata`

## Provider Modes

| Adapter | Current mode | Execution boundary |
| --- | --- | --- |
| `etherfuse` | Sandbox/off-ramp proof payload by default. | Executes only the controlled Etherfuse sandbox proof when session credentials, PIN, and `run_etherfuse_offramp_test=true` are supplied. |
| `circle` | Compatibility payload by default. | Calls a provider URL only when API key, create URL, and `ENABLE_REAL_PAYOUT_EXECUTION=true` are configured. |
| `bridge` | Compatibility payload by default. | Calls a provider URL only when API key, create URL, and `ENABLE_REAL_PAYOUT_EXECUTION=true` are configured. |
| `mock` | Ops-only mock instruction. | Requires `ALLOW_OPS_MOCKS=true` and `ALLOW_MOCK_USD_PAYOUTS=true`. |

Wise-labeled destinations are metadata-only. Adapters return
`wise_metadata_only` and do not call Wise or execute a provider payout to Wise
details.

## Status Refresh

Endpoint:

```text
POST /api/transfers/:id/payout-status-refresh
```

Requirements:

- Requires `INTERNATIONAL_TRANSFER_OPS_SECRET`.
- Requires an existing payout instruction on the transfer.
- Calls `adapter.getPayoutStatus(provider_payout_id)`.
- Updates `payout_status`, transfer state, and reconciliation evidence.

Provider events use:

```text
POST /api/transfers/payout-events/:provider
```

The endpoint requires `x-payout-webhook-secret`, normalizes provider status,
persists each provider event once, and applies the same lifecycle transition
path used by polling.

Provider readiness and reviewer-safe evidence use:

```text
GET /api/transfers/payout-providers
GET /api/transfers/:id/payout-evidence
```

Status handling:

| Provider status | Transfer state effect |
| --- | --- |
| `pending` or `instruction_created` | Keeps route pending and records `poll_payout_status` as next action. |
| `completed` | Moves to `PAYOUT_COMPLETED` and records completion timestamp. |
| `failed` or `cancelled` | Moves to `FAILED` and records refund/manual-review next action. |

## Evidence

Tests:

```text
backend/tests/payout-adapter-contract.test.ts
backend/tests/international-transfer.service.test.ts
backend/tests/international-transfer.routes.test.ts
```

Capture for reviewers:

- Provider selected.
- Instruction ID.
- Provider payout ID.
- Redacted provider payload.
- Initial provider status.
- Refreshed provider status.
- Reconciliation JSON after refresh.
- Signed webhook event and replay result.
- Dedicated `international_payout_instructions` and
  `international_payout_events` records.
