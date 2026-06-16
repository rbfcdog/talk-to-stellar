# 1. Adapter Interface Code

Repo: https://github.com/rbfcdog/talk-to-stellar · branch `main` · commit `c105d1b`

The payout adapter lives in `backend/src/api/services/usd-payout-adapters.ts` (943 lines). Every provider implements the same contract:

```typescript
interface PayoutProviderAdapter {
  providerName: PayoutProviderName;
  getCapabilities(): PayoutProviderCapabilities;
  createPayoutInstruction(input): Promise<PayoutInstruction>;
  getPayoutStatus(providerPayoutId: string): Promise<PayoutStatus>;
  normalizeWebhookEvent?(payload): PayoutProviderEvent | null;
}
```

We have four adapters: **circle** (live sandbox, sends real payouts), **bridge** (builds payloads, waiting for provider access), **etherfuse** (PIX proof path), and **mock** (for ops testing). Calling `getPayoutProviderAdapter('circle')` returns the right one — unknown names throw instead of silently falling back to mock.

Supporting files: `usd-payout-coordination.service.ts` (evidence builder, 246 lines), `international-transfer.service.ts` (transfer-to-payout wiring, 953 lines), `international-transfers.router.ts` (HTTP routes, 23 lines).

Tests: `payout-adapter-contract.test.ts` (287 lines, 8 tests). Run with `npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts`. All pass — covers payload construction, redaction of bank details, sandbox endpoint selection, Circle status polling, rejecting bad providers, and webhook normalization.
