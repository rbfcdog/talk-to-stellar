# Bridge.xyz Environment Setup

All variables go in the Railway backend service → Variables tab.

---

## Required

| Variable | Value | Notes |
|---|---|---|
| `BRIDGE_API_KEY` | `your_bridge_api_key` | From Bridge dashboard → API Keys |
| `BRIDGE_ENABLED` | `true` | Enable the integration |

---

## Mainnet Money Movement (the error you're seeing)

By default **all money movement is disabled** as a safety guard. Set these to enable real transactions:

| Variable | Value | Notes |
|---|---|---|
| `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT` | `true` | **Unlocks virtual accounts, liquidation addresses, and transfers** |
| `BRIDGE_REQUIRE_MANUAL_CONFIRMATION` | `false` | Set `false` to skip needing `confirm_mainnet: true` in every request body, OR keep `true` and the frontend sends it automatically |

> **Error "Mainnet money movement is disabled"** → set `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true` on Railway.

---

## API & Environment

| Variable | Default | Notes |
|---|---|---|
| `BRIDGE_API_URL` | `https://api.bridge.xyz/v0` | Do not change unless Bridge gives you a different URL |
| `BRIDGE_SANDBOX` | `false` in prod | Set `true` to use Bridge sandbox (no real money) |

---

## Developer Fee

| Variable | Default | Notes |
|---|---|---|
| `BRIDGE_DEVELOPER_FEE` | `0.30` | Developer fee percentage charged on transfers |

---

## Default Chain & Currency

| Variable | Default | Notes |
|---|---|---|
| `BRIDGE_DEFAULT_SOURCE_CHAIN` | `stellar` | Default destination chain for on-ramp (set to `stellar` for USDC on Stellar) |
| `BRIDGE_DEFAULT_SOURCE_CURRENCY` | `usdc` | Default stablecoin |
| `BRIDGE_DEFAULT_DESTINATION_CURRENCY` | `brl` | Default fiat currency |
| `BRIDGE_DEFAULT_DESTINATION_RAIL` | `pix` | Default off-ramp rail |

> **Set `BRIDGE_DEFAULT_SOURCE_CHAIN=stellar`** — the current default is `base`, which is wrong for TalkToStellar.

---

## Transaction Limits

| Variable | Default | Notes |
|---|---|---|
| `BRIDGE_MIN_BRL_AMOUNT` | `10` | Minimum BRL per transaction (Bridge minimum) |
| `BRIDGE_MAX_BRL_AMOUNT` | `50000` | Maximum BRL |
| `BRIDGE_MIN_USD_AMOUNT` | `5` | Minimum USD |
| `BRIDGE_MAX_USD_AMOUNT` | `50000` | Maximum USD |
| `BRIDGE_MIN_EUR_AMOUNT` | `5` | Minimum EUR |
| `BRIDGE_MAX_EUR_AMOUNT` | `50000` | Maximum EUR |
| `BRIDGE_MIN_MXN_AMOUNT` | `100` | Minimum MXN (SPEI) |
| `BRIDGE_MAX_MXN_AMOUNT` | `1000000` | Maximum MXN |
| `BRIDGE_MIN_USDC_AMOUNT` | `5` | Minimum USDC for crypto transfers |
| `BRIDGE_MAX_USDC_AMOUNT` | `10000` | Maximum USDC |

---

## Webhooks (optional but recommended)

| Variable | Notes |
|---|---|
| `BRIDGE_WEBHOOK_SECRET` | Webhook signing secret from Bridge dashboard |
| `BRIDGE_WEBHOOK_PUBLIC_KEY` | Bridge's public key for signature verification |
| `BRIDGE_WEBHOOK_ID` | ID of the registered webhook |
| `APP_PUBLIC_WEBHOOK_URL` | Your public Railway URL + `/api/bridge/webhooks/incoming` |

---

## Complete `.env` file (copy this)

Paste into your Railway backend → Variables tab, or save as `backend/.env`:

```env
# ── Bridge.xyz ─────────────────────────────────────────────────────────
BRIDGE_API_KEY=<your_bridge_api_key_from_dashboard>

# Core flags
BRIDGE_ENABLED=true
BRIDGE_SANDBOX=false
BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true
BRIDGE_REQUIRE_MANUAL_CONFIRMATION=false

# API
BRIDGE_API_URL=https://api.bridge.xyz/v0
BRIDGE_DEVELOPER_FEE=0.30

# Defaults (Stellar USDC on-ramp)
BRIDGE_DEFAULT_SOURCE_CHAIN=stellar
BRIDGE_DEFAULT_SOURCE_CURRENCY=usdc
BRIDGE_DEFAULT_DESTINATION_CURRENCY=brl
BRIDGE_DEFAULT_DESTINATION_RAIL=pix

# Transaction limits
BRIDGE_MIN_BRL_AMOUNT=10
BRIDGE_MAX_BRL_AMOUNT=50000
BRIDGE_MIN_USD_AMOUNT=5
BRIDGE_MAX_USD_AMOUNT=50000
BRIDGE_MIN_EUR_AMOUNT=5
BRIDGE_MAX_EUR_AMOUNT=50000
BRIDGE_MIN_MXN_AMOUNT=100
BRIDGE_MAX_MXN_AMOUNT=1000000
BRIDGE_MIN_USDC_AMOUNT=5
BRIDGE_MAX_USDC_AMOUNT=10000

# Webhooks (fill in after registering in Bridge dashboard)
# BRIDGE_WEBHOOK_SECRET=whsec_...
# BRIDGE_WEBHOOK_PUBLIC_KEY=...
# BRIDGE_WEBHOOK_ID=...
# APP_PUBLIC_WEBHOOK_URL=https://your-backend.up.railway.app/api/bridge/webhooks/incoming
```

### Minimum (just to unblock everything)

```env
BRIDGE_API_KEY=<your_bridge_api_key>
BRIDGE_ENABLED=true
BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true
BRIDGE_DEFAULT_SOURCE_CHAIN=stellar
```

---

## KYC / PIX Access

Bridge requires you to request access for some rails:
- **PIX (BRL)** — email `sales@bridge.xyz` to request access
- **SEPA (EUR)** — included in standard access
- **ACH / Wire (USD)** — included in standard access
- **SPEI (MXN)** — email `sales@bridge.xyz` to request access

Once access is granted, customers also need the **PIX endorsement** (separate from base KYC) before BRL transactions work. The `/customers/:id/readiness` endpoint tells you if a customer is ready per rail.

---

## Stellar-Specific Notes

- **Stellar is a valid destination chain** for virtual accounts (on-ramp) — `payment_rail: "stellar"`, `currency: "usdc"`, `address: "G..."`
- **Off-ramp** (USDC → fiat): when the user sends USDC from Stellar to Bridge, they MUST include the memo provided in `source_deposit_instructions.blockchain_memo`
- Bridge also provides a **muxed address (M-address)** as `memoless_address` — senders who can't include a memo can use that instead
- The `blockchain_memo` on the virtual account destination is **required by Bridge** when `payment_rail` is `stellar` — the backend auto-generates a 7-digit numeric memo if you don't supply one
