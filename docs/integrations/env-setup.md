# Environment Setup

All environment variables for the Talk to Stellar backend. Copy `.env.example` as a starting point.

Variables marked **Required** will crash the server or silently break features if missing. Optional variables have sensible defaults.

---

## Frontend testing panel

All Stellar integrations can be tested live at:

```
http://localhost:3000/ecosystem-test
```

This page hits every integration endpoint and shows live results — network stats, oracle prices, Aquarius rewards, BRL stablecoins, Abroad Finance PIX corridor, Soroswap DEX quotes, CCTP chains, fraud screening, and the full ecosystem overview for any Stellar address.

Master aggregator endpoint (all integrations in one call):
```
GET /api/ecosystem/:stellarAddress
```

---

## Core (always required)

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Auth
JWT_SECRET=long-random-string-min-32-chars
PIN_PEPPER=another-long-random-string

# Server
PORT=3001
NODE_ENV=production
```

---

## WhatsApp — Evolution API (required for all messaging)

The entire user-facing product runs through Evolution. Without this, no WhatsApp messages are sent or received.

```env
EVOLUTION_API_URL=https://your-evolution-instance.example.com
EVOLUTION_INSTANCE=your-instance-name
EVOLUTION_API_KEY=your-api-key
PUBLIC_BACKEND_URL=https://your-backend.example.com   # Evolution calls this for webhooks
EVOLUTION_AGENT_URL=http://127.0.0.1:3001/api/agent/query  # defaults to internal
EVOLUTION_WEBHOOK_SECRET=                              # optional — validates inbound webhooks
EVOLUTION_AGENT_TIMEOUT_MS=120000
EVOLUTION_CONTENT_DEDUPE_TTL_MS=90000
```

---

## AI Agent (required for chatbot functionality)

```env
OPENAI_API_KEY=sk-...
AGENT_INGEST_SECRET=change-me   # shared secret bots present when posting to /api/agent/query
```

---

## Stellar (required)

```env
STELLAR_NETWORK=testnet          # testnet | mainnet | public
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_WALLET_SPONSOR_SECRET=S...  # funded account, ~2 XLM per wallet created
```

Mainnet values:
```env
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
```

---

## Bridge.xyz — Fiat Anchor (required for PIX/ACH/SEPA/SPEI)

Request API access at `sales@bridge.xyz`. Dashboard: `https://dashboard.bridge.xyz`.

```env
BRIDGE_API_KEY=your-bridge-api-key
BRIDGE_API_URL=https://api.bridge.xyz/v0   # default — no need to set
BRIDGE_WEBHOOK_SECRET=your-webhook-secret
BRIDGE_WEBHOOK_PUBLIC_KEY=                 # alternative webhook verification
BRIDGE_WEBHOOK_ID=                         # ID of the registered webhook in Bridge dashboard
APP_PUBLIC_WEBHOOK_URL=https://your-backend.example.com  # Bridge calls /webhook/bridge here

# Feature flags (all default to safe/off)
BRIDGE_ENABLED=true
BRIDGE_SANDBOX=true                        # set false for live money movement
BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=false # explicit guard for production
BRIDGE_REQUIRE_MANUAL_CONFIRMATION=false

# Per-rail limits
BRIDGE_DEVELOPER_FEE=0.30
BRIDGE_MIN_BRL_AMOUNT=10
BRIDGE_MAX_BRL_AMOUNT=50000
BRIDGE_MIN_USDC_AMOUNT=5
BRIDGE_MAX_USDC_AMOUNT=10000
```

---

## DeFindex Yield (optional — needed for `/api/defindex`)

Free tier available. Get API key at `https://app.defindex.io`.

```env
DEFINDEX_API_KEY=your-api-key
DEFINDEX_API_URL=https://api.defindex.io    # default
DEFINDEX_NETWORK=testnet                    # testnet | mainnet
DEFINDEX_TIMEOUT_MS=30000

# Execution guards
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_COMPLIANCE_APPROVED=false
DEFINDEX_ALLOW_MAINNET_EXECUTION=false

# Vault contract addresses (create/find at app.defindex.io)
DEFINDEX_USDC_VAULT=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW
DEFINDEX_CETES_VAULT=                       # optional
DEFINDEX_XLM_VAULT=                         # optional
```

---

