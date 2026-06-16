# 3. Circle / Bridge Integration

**Repo**: https://github.com/rbfcdog/talk-to-stellar — `main` — `bf9c55a`

## Circle — Live Sandbox Verified

| Field | Value |
|-------|-------|
| Wallet | `1017459986` — active |
| Wire destination | BANK OF AMERICA, NA ****1098 |
| Destination ID (last 4) | a4b3 |
| API key | SAND_API_KEY — authenticated |
| Payout endpoint | `POST /v1/businessAccount/payouts` |
| Test result | HTTP 201 — payout created + completed |

```
Circle sandbox payout:
  Wallet:   1017459986
  Wire:     089797c5-0a8e-466a-a0c3-ce54f3c3a4b3
  Bank:     BANK OF AMERICA, N.A., NY ****1098
  Amount:   $10.00
  Status:   completed
  Adapter:  backend/src/api/services/usd-payout-adapters.ts:525
```

## E2E Test

```bash
npm run circle:e2e
# Funds wallet → polls settlement → dispatches payout → verifies completion
```

## Bridge

Bridge adapter exists at `usd-payout-adapters.ts:340` (compatibility mode). Builds correct Bridge payloads. Live execution pending provider credentials.

## Adapter Code

`backend/src/api/services/usd-payout-adapters.ts:525-690` — `CircleCompatibilityAdapter`

## Claim

TalkToStellar executed a Circle sandbox wire payout via `POST /v1/businessAccount/payouts`. Circle returned HTTP 201 with a payout ID. The wallet was funded via mock wire deposit and the payout completed. Bridge compatibility payloads are ready pending provider access.
