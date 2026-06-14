# Investments Page — Surface Audit

> **Living document.** Updated when investment/vault bugs are found or fixed.

## Flow
```
User opens investments page (web)
  → View vault options (USDC, CETES)
  → View current balance + APY + performance chart
  → Enter amount to apply
  → Confirm → DeFindex deposit executes
```

## Known Issues (Updated June 13, 2026)

### Fixed
- **Performance math wrong** (#11): ✅ Fixed by `dcec791` — `analyzePortfolioPeriod` subtracts `cashflowChange` from raw change (deposits/withdrawals excluded)
- **Charts need work** (#12): ✅ Fixed by `d4b1d98` — weekly/monthly toggle added, `ChartWindow` type with 7d/30d options

### Still Open
- **Page failing** (#13): Needs retry + backoff for DeFindex API calls
- **Distribution math wrong** (#34): Portfolio percentages may not sum to 100%
- **Charts too smooth** (#12 partial): Curve interpolation may still be smooth rather than step

## Required Changes
1. Add retry + backoff for DeFindex API calls (3 attempts, 1s/2s/4s)
2. Fix portfolio percentage computation to always sum to 100.0%
3. Consider step interpolation for charts (if smooth curves still present)

## Key Files
- `frontend/app/rendimentos/rendimentos-client.tsx` (~1343 lines) — investments page
- `frontend/lib/portfolio-period-analysis.ts` — period analysis with cashflow exclusion
- `backend/src/api/services/defindex-yield.service.ts` — vault operations
- `backend/src/config/` — DeFindex vault config
