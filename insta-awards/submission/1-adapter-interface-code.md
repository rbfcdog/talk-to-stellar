# 1. Adapter Interface Code

**Repo**: https://github.com/rbfcdog/talk-to-stellar — `main` — `bf9c55a`

## Code

| File | Lines |
|------|-------|
| `backend/src/api/services/usd-payout-adapters.ts` | 943 |
| `backend/src/api/services/usd-payout-coordination.service.ts` | 246 |
| `backend/src/api/services/international-transfer.service.ts` | 953 |
| `backend/src/api/routes/international-transfers.router.ts` | 23 |
| `backend/tests/payout-adapter-contract.test.ts` | 287 |

## Interface

```typescript
interface PayoutProviderAdapter {
  providerName: PayoutProviderName;
  getCapabilities(): PayoutProviderCapabilities;
  createPayoutInstruction(input: CreatePayoutInput): Promise<PayoutInstruction>;
  getPayoutStatus(providerPayoutId: string): Promise<PayoutStatus>;
  normalizeWebhookEvent?(payload): PayoutProviderEvent | null;
}
```

**Providers**: `circle` (live sandbox), `bridge` (compatibility), `etherfuse` (proof), `mock` (ops)

## Tests

```
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts

PASS — 8/8 tests
✓ Circle payload, Bridge payload, redaction, sandbox endpoint,
✓ status polling, provider rejection, webhook normalization
```

## Claim

TalkToStellar implements a provider-agnostic payout adapter contract. Builds USD payout instructions for Circle sandbox API execution (live verified), Bridge-compatible payloads, Etherfuse PIX proof, and mock evidence. Unknown providers are rejected without silent fallback.
