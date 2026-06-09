# Bridge.xyz Integration Plan for TalkToStellar

## Overview

Replace the current Etherfuse (sandbox) PIX integration with Bridge.xyz for production-ready PIX on/off-ramp, and add USD ACH off-ramp capabilities.

## Current State → Target State

```
CURRENT (Etherfuse Sandbox)         TARGET (Bridge Production)
─────────────────────────────       ────────────────────────────
PIX → TESOURO → Stellar             PIX → USDC → Stellar (native)
Stellar → TESOURO → PIX             Stellar → USDC → PIX
(none)                              Stellar → USDC → ACH (USD bank)
(none)                              US bank → ACH → USDC → Stellar
Etherfuse KYC                       Bridge KYC (hosted or API)
Manual fee calculation              developer_fee_percent built-in
```

## Files to Modify

### Backend

| File | Change |
|---|---|
| `backend/src/api/services/anchor.service.ts` | Replace Etherfuse calls with Bridge API |
| `backend/src/api/services/pix-ramp.service.ts` | New: Bridge PIX on/off-ramp orchestration |
| `backend/src/api/services/bridge.service.ts` | New: Bridge API client (auth, customers, transfers) |
| `backend/src/api/services/payout-adapter.service.ts` | Add Bridge ACH off-ramp adapter |
| `backend/src/api/controllers/ramp.controller.ts` | Update PIX ramp endpoints for Bridge |
| `backend/src/api/agent/tools.ts` | Update PIX tools to use Bridge service |
| `backend/src/api/agent/graph.ts` | Update intent routing for Bridge flows |
| `backend/.env.example` | Add Bridge config vars |

### Frontend

| File | Change |
|---|---|
| `frontend/app/pix-ramp/` | Update PIX ramp UI for Bridge flow |
| `frontend/lib/pix-ramp-utils.ts` | Update for Bridge API responses |
| `frontend/components/` | Add US bank account input component |

### Environment Variables (New)

```bash
BRIDGE_API_KEY=          # Bridge API key
BRIDGE_API_URL=https://api.bridge.xyz/v0
BRIDGE_WEBHOOK_SECRET=   # For verifying webhook signatures
BRIDGE_ENABLED=true       # Feature flag
BRIDGE_DEVELOPER_FEE=0.30 # Default developer fee %
```

## Phase 1: PIX On-Ramp (BRL → USDC on Stellar)

### Flow
1. User says "colocar 100 reais via PIX" on WhatsApp/Telegram/Web
2. Agent routes to PIX on-ramp intent
3. Backend creates Bridge customer (or maps existing)
4. Backend creates Bridge Virtual Account (BRL → USDC on Stellar)
5. User receives PIX key/QR to send money to
6. Bridge webhook notifies deposit received
7. Bridge auto-converts BRL → USDC, sends to Stellar wallet
8. User receives confirmation + receipt

### API Calls
```
POST /v0/customers                    → create or get customer
POST /v0/customers/{id}/virtual_accounts → create PIX deposit address
GET  /v0/virtual_accounts/{id}/activity  → check deposit status (or webhook)
```

### Backend Service (bridge.service.ts)
```typescript
class BridgeService {
  async createCustomer(userId: string, kycData: CustomerKYC): Promise<string>
  async getCustomer(customerId: string): Promise<BridgeCustomer>
  async createPixVirtualAccount(customerId: string, stellarAddress: string): Promise<VirtualAccount>
  async getVirtualAccountActivity(accountId: string): Promise<Activity[]>
  async handleWebhook(event: BridgeWebhookEvent): Promise<void>
}
```

## Phase 2: PIX Off-Ramp (USDC → BRL via PIX)

### Flow
1. User says "sacar 100 reais para meu PIX"
2. Agent routes to PIX off-ramp intent
3. Backend creates/finds Bridge External Account (PIX key)
4. Backend creates Bridge Transfer (Stellar USDC → PIX BRL)
5. User confirms with PIN
6. Transfer executes, funds sent via PIX
7. User receives receipt

### API Calls
```
POST /v0/customers/{id}/external_accounts → add PIX key
POST /v0/transfers                         → create off-ramp transfer
GET  /v0/transfers/{id}                     → track status
```

## Phase 3: USD ACH Off-Ramp

### Flow
1. User adds US bank account (routing + account number)
2. User says "send 100 dollars to my bank"
3. Backend creates Bridge Transfer (Stellar USDC → USD ACH)
4. User confirms with PIN
5. USD sent to bank account via ACH

## KYC Strategy

Bridge handles KYC via:
- **Hosted KYC Link**: `POST /v0/customers/{id}/kyc_links` → send URL to user
- **API KYC**: Submit CPF, selfie, documents directly via API

TalkToStellar can use either:
- **Option A**: Hosted link — simpler, Bridge handles UI
- **Option B**: API — TalkToStellar builds KYC UI, collects data, submits to Bridge

For WhatsApp/Telegram, Option A (hosted link sent in chat) is simpler.

## Webhook Handling

Bridge sends webhooks for:
- `transfer.completed` — on/off-ramp complete
- `transfer.failed` — on/off-ramp failed
- `virtual_account.deposit_received` — PIX payment arrived

Webhook endpoint: `POST https://talk-to-stellar-backend.up.railway.app/webhook/bridge`

Verify signature: `X-Bridge-Signature` header using `BRIDGE_WEBHOOK_SECRET`

## Fee Model

| Operation | Bridge Fee | TalkToStellar Fee | User Pays |
|---|---|---|---|
| PIX → USDC | Bridge fee (~0.5% est.) | 0.30% developer_fee | Combined fee |
| USDC → PIX | Bridge fee | 0.30% developer_fee | Combined fee |
| USDC → ACH | Bridge fee | 0.30% developer_fee | Combined fee |

Bridge's `developer_fee_percent` is automatically deducted from the transfer amount and sent to TalkToStellar's configured fee account.

## Migration Path

1. Deploy Bridge integration alongside Etherfuse (feature flag `BRIDGE_ENABLED`)
2. New users go through Bridge flow
3. Existing users migrate: re-KYC via Bridge, transfer balances
4. Once migrated, remove Etherfuse integration
5. Clean up TESOURO-specific code, use standard USDC

## Open Questions

- [ ] Bridge PIX processing time (real-time vs batch?)
- [ ] Bridge fees for BRL ↔ USDC (need pricing sheet)
- [ ] Does Bridge require prefunding for instant settlement?
- [ ] Can Bridge Virtual Accounts use fixed PIX keys (not random)?
- [ ] Bridge support for Brazilian phone number verification?
- [ ] Sandbox availability for PIX testing?
