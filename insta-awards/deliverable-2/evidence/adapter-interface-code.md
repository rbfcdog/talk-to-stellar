# Evidence 1: Adapter Interface Code

## Location

`backend/src/api/services/usd-payout-adapters.ts:28-35`

## Interface Definition

```typescript
export interface PayoutProviderAdapter {
  providerName: PayoutProviderName;
  getCapabilities(): PayoutProviderCapabilities;
  createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction>;
  getPayoutStatus(providerPayoutId: string): Promise<PayoutStatus | PayoutStatusObservation>;
  normalizeWebhookEvent?(payload: Record<string, unknown>): PayoutProviderEvent | null;
  cancelPayout?(providerPayoutId: string): Promise<void>;
}
```

## Method Signatures

| Method | Signature | Description |
|---|---|---|
| `providerName` | `PayoutProviderName` | Constant string identifying the provider (`'mock'`, `'circle'`, `'bridge'`, `'etherfuse'`) |
| `getCapabilities` | `() => PayoutProviderCapabilities` | Returns read-only capability snapshot (execution mode, requirements, blockers, notes) |
| `createPayoutInstruction` | `(input: CreatePayoutInput) => Promise<PayoutInstruction>` | Creates a payout instruction record. May execute a real API call or produce a compatibility payload depending on env config. |
| `getPayoutStatus` | `(providerPayoutId: string) => Promise<PayoutStatus \| PayoutStatusObservation>` | Polls the provider for current status. Returns a normalized `PayoutStatus` or a full `PayoutStatusObservation` with evidence. |
| `normalizeWebhookEvent` | `(payload: Record<string, unknown>) => PayoutProviderEvent \| null` | (Optional) Normalizes an incoming webhook payload into a `PayoutProviderEvent`. Returns `null` if the payload is unrecognized. |
| `cancelPayout` | `(providerPayoutId: string) => Promise<void>` | (Optional) Cancels a pending payout. Not yet implemented in most adapters. |

## CreatePayoutInput

```typescript
export type CreatePayoutInput = {
  transferId: string;
  amountUsd: string;
  destination: UsdBankDestination;
  senderLegalName?: string;
  recipientLegalName?: string;
  stellarTxHash?: string;
  stellarMemo?: string;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
};
```

## Supported Providers Table

| Provider | Class | Execution Mode | Supports Webhooks | USD Bank Destination | Source |
|---|---|---|---|---|---|
| `mock` | `MockUsdPayoutAdapter` | `mock` | No | No | `usd-payout-adapters.ts:296` |
| `circle` | `CircleCompatibilityAdapter` | `compatibility` / `sandbox_api` / `live_api` | Yes | Yes | `usd-payout-adapters.ts:525` |
| `bridge` | `BridgeCompatibilityAdapter` | `compatibility` / `live_api` | Yes | Yes | `usd-payout-adapters.ts:807` |
| `etherfuse` | `EtherfusePixOffRampAdapter` | `proof` | No | No | `usd-payout-adapters.ts:815` |

## Factory Function

```typescript
// Location: usd-payout-adapters.ts:927-934
export function getPayoutProviderAdapter(
  provider = process.env.PAYOUT_PROVIDER
): PayoutProviderAdapter {
  const normalized = String(provider || 'etherfuse').trim().toLowerCase();
  if (normalized === 'circle') return new CircleCompatibilityAdapter();
  if (normalized === 'bridge') return new BridgeCompatibilityAdapter();
  if (normalized === 'etherfuse') return new EtherfusePixOffRampAdapter();
  if (normalized === 'mock') return new MockUsdPayoutAdapter();
  throw new Error(
    `Unsupported payout provider "${normalized}". ` +
    `Expected one of: ${SUPPORTED_PAYOUT_PROVIDERS.join(', ')}.`
  );
}
```

Unknown providers throw — the system never falls back silently to mock.

## Redaction Rules

Location: `usd-payout-adapters.ts:120-145`

All persisted evidence goes through `redactPayoutFields()`:

| Field Pattern | Redaction Rule |
|---|---|
| `accountHolderName` | `[REDACTED]` |
| `accountNumber`, `routingNumber` | `[REDACTED_LAST4:xxxx]` (preserves last 4 digits) |
| `iban` | `[REDACTED]` |
| `providerDestinationId`, `circleBankAccountId` | `[REDACTED_HASH:xxxxxxxxxxxx]` (SHA-256 prefix) |
| Sensitive `id` fields inside objects with `type` keys | `[REDACTED_HASH:xxxxxxxxxxxx]` |

The `payoutProviderEvidenceSnapshot()` function (`usd-payout-adapters.ts:147-149`) wraps this and also applies the global `redactSensitive()` utility.

## Test Coverage

Location: `backend/tests/payout-adapter-contract.test.ts` (264 lines, 8 tests)

Tests cover:
- Mock adapter with ops policy gating
- Etherfuse proof payload (no USD bank claim)
- Circle compatibility payload with redacted account fields
- Bridge compatibility payload with redacted IBAN/routing
- Real execution mode: Circle sends executable destination details to API, persists only redacted evidence
- Circle status polling with sandbox endpoint
- Rejection of unknown provider names
- Webhook event normalization with signed secrets

Run: `npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts`
