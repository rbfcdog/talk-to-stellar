# Yield — Environment Variables

All env vars needed to run DeFindex yield and the auto-yield sweep.

---

## DeFindex SDK

```env
# Required to call the DeFindex API (XDR building, APY, balances)
DEFINDEX_API_KEY=your-api-key            # get at app.defindex.io

# Optional — defaults shown
DEFINDEX_API_URL=https://api.defindex.io
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_NETWORK=mainnet                 # mainnet | testnet
                                         # defaults to match STELLAR_NETWORK
```

### Vault addresses

Each vault is a Soroban contract on mainnet. These are the production addresses as of June 2026.

```env
DEFINDEX_USDC_VAULT=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW

# Optional: additional vaults (uncomment when live)
# DEFINDEX_CETES_VAULT=<address>
# DEFINDEX_XLM_VAULT=<address>
```

Multiple vaults can also be supplied as a JSON array (overrides individual vars):

```env
DEFINDEX_VAULTS_JSON=[
  { "asset": "USDC", "vault_address": "CDLZFC...", "network": "mainnet", "label": "USDC Yield Vault" }
]
```

### Execution flags

These guard against accidental mainnet execution. All three must be set to actually submit DeFindex transactions on mainnet:

```env
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_COMPLIANCE_APPROVED=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=true
```

On testnet these are not required — XDR is built but submission is testnet-safe.

---

## Auto-Yield Sweep

The sweep service runs in the background and auto-deposits idle USDC into DeFindex on behalf of custodial wallets (those with a `vault_secret_id`).

```env
# Master switch — must be true to activate
AUTO_YIELD_ENABLED=true

# dry_run: logs what would happen without submitting
# Defaults to true on testnet, false on mainnet
# Set explicitly to override
AUTO_YIELD_DRY_RUN=false

# Minimum USDC balance to be eligible for a sweep
AUTO_YIELD_MIN_USDC=2.0

# How much USDC to keep liquid after depositing
AUTO_YIELD_LIQUID_RESERVE_USDC=0.5

# How often the sweep runs (hours)
AUTO_YIELD_INTERVAL_HOURS=6
```

Manual trigger (admin only):
```
POST /api/auto-yield/run
{ "dry_run": true, "max_wallets": 10 }
```

---

## Why DeFindex showed 0% yield (and the fix)

DeFindex vaults only exist on mainnet. Running TTS on testnet caused two silent failures:

1. **APY fetch failed** — the DeFindex API has no testnet APY data → returned 0%
2. **Balance fetch failed** — the SDK couldn't read vault shares on testnet → fell back to summing raw deposit operations (exact deposit amount, zero growth)
3. **Analysis window empty** — `analyzePortfolioPeriod` uses a 24h window; if no operations fell in that window, `change` returned 0

**Fix (commit 5e28366):**
- `getVaultAPY` and `getVaultBalance` now retry against mainnet automatically when the testnet call fails (same vault address works on both)
- Frontend shows a *projected* return (days × APY formula) when testnet yields no real history

**Production behaviour** — on mainnet (`STELLAR_NETWORK=PUBLIC`), all three root causes disappear: the SDK reads real vault shares, APY comes from live data, and balance history grows in real time.
