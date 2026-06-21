# SCF Integration Suite — Setup Summary

All 16 integrations can be tested live at `/scf-integrations`. This document covers API keys, where to get them, and which database migrations to run.

---

## Migrations — run in order

```bash
# Core schema (must be first)
psql $DATABASE_URL < backend/migrations/20260613_00_full_schema.sql

# Ops auth
psql $DATABASE_URL < backend/migrations/20260614_00_ops_admin_auth.sql

# Bridge fiat rails
psql $DATABASE_URL < backend/migrations/20260618_00_bridge_tables.sql
psql $DATABASE_URL < backend/migrations/20260618_01_user_stellar_wallets.sql
psql $DATABASE_URL < backend/migrations/20260618_02_bridge_custodial_wallets.sql
psql $DATABASE_URL < backend/migrations/20260618_03_bridge_va_cache.sql

# SEP-24 anchor sessions + wallet auth sessions
psql $DATABASE_URL < backend/migrations/20260620_00_sep24_wallet_auth.sql

# Payment links + passkey wallets
psql $DATABASE_URL < backend/migrations/20260620_01_integrations.sql
```

Each file has a `-- Run after:` comment at the top confirming the order.

---

## API Keys & Environment Variables by Integration

### 1. Abroad Finance — USDC→PIX

| Variable | Required for | Where to get |
|---|---|---|
| `ABROAD_PARTNER_API_KEY` | Quotes + send transactions | Contact [abroad.finance](https://abroad.finance) — request partner access |
| `ABROAD_API_URL` | — | Defaults to `https://api.abroad.finance` |

Corridor listing and PIX QR decode work without a key.

---

### 2. SEP-24 Anchor (Hosted Deposit/Withdrawal)

No API key needed. Uses anchors registered in `stellar.toml` files. The following Stellar env vars must be set:

```env
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_WALLET_SPONSOR_SECRET=S...  # must have enough XLM for trustlines
```

Anchor sessions (SEP-10 JWTs) are stored in the `anchor_sessions` table from migration `20260620_00_sep24_wallet_auth.sql`.

---

### 3. Stellar Broker (DEX Aggregator)

No API key needed. Uses Horizon SDEX and classic AMMs directly.

```env
STELLAR_HORIZON_URL=https://horizon.stellar.org
```

---

### 4. Blend v2 (Lending/Borrowing)

No API key needed. Reads pool contracts on-chain via Horizon/Soroban RPC.

```env
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
```

---

### 5. DeFindex (Yield Vaults)

| Variable | Required for | Where to get |
|---|---|---|
| `DEFINDEX_API_KEY` | Vault health + indexer queries | [app.defindex.io](https://app.defindex.io) — free tier available |
| `DEFINDEX_USDC_VAULT` | Default vault contract | From [app.defindex.io](https://app.defindex.io) or use `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW` (mainnet default) |
| `DEFINDEX_NETWORK` | — | `mainnet` or `testnet` |

```env
DEFINDEX_API_KEY=your-key
DEFINDEX_USDC_VAULT=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW
DEFINDEX_NETWORK=mainnet
```

---

### 6. Aquarius (AMM + Liquidity Rewards)

No API key needed. Public reward API at `https://reward-api.aqua.network`.

---

### 7. Soroswap (DEX + Aggregator)

No API key needed. Uses `https://api.soroswap.finance` — occasionally down upstream.

```env
SOROSWAP_API_URL=https://api.soroswap.finance  # default
SOROSWAP_DEFAULT_SLIPPAGE_BPS=50
```

---

### 8. Allbridge Core (Cross-Chain Stablecoins)

No API key needed for querying Stellar tokens. SDK usage (`@allbridge/bridge-core-sdk`) requires a configured wallet.

Note: Allbridge IP-restricts some endpoints. If `/api/allbridge/stellar-tokens` returns a note, it's expected.

---

### 9. Axelar (60+ Chain Bridge)

No API key needed. Uses `https://api.axelarscan.io` (mainnet) or `https://testnet.axelarscan.io`.

---

### 10. CCTP — Circle Cross-Chain Transfer Protocol

| Variable | Required for | Where to get |
|---|---|---|
| `CCTP_STELLAR_CONTRACT_ADDRESS` | Stellar receiver contract | [github.com/circlefin/stellar-cctp](https://github.com/circlefin/stellar-cctp) — deploy or use published address |

CCTP reads Stellar via Horizon and ETH via Etherscan/Circle APIs — no private API key needed for status queries.

---

### 11. Near Intents (Near Protocol Bridge)

No API key needed. Uses `https://solver-relay-v2.chaindefuser.com`.

---

### 12. Stellar Wallets Kit

No API key needed. Install with:
```bash
npm install @creit.tech/stellar-wallets-kit
```

WalletConnect integration (optional) requires a WalletConnect project ID from [cloud.walletconnect.com](https://cloud.walletconnect.com).

---

### 13. Passkey Wallets (Soroban Smart Wallets)

| Variable | Required for | Where to get |
|---|---|---|
| `LAUNCHTUBE_JWT` | Fee-sponsored transaction relay | [launchtube.xyz](https://launchtube.xyz) — request access |
| `LAUNCHTUBE_URL` | — | `https://launchtube.xyz` (mainnet) or `https://launchtube.xyz/testnet` |

Passkey wallet registrations are stored in the `passkey_wallets` table from migration `20260620_01_integrations.sql`.

```env
LAUNCHTUBE_JWT=your-jwt
LAUNCHTUBE_URL=https://launchtube.xyz
```

---

### 14. SEP-10 Wallet Auth

No API key needed. Signs challenges from anchor `stellar.toml`. Uses `STELLAR_WALLET_SPONSOR_SECRET` for signing.

Auth sessions stored in `wallet_auth_sessions` table (migration `20260620_00_sep24_wallet_auth.sql`).

---

### 15. Reflector Oracle (On-Chain Prices)

No API key needed. Free public oracle on Stellar mainnet.

Supported assets: `XLM`, `BRL`, `USDC`, `ETH`, `BTC`, and others — see [reflector.network](https://reflector.network).

---

### 16. Stellar Network + TRM Fraud Screen

| Variable | Required for | Where to get |
|---|---|---|
| `TRM_API_KEY` | Wallet risk scoring | [trmlabs.com](https://trmlabs.com) — request API access |
| `TRM_API_URL` | — | Defaults to `https://api.trmlabs.com/public/v1` |

Network stats use `STELLAR_HORIZON_URL` only.

```env
TRM_API_KEY=your-key
```

Without `TRM_API_KEY`, the fraud screen section shows a config error but network stats still work.

---

## Quick Reference — which integrations need API keys

| Integration | API Key Needed | Key Variable |
|---|---|---|
| Abroad Finance | Yes (for quotes/send) | `ABROAD_PARTNER_API_KEY` |
| SEP-24 Anchor | No | — |
| Stellar Broker | No | — |
| Blend v2 | No | — |
| DeFindex | Yes | `DEFINDEX_API_KEY` |
| Aquarius | No | — |
| Soroswap | No | — |
| Allbridge | No | — |
| Axelar | No | — |
| CCTP | No | — |
| Near Intents | No | — |
| Stellar Wallets Kit | No (optional WC) | — |
| Passkey Wallets | Yes (relay) | `LAUNCHTUBE_JWT` |
| SEP-10 Wallet Auth | No | — |
| Reflector Oracle | No | — |
| Stellar Network | No | — |
| TRM Fraud Screen | Yes | `TRM_API_KEY` |

**Paid keys:** Abroad Finance (partner), DeFindex (free tier), Launchtube (request), TRM Labs (request).