## Passkey Smart Wallets (optional — needed for `/api/passkey-wallets`)

Get JWT from `https://launchtube.xyz`.

```env
LAUNCHTUBE_JWT=your-launchtube-jwt
LAUNCHTUBE_URL=https://launchtube.xyz       # or https://launchtube.xyz/testnet
```

---

## Soroswap DEX Aggregator (optional)

No API key needed — works immediately.

```env
SOROSWAP_API_URL=https://api.soroswap.finance   # default — no need to set
SOROSWAP_DEFAULT_SLIPPAGE_BPS=50                # 0.5% default slippage
```

---

## Reflector Oracle (optional)

No API key needed — free public oracle.

```env
# No env vars needed. Automatically uses STELLAR_NETWORK to select Horizon fallback.
```

---

## CCTP Cross-Chain Bridge (optional)

```env
CCTP_STELLAR_CONTRACT_ADDRESS=C...  # Stellar receiver contract from circlefin/stellar-cctp
# Mainnet contract: check https://github.com/circlefin/stellar-cctp for current address
# testnet: iris-api-sandbox.circle.com used automatically
```

---

## Abroad Finance — USDC→PIX (optional — needed for `/api/abroad`)

Free corridor lookup requires no key. Partner API key needed for initiating settlements.

```env
ABROAD_API_URL=https://api.abroad.finance      # default — no need to set
ABROAD_PARTNER_API_KEY=                        # required for /api/abroad/quote and POST /transaction
                                               # request access at abroad.finance
```

Without `ABROAD_PARTNER_API_KEY`:
- `GET /api/abroad/corridors` — works, returns all USDC→PIX corridors
- `POST /api/abroad/decode-pix` — works, decodes any Brazilian PIX QR code
- `GET /api/abroad/quote` — returns null (no API key)

---

## Aquarius DeFi Rewards (no env vars needed)

Public reward API — no authentication required.

```env
# No env vars needed. Automatically queries https://reward-api.aqua.network/api/rewards/
```

---

## Stellar Network Stats (no env vars needed)

Uses the `STELLAR_HORIZON_URL` already configured above.

---

## Passkeys / WebAuthn (for the existing `/api/passkeys` biometric auth, not Soroban wallets)

```env
PASSKEY_RP_ID=your-domain.com              # must match the HTTPS origin exactly
PASSKEY_ORIGIN=https://your-domain.com
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_USER_VERIFICATION=preferred
```

---

## Platform Fees & Conversion

```env
TALKTOSTELLAR_SPREAD_BPS=30                # 0.30% platform fee on conversions
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=     # treasury account (optional — disables spread if unset)
QUOTE_TTL_SECONDS=30                       # quote expiry
```

---

## Assets

```env
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5  # testnet
# Mainnet USDC issuer: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN

ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4

TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM
```

---

## Frontend URLs

```env
FRONTEND_URL=http://localhost:3000
CREATE_ACCOUNT_BASE=http://localhost:3000
PAYMENT_CONFIRM_BASE=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001   # base for payment link short URLs
```

---

## Daily Summary & Alerts

```env
ENABLE_DAILY_SUMMARY=true
DAILY_SUMMARY_TIMEZONE=America/Sao_Paulo
DAILY_SUMMARY_HOUR_LOCAL=9
```

---

## CORS & Rate Limits

```env
CORS_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
SENSITIVE_RATE_LIMIT_MAX=30
LOG_LEVEL=info
```

---

## Ops Dashboard

```env
OPS_ADMIN_LOGIN=admin
OPS_ADMIN_PASSWORD_HASH=   # generate with: npm run ops:hash-password
OPS_DASHBOARD_TOKEN=
OPS_ADMIN_SESSION_HOURS=8
```

---

## Minimum to boot locally

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=dev-secret-minimum-32-chars
STELLAR_NETWORK=testnet
STELLAR_WALLET_SPONSOR_SECRET=S...
EVOLUTION_API_URL=https://your-evolution.example.com
EVOLUTION_INSTANCE=your-instance
EVOLUTION_API_KEY=your-key
PUBLIC_BACKEND_URL=https://your-ngrok-url.ngrok.io
OPENAI_API_KEY=sk-...
AGENT_INGEST_SECRET=dev-secret
```

Bridge, DeFindex, and Passkey Wallets are all additive — the server boots without them, those routes just return errors until keys are configured.
