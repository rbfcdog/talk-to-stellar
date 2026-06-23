# Yield Protocols — Testnet vs Mainnet

How DeFindex, Blend, and Soroswap behave differently on each network, why the 0% yield bug happened, and what the fallback strategy is for each.

---

## Why this matters

TalkToStellar runs on Stellar testnet during development but the three yield protocols each have their own relationship with testnet — some have no contracts there at all, some have stale/empty pools, and some partially work. Knowing exactly what breaks and what doesn't determines whether your dev environment gives you real signals or silently returns garbage.

---

## DeFindex

### What it is

A vault aggregator built by PaltaLabs. Users deposit USDC; the vault automatically allocates it across Blend, Orbit, and other Soroban lending protocols. Users get vault shares that accrue value over time.

### Mainnet — how it works

| Step | What happens |
|------|-------------|
| `getVaultAPY(address)` | DeFindex API returns real APY from vault strategy performance |
| `getVaultBalance(address, caller)` | SDK reads vault shares for `caller` from the contract on-chain via Soroban RPC |
| `buildVaultAction('deposit', ...)` | DeFindex API returns unsigned XDR; the vault contract's `deposit()` entrypoint is invoked |
| `buildVaultAction('withdraw', ...)` | Inverse — redeem shares for USDC |
| Auto-yield sweep | Signs and submits deposit XDR server-side using custodial key |

The vault contract is at `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW` on Stellar mainnet. This is a Soroban contract; it only exists on mainnet.

### Testnet — what breaks

