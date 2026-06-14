# ENVIRONMENTS.md — Setup & Configuration

> **Living document.** Updated when env vars are added, removed, or changed.

## Environments

| Environment | Stellar Network | PIX | KYC | Payouts |
|-------------|----------------|-----|-----|---------|
| Local dev | Testnet | Etherfuse sandbox (simulated) | Auto-approved | Mock |
| Production | Mainnet | Etherfuse production | Real KYC | Real (Circle/Bridge) |

## Running Locally

```bash
# Backend
cd backend
cp .env.example .env   # Or use existing .env
npm install
npm run dev             # nodemon on port 3001

# Frontend
cd frontend
npm install
npm run dev             # port 3000

# Env helpers from repo root
npm run env:generate -- --write-dir .env.generated
npm run passkey:env -- --origin http://localhost:3000

# Evolution (WhatsApp) — separate service
# Running on Railway or locally on port 8080

# Start all (Docker)
docker-compose up
```

## Required Environment Variables

### Backend Core
```
SUPABASE_URL                       # https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY          # service_role key for admin ops
SUPABASE_ANON_KEY                  # anon key for public ops
JWT_SECRET                         # JWT signing secret
OPENAI_API_KEY                     # GPT-4o
OPENAI_MODEL=gpt-4o
```

### Frontend Proxy
```
BACKEND_URL                        # Server-side Next.js rewrites/proxies to backend, including /ops
NEXT_PUBLIC_BACKEND_URL            # Browser-visible fallback for client/API proxy routes
```

### Stellar
```
STELLAR_NETWORK=TESTNET            # TESTNET or MAINNET
STELLAR_HORIZON_URL                # Horizon endpoint
STELLAR_FRIENDBOT_URL              # Testnet funding
USDC_ISSUER                        # USDC issuer public key
STELLAR_MAINNET_ENABLED=false      # Mainnet feature flag
```

### Etherfuse (PIX)
```
ETHERFUSE_API_KEY                  # format: api_<env>:<key>:<org_id>
ETHERFUSE_BASE_URL                 # https://api.sand.etherfuse.com
ETHERFUSE_WEBHOOK_SECRET           # Webhook validation
ENABLE_BRL_ASSET=true              # Enable BRL/TESOURO
```

### Evolution (WhatsApp)
```
EVOLUTION_API_URL                  # http://localhost:8080 or Railway URL
EVOLUTION_API_KEY                  # Evolution instance API key
EVOLUTION_INSTANCE=main
```

### Defindex (Investments)
```
DEFINDEX_API_KEY
DEFINDEX_BASE_URL                  # https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_USDC_VAULT                # Vault contract address
DEFINDEX_CETES_VAULT               # Vault contract address
```

### Fees
```
TALKTOSTELLAR_SPREAD_BPS=30        # Platform spread in basis points
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY  # Admin fee wallet
```

### Payout (USD)
```
PAYOUT_PROVIDER=circle             # mock/circle/bridge/etherfuse
ENABLE_REAL_PAYOUT_EXECUTION=false
INTERNATIONAL_TRANSFER_OPS_SECRET  # Internal ops API auth
CIRCLE_API_KEY                     # Circle Mint API key
CIRCLE_ENVIRONMENT=sandbox         # sandbox/prod; derives default Circle API base URL
CIRCLE_API_BASE_URL                # Optional override
CIRCLE_PAYOUT_DESTINATION_ID       # Required for Circle sandbox/live execution; linked bank account ID
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
CIRCLE_SOURCE_WALLET_ID            # Optional Circle source wallet override
CIRCLE_PAYOUT_CREATE_URL           # Optional override for POST /v1/businessAccount/payouts
CIRCLE_PAYOUT_STATUS_URL           # Optional override for GET /v1/businessAccount/payouts/{id}
CIRCLE_PAYOUT_WEBHOOK_SECRET       # Optional provider-specific webhook secret
PAYOUT_WEBHOOK_SECRET              # Shared fallback webhook secret
PAYOUT_PROVIDER_TIMEOUT_MS=30000
```

Circle setup runbook: `backend/docs/CIRCLE_INTEGRATION_SETUP.md`.

### Ops Dashboard (D1)
```
OPS_ADMIN_LOGIN                    # DB-backed operator login to bootstrap through migration
OPS_ADMIN_PASSWORD_HASH            # Generated with npm --prefix backend run ops:hash-password
OPS_ADMIN_SESSION_HOURS=8          # HTTP-only dashboard session cookie lifetime, max 24h
OPS_ADMIN_MAX_FAILED_ATTEMPTS=5    # Lock account after repeated failures
OPS_ADMIN_LOCK_MINUTES=15          # Lock duration after max failures
OPS_DASHBOARD_TOKEN                # Compatibility token for JSON API clients only
TRANSFER_API_TOKEN                 # Optional token accepted by D1 JSON transfer API
LOG_FILE                           # File logging output path
LOG_LEVEL=info                     # trace/debug/info/warn/error
STELLAR_WATCHER_INTERVAL_MS=10000  # Poll cadence for CONVERTING transfers
STELLAR_WATCHER_MAX_ATTEMPTS=60    # Fail after this many watcher windows
```

Bootstrap the first dashboard admin:

```bash
read -rs OPS_ADMIN_PASSWORD
export OPS_ADMIN_PASSWORD
export OPS_ADMIN_PASSWORD_HASH="$(npm --prefix backend run ops:hash-password --silent)"
export OPS_ADMIN_LOGIN="admin@example.com"
DATABASE_URL=postgresql://... npm --prefix backend run migrate:required
unset OPS_ADMIN_PASSWORD OPS_ADMIN_PASSWORD_HASH
```

## Migrations

```bash
# Apply the complete schema bootstrap from a trusted admin environment
cd backend
DATABASE_URL=postgresql://... npm run migrate:required
```

`backend/migrations/20260613_00_full_schema.sql` is the bootstrap schema source and includes the D1 lifecycle tables/RPCs. `backend/migrations/20260614_00_ops_admin_auth.sql` adds the DB-backed ops admin login as plain SQL for Supabase SQL Editor compatibility. The migration runner applies required SQL files in sorted order and can create or rotate the first admin after the migrations when `OPS_ADMIN_LOGIN` and `OPS_ADMIN_PASSWORD_HASH` are set. There is no generic rollback SQL; take a backup before applying to an existing database.

## Ports

| Service | Port |
|---------|------|
| Backend | 3001 |
| Frontend | 3000 |
| Evolution | 8080 |
| BlindPay server | 3333 |
| DentPeg server | 3334 |

## Feature Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `STELLAR_MAINNET_ENABLED` | false | Block mainnet operations |
| `ENABLE_MAINNET_SETTLEMENT_VALIDATION` | false | Block mainnet settlement |
| `ENABLE_REAL_PAYOUT_EXECUTION` | false | Block real USD payouts |
| `ENABLE_BRL_ASSET` | true | Enable BRL/TESOURO asset |
| `INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX` | true | Use mock PIX for dev |
| `ALLOW_OPS_MOCKS` | true | Allow mock payouts |
| `OPS_ADMIN_LOGIN` | unset | Admin login used by migration bootstrap for `/ops/login` |
| `OPS_ADMIN_PASSWORD_HASH` | unset | Scrypt hash generated by `npm --prefix backend run ops:hash-password` |
| `OPS_DASHBOARD_TOKEN` | unset | Compatibility token for JSON API clients; browser `/ops` entry uses `/ops/login` |
| `TRANSFER_API_TOKEN` | unset | Optional API-key alias for normalized transfer API |
