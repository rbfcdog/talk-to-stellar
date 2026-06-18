# Bridge.xyz MAINNET Integration Plan

**Repo**: TalkToStellar · **Branch**: `main` · **Status**: Building

## Existing Bridge Code

The repo already has a functional Bridge integration:
- `backend/src/integrations/bridge/` — config, client, types, service (385 lines)
- `backend/src/api/services/bridge-pix-ach.service.ts` — PIX→ACH state machine (357 lines)
- `backend/src/api/routes/bridge-webhook.router.ts` — webhook endpoint
- `backend/src/api/controllers/bridge-webhook.controller.ts` — webhook handler
- `backend/tests/bridge-webhook.controller.test.ts` — webhook tests

## What We're Adding

1. **Mainnet safety guards** — `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT`, amount limits, manual confirmation
2. **Customer API** — `/api/bridge/customers/*` (CRUD, readiness, KYC/ToS links)
3. **External accounts** — Pix key + BR Code creation
4. **Liquidation addresses** — USDC→Pix reusable deposit addresses
5. **Transfers** — crypto-to-pix, pix-to-usdc one-time transfers
6. **Exchange rates** — estimate endpoints
7. **Virtual accounts** — BRL onramp
8. **Tests** — contract tests for all new routes

## Files to Create/Modify

| File | Action |
|------|--------|
| `backend/src/integrations/bridge/config.ts` | Add mainnet guards |
| `backend/src/api/routes/bridge.router.ts` | NEW — customer/external/liquidation/transfer/rates routes |
| `backend/src/api/controllers/bridge.controller.ts` | NEW — all Bridge API controllers |
| `backend/src/api/middlewares/bridge-mainnet.middleware.ts` | NEW — money movement guard |
| `backend/tests/bridge.routes.test.ts` | NEW — route tests |
| `docs/bridge-mainnet.md` | NEW — documentation |
| `backend/.env.example` | Update with new vars |

## Safety

- `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=false` (default)
- `BRIDGE_REQUIRE_MANUAL_CONFIRMATION=true` (default)
- All money-moving POSTs require `confirm_mainnet: true`
- Never expose API key to frontend
- All PII masked in logs/UI