| What you call | What actually happens | Root cause |
|---------------|-----------------------|------------|
| `getVaultAPY(address)` | SDK call throws | DeFindex's APY data endpoint has no testnet index — the vault was never deployed to testnet |
| `getVaultBalance(address, caller)` | SDK call throws | Soroban RPC can't find the contract on testnet ledger |
| `buildVaultAction('deposit')` | SDK call throws (or returns XDR for a contract that doesn't exist on testnet) | Contract not deployed |
| `depositToVault()` XDR submission | Fails at network level | Ledger rejects — contract address not found |

Before the fix, `getVaultAPY` threw → balance field showed 0% in the UI. `getVaultBalance` threw → balance fell back to summing raw deposit operations in the operation table, which gives the original deposit amount with no growth. The analysis window (last 24h) had no activity → `analyzePortfolioPeriod` returned `change: 0`.

### Fallback strategy (implemented)

```
getVaultAPY(vault, 'testnet')
  └─ throws
  └─ retry: getVaultAPY(vault, 'mainnet')
       └─ returns { apy: 8.6, source: 'mainnet_reference', testnet_estimated: true }

getVaultBalance(vault, caller, 'testnet')
  └─ throws
  └─ retry: getVaultBalance(vault, caller, 'mainnet')
       └─ returns real on-chain balance if caller has a mainnet deposit
```

Frontend: when testnet returns `analyzePortfolioPeriod.change === 0` and `rate > 0`, shows a *projected* return using `balance × (1 + rate/100)^(days/365) - 1`. This is clearly labeled "projetado / projected" in green to distinguish it from real accrued return.

### Production checklist

```env
# These three flags must ALL be set on mainnet — any missing = no execution
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_COMPLIANCE_APPROVED=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=true

DEFINDEX_USDC_VAULT=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW
DEFINDEX_API_KEY=<from app.defindex.io>
STELLAR_NETWORK=PUBLIC
```

On mainnet with these flags set: deposits execute for real, vault shares accumulate, APY and balance both come from live contract state.

---

## Blend

### What it is

A permissionless lending protocol on Soroban. Suppliers deposit USDC and earn interest paid by borrowers. The supply APY floats with pool utilization (higher borrow demand → higher APY for suppliers). As of June 2026, the Stellar Pool's USDC supply APY is ~5–8%.

### Mainnet — how it works

| Step | What happens |
|------|-------------|
| `PoolV2.load(blendNet, poolId)` | Reads the pool's reserve data from Soroban RPC on-chain |
| `pool.reserves` | Map of assetId → `ReserveInfo` with `estSupplyApy`, `estBorrowApy`, utilization |
| `pool.loadUser(address)` | Reads user's supply/collateral/liability positions |
| `poolContract.submit(requests)` | Builds the operation for supply or withdraw |
| `rpc.simulateTransaction(tx)` | Soroban fills `SorobanData` (auth, fee budget, footprint) |
| `rpc.assembleTransaction(tx, sim)` | Returns ready-to-sign XDR |

The mainnet Stellar Pool contract is `CBLLNN4MFMABJBA6O7DFEBZJBXJLBTJEKUZHLBAJ7U2KHTM4HFMVNKVT`. There is also an Orbit Pool at `CAUIKL3IYGMERDRUN5YVVYBV3BKEC7XKJMIDBJZZWIOEBSAWIL26YJEX`.

APY is not fetched from an external API — it is computed directly from on-chain reserve data (supply token ratio, utilization). This means it is always accurate and never stale.

### Testnet — what breaks

| What you call | What actually happens | Root cause |
|---------------|-----------------------|------------|
| `PoolV2.load(blendNet, testnetPool)` | Throws (most of the time) | Testnet pool `CAQFFD3ZNXB5LFHBY5SQCNIWAHUBQFMZP25M7FXRGXIHPHNLBM5AXGJ` may not be deployed, or is deployed but has no reserves funded |
| `pool.loadUser(address)` | Returns zero positions | No one supplies to testnet pools |
| `buildSupplyXdr(...)` | May succeed (contract present) but simulation fails | Pool has no reserve data to simulate against |

Unlike DeFindex, Blend does have a testnet pool address — but it is unreliable. PaltaLabs and other teams don't maintain testnet Blend liquidity, so it's usually empty.

### Fallback strategy (implemented)

```typescript
// In BlendService.getPoolInfo():
try {
  pool = await PoolV2.load(blendNet, net.pool);
} catch (e) {
  if (net.label === 'testnet') {
    // Testnet pool unavailable — return mainnet APY as reference
    return BlendService.getPoolInfo('mainnet');
  }
  throw e;
}
```

Same pattern for `getUserPosition`: testnet failure returns `{ positions: [], note: 'testnet pool unavailable' }` rather than throwing.

This means: even on testnet, the APY shown in the rendimentos screen comes from mainnet Blend, and it is real. The user position is shown as zero (correct — no testnet supply exists).

### RPC endpoints

```env
# Override if the defaults rate-limit you
BLEND_MAINNET_RPC=https://mainnet.sorobanrpc.com
BLEND_TESTNET_RPC=https://soroban-testnet.stellar.org
BLEND_TESTNET_POOL=CAQFFD3ZNXB5LFHBY5SQCNIWAHUBQFMZP25M7FXRGXIHPHNLBM5AXGJ
```

---

## Soroswap

### What it is

An aggregator DEX on Stellar/Soroban that routes swaps across Soroswap AMM pools, Phoenix, Aqua, and the Stellar Classic DEX (SDEX). For TalkToStellar, the main use is XLM→USDC conversion for incoming deposits and USDC→XLM for fees.

### Mainnet — how it works

```
POST /quote?network=mainnet
  body: { assetIn, assetOut, amount, protocols: ['soroswap','phoenix','aqua','sdex'] }
  → returns: { amountOut, priceImpact, route, rawQuote }

POST /quote/build
  body: { quote: <rawQuote>, senderAddress }
  → returns: { xdr: <unsigned> }
```

The token addresses are SAC (Stellar Asset Contract) wrappers for classic Stellar assets:
- USDC: `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` (Circle USDC SAC)
- XLM: `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA` (native XLM SAC)

The LP pool (used for the pool-info card in rendimentos) is queried directly from Stellar Horizon's `GET /liquidity_pools` endpoint. Fee is fixed at 0.3% (30 bps). Mainnet has $2–5M in USDC/XLM liquidity most days.

### Testnet — what breaks

| What you call | What actually happens | Root cause |
|---------------|-----------------------|------------|
| `POST /quote?network=testnet` | Returns no route or a 0-amount quote | Testnet Soroswap/Phoenix/Aqua AMM pools have no real liquidity |
| Pool-info card | Falls back to mainnet data | Queried with `network=mainnet` explicitly in the controller |
| `GET /tokens?network=testnet` | Returns a short list of SAC wrappers | Soroswap API does maintain a testnet token list but it is sparse |

Testnet token addresses:
- USDC: `CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F`
- XLM: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`

Note: these XLM and USDC SAC addresses on testnet are different from the mainnet ones. Passing a mainnet address in a testnet quote will get a "token not found" error.

### Fallback strategy (implemented)

The service has two fallback layers when `POST /quote` fails:

**1. Stellar path payment (SDEX)**

The Stellar Classic DEX is available on both networks and always has some XLM/USDC order book activity (even testnet has friendbot-funded test accounts trading). When the Soroswap quote fails:

```typescript
// getStellarPathPaymentFallbackQuote():
await StellarService.quotePathPayment({ assetIn, assetOut, amount })
// Uses Horizon's /paths endpoint — finds routes through the classic order book
```

This gives a real quote via SDEX even when no Soroswap AMM pool exists on testnet.

**2. Broker fallback**

If path payment also fails, `StellarBrokerService` is called as a last resort.

**Pool info card**: The `GET /api/swap/pool-info` endpoint always fetches from mainnet Horizon regardless of `STELLAR_NETWORK`. Testnet has no meaningful XLM/USDC pool to display — mainnet data is the correct reference.

### Key env vars

```env
SOROSWAP_API_URL=https://api.soroswap.finance   # default
SOROSWAP_API_KEY=<optional — increases rate limits>
SOROSWAP_DEFAULT_SLIPPAGE_BPS=50               # 0.5%
STELLAR_NETWORK=PUBLIC                          # drives mainnet vs testnet routing
```

---

## Side-by-side summary

| Protocol | Testnet contracts | Testnet data | Fallback | XDR on testnet |
|----------|------------------|--------------|----------|----------------|
| **DeFindex** | ✗ none | ✗ APY API empty | → mainnet APY + balance reference | ✗ would reject at ledger |
| **Blend** | ⚠ exists but unfunded | ⚠ pool loads but has no reserves | → mainnet APY reference | ⚠ simulation may fail |
| **Soroswap** | ✗ no AMM liquidity | ⚠ token list exists, no routes | → SDEX path payment fallback | ✓ SDEX path payment works |

**DeFindex** is the most broken on testnet: no contract, no data, fallback is reference-only (read-only, no actual yield accrues).

**Blend** is partially broken: the pool address exists but has no liquidity, so APY and user positions are meaningless. APY falls back to mainnet. XDR building is technically possible but simulation usually fails.

**Soroswap** is the most testnet-functional: the API serves testnet quotes (sparse but real), SDEX always works, and XDR building succeeds via path payment.

---

## The three root causes of the 0% yield bug

When `STELLAR_NETWORK=testnet` (default in development):

1. **DeFindex APY threw** — the SDK call to `getVaultAPY` hit the API with `network=testnet`; the API returned an error because it has never indexed testnet vault data. The caught error set `rate = 0`.

2. **DeFindex balance threw** — `getVaultBalance` tried to read vault shares from testnet Soroban RPC. The contract doesn't exist on testnet, so RPC returned "contract not found". The fallback summed raw deposit operations from the `defindex_operations` table — this gives the exact deposit amount (no growth, ever).

3. **Analysis window was empty** — `analyzePortfolioPeriod` uses a 24-hour sliding window. In most dev environments, the last deposit happened days ago. No point fell in the window → `inWindow.length === 0` → `change = 0`.

All three conspired: APY = 0%, balance = deposit amount (flat), and the 24h window returned zero change. Every field in the yield display was exactly zero.

**The fix:**
- `getVaultAPY` and `getVaultBalance` both now retry against mainnet when testnet throws. If the user has a real mainnet deposit, `getVaultBalance` returns the live growing balance. The APY is the real mainnet rate.
- Frontend: when testnet analysis returns `change === 0` but `rate > 0` and `daysElapsedSinceDeposit > 0`, projects the return using compound interest: `amount × ((1 + rate/100)^(days/365) - 1)`. Labeled "projetado" to be transparent.

On mainnet: all three root causes vanish. The vault contract exists, APY and balance come from live state, and activity history has real growth events.
