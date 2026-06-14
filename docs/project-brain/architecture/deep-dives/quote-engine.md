# Quote Engine — Deep Dive

## How Quotes Work

The quote engine fetches live BRL/USDC exchange rates from the **Stellar DEX** (decentralized exchange on testnet/mainnet).

### Path

```
User requests quote (BRL amount → USDC estimate)
  ↓
BrlReferenceRateService.quoteBrlToUsdc(amountBrl)  [brl-reference-rate.service.ts:100]
  ↓
Horizon.strictSendPaths(BRL_asset, amount, [USDC_asset])
  ↓
Returns: array of paths with source_amount, destination_amount, path[]
  ↓
selectBestStrictSendPath() — filters to trusted path assets only [line 85]
  ↓
assertSaneBrlUsdcQuote() — validates rate is 3-10 BRL/USD [line 43]
  ↓
Returns: BrlReferenceQuote { brlPerUsdc, usdcPerBrl, path, fetchedAt }
  ↓
BrlUsdQuoteService.createQuote() [brl-usd-quote.service.ts:68]
  ├── Applies platform fee (30bps via PlatformFeeService.calculateSpread)
  ├── Computes estimated_usdc_amount
  └── Persists to international_transfer_quotes table
  ↓
Quote TTL: BRL_USD_QUOTE_TTL_SECONDS (default 300s = 5 minutes)
```

## Why Quotes Drift (Pain Point #30)

The quote is computed **fresh on every API call**. The frontend re-fetches on:
- Component mount
- State changes (amount input, asset selection)
- Re-renders

Each re-fetch hits the live Stellar DEX, which may have different liquidity between calls. Result: user sees 10.00 → 10.07 → 10.15 as rates shift.

### Fix Architecture

```
Correct pattern:
  1. User enters amount → single quote fetch
  2. Show loading state ("Calculando cotação...")
  3. Display frozen quote with TTL countdown
  4. User confirms or cancels within TTL
  5. If TTL expires → show "Cotação expirada. Recalcular?"

Never: re-fetch on re-render, auto-refresh, stream-update
```

## Relevant Files

- `backend/src/api/services/brl-reference-rate.service.ts` — DEX pathfinding
- `backend/src/api/services/brl-usd-quote.service.ts` — wrapping + fee + persistence
- `backend/src/api/services/quote-rate-sanity.service.ts` — rate validation
- `backend/src/api/services/platform-fee.service.ts` — fee calculation (30bps)
- `backend/src/config/assets.ts` — asset codes, issuers, trusted paths
