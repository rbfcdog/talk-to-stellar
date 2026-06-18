# Bridge.xyz MAINNET Integration

**Repo**: TalkToStellar · **Branch**: `main`

## Environment

```bash
BRIDGE_API_KEY=                              # Required for production
BRIDGE_API_URL=https://api.bridge.xyz/v0     # Production API
BRIDGE_ENABLED=true                          # Feature flag
BRIDGE_SANDBOX=false                         # false = mainnet
BRIDGE_DEVELOPER_FEE=0.30                    # Default developer fee %

BRIDGE_WEBHOOK_SECRET=                       # For verifying incoming webhooks
BRIDGE_WEBHOOK_PUBLIC_KEY=                   # Webhook public key
BRIDGE_WEBHOOK_ID=                           # Webhook endpoint ID
APP_PUBLIC_WEBHOOK_URL=                      # Public URL for webhook delivery

# Mainnet guardrails — ALL default to OFF for safety
BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=false
BRIDGE_REQUIRE_MANUAL_CONFIRMATION=true
BRIDGE_DEFAULT_SOURCE_CHAIN=base
BRIDGE_DEFAULT_SOURCE_CURRENCY=usdc
BRIDGE_DEFAULT_DESTINATION_CURRENCY=brl
BRIDGE_DEFAULT_DESTINATION_RAIL=pix
BRIDGE_MIN_BRL_AMOUNT=10
BRIDGE_MAX_BRL_AMOUNT=50000
BRIDGE_MIN_USDC_AMOUNT=5
BRIDGE_MAX_USDC_AMOUNT=10000
```

## Safety

- `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=false` by default — no real money moves
- All money-moving POSTs require `confirm_mainnet: true` in request body
- Amount limits enforced per request (min/max BRL, min/max USDC)
- Never expose API key to frontend — all calls go through backend
- PII masked in logs and UI (CPF, pix key, bank details)

## API Routes

All routes under `/api/bridge`. Require ops auth.

### Customers
```
POST   /customers                           Create customer
GET    /customers/:id                        Get customer
POST   /customers/:id/sync                   Sync from Bridge
GET    /customers/:id/kyc-link               Create KYC link
GET    /customers/:id/readiness              Check PIX readiness
```

### External Accounts (PIX)
```
POST   /customers/:id/external-accounts/pix-key    Add PIX key
GET    /customers/:id/external-accounts             List accounts
GET    /external-accounts/:externalAccountId         Get one
DELETE /external-accounts/:externalAccountId         Delete
```

### Liquidation Addresses (USDC → PIX)
```
POST   /customers/:id/liquidation-addresses/pix     Create (requires confirm_mainnet)
GET    /customers/:id/liquidation-addresses          List
GET    /customers/:id/liquidation-addresses/:id      Get one
```

### Transfers
```
POST   /transfers/crypto-to-pix                     Create (requires confirm_mainnet)
GET    /transfers/:transferId                        Get
POST   /transfers/:transferId/sync                   Sync status
```

### Exchange Rates
```
GET    /exchange-rates?from=usd&to=brl               Get rate
POST   /estimate                                     Estimate payout amount
```

### Virtual Accounts (PIX → USDC)
```
POST   /customers/:id/virtual-accounts/brl           Create BRL onramp
GET    /customers/:id/virtual-accounts                List
GET    /virtual-accounts/:virtualAccountId            Get one
```

## Files

| File | Purpose |
|------|---------|
| `backend/src/integrations/bridge/config.ts` | Config + mainnet guards |
| `backend/src/integrations/bridge/client.ts` | HTTP client |
| `backend/src/integrations/bridge/types.ts` | API type definitions |
| `backend/src/integrations/bridge/service.ts` | Service layer (customers, KYC, transfers, external accounts, liquidation, virtual accounts, exchange rates) |
| `backend/src/api/controllers/bridge.controller.ts` | HTTP request handlers |
| `backend/src/api/routes/bridge.router.ts` | Route definitions + middleware |
| `backend/src/api/middlewares/bridge-mainnet.middleware.ts` | Auth, mainnet gate, amount validation |
| `backend/src/api/routes/bridge-webhook.router.ts` | Webhook endpoint |
| `backend/src/api/controllers/bridge-webhook.controller.ts` | Webhook handler |
| `backend/src/api/services/bridge-pix-ach.service.ts` | PIX→ACH state machine |

## Flows

### USDC → PIX (off-ramp)
1. Create customer → check readiness (KYC, PIX endorsement)
2. Add PIX key as external account
3. Create liquidation address (reusable deposit)
4. User sends USDC to deposit address
5. Webhook fires → status updated → receipt generated

### PIX → USDC (on-ramp)
1. Create customer → create BRL virtual account
2. User sends PIX to virtual account's PIX key / BR Code
3. Bridge converts BRL → USDC → sends to destination wallet
4. Webhook fires → status updated → receipt generated

## Webhooks

Bridge sends webhooks to `APP_PUBLIC_WEBHOOK_URL/webhook/bridge`. Events: `customer.*`, `kyc_link.*`, `transfer.*`, `liquidation_address.*`, `virtual_account.*`, `external_account.*`. Signature: `t=<timestamp>,v0=<base64>` verified against `BRIDGE_WEBHOOK_PUBLIC_KEY`. Old timestamps (>10 min) rejected. Duplicate event IDs handled idempotently.
