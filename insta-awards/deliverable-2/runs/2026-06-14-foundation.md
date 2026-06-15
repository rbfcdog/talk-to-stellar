# D2 Foundation Run Report — 2026-06-14

## Scope

Payout adapter contract verification. All 8 tests pass against 4 provider adapters (Mock, Etherfuse, Circle, Bridge) plus the adapter registry and capabilities/event normalization surface.

## Test Execution

```
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
```

```
PASS tests/payout-adapter-contract.test.ts
  PayoutProviderAdapter contract
    ✓ creates an ops-only mock instruction when mock policy explicitly allows it
    ✓ creates an Etherfuse proof payload without claiming USD bank payout execution
    ✓ creates a Circle compatibility payload with sensitive account fields redacted
    ✓ creates a Bridge compatibility payload with sensitive account fields redacted
    ✓ sends executable destination details while persisting only redacted evidence
    ✓ polls Circle payout status with the default sandbox endpoint
    ✓ rejects unknown payout adapters instead of falling back to mock
    ✓ reports provider readiness and normalizes signed provider events

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

## Provider Coverage

| Provider | Mode | Status |
|----------|------|--------|
| Mock | Ops-only evidence | Passes when `ALLOW_OPS_MOCKS=true` and `ALLOW_MOCK_USD_PAYOUTS=true` |
| Etherfuse | PIX proof payload | Passes; generates sandbox payload without claiming USD bank payout |
| Circle | Compatibility + sandbox API | Passes; redacts account fields; executes live sandbox API when `ENABLE_REAL_PAYOUT_EXECUTION=true` |
| Bridge | Compatibility-only | Passes; redacts account fields including IBAN; labeled `mercury` destination |
| Registry (`getPayoutProviderAdapter`) | Rejects unknowns | Throws `unsupported payout provider` for typos |

## Redaction Verification

All adapters redact sensitive fields in persisted evidence while sending full details over the wire to the provider API (when `ENABLE_REAL_PAYOUT_EXECUTION=true`):

- `account_number` → `[REDACTED_LAST4:6789]`
- `routing_number` → `[REDACTED_LAST4:0021]`
- `iban` → `[REDACTED]`
- `destination.id` in provider response → `[REDACTED_HASH:...]`
- `account_holder_name` → `[REDACTED]`

## Source File Map

| File | Lines | Purpose |
|------|-------|---------|
| `backend/src/api/services/usd-payout-adapters.ts` | 943 | Adapter interface, all 4 providers, registry, capabilities, webhook normalization |
| `backend/tests/payout-adapter-contract.test.ts` | 264 | 8 contract tests covering all providers and redaction rules |
| `backend/src/api/services/international-transfer.service.ts` | 913 | Payout lifecycle orchestration (`createPayoutInstruction`, `refreshPayoutStatus`, `handlePayoutProviderEvent`) |
| `backend/src/api/routes/international-transfers.router.ts` | 22 | HTTP routes for payout operations |

## Current Gaps

| Gap | Impact |
|-----|--------|
| No real Stellar testnet settlement hash captured | D2 requires a `stellar_tx_hash` from a completed transfer |
| Circle sandbox credentials not configured in live env | Circle adapter runs in compatibility mode only; sandbox API call marked `execution_enabled: false` |
| Bridge provider access not confirmed | Bridge adapter is compatibility-only |
| No end-to-end payout instruction on a real transfer | `POST /api/transfers/:id/payout-instruction` and `GET /api/transfers/:id/payout-evidence` need a live DB with a completed settlement |
| No dashboard screenshot with payout evidence visible | Must capture when backend + frontend are running against a live transfer |

## What Needs a Real Transfer to Complete

1. Execute one BRL→USDC transfer through `POST /api/transfers` until `USDC_SETTLED` with a real Stellar testnet tx hash.
2. Create a payout instruction via `POST /api/transfers/:id/payout-instruction` (Circle compatibility or sandbox).
3. Refresh payout status or apply a signed provider webhook until `PAYOUT_COMPLETED`.
4. Export `/api/transfers/:id/payout-evidence` — reviewer artifact "Integracao Circle/Bridge" and "Payout Instructions".
5. Capture the Stellar tx hash from step 1 — reviewer artifact "Hash Transacao Stellar".
6. Follow `docs/insta-awards/deliverables/deliverable-2/SUBMISSION-CHECKLIST.md` for final assembly.

## Verification

```bash
npm --prefix backend run build                              # TypeScript compile
npm --prefix backend test -- --runInBand \
  tests/payout-adapter-contract.test.ts                     # 1 suite, 8 tests
```
