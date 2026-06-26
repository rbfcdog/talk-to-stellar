# Investments Page — Surface Audit

> **Living document.** Updated when investment/vault bugs are found or fixed.

## Flow
```
User opens investments page (web)
  → View total portfolio graph + yield product cards only
  → Tap a product card
  → View that product's current performance, amount, and balance chart
  → Choose invest more or withdraw from the product detail
  → Confirm → DeFindex or Blend transaction flow executes
```

## Known Issues (Updated June 26, 2026)

### Fixed
- **Performance math wrong** (#11): ✅ Fixed by `dcec791` — `analyzePortfolioPeriod` subtracts `cashflowChange` from raw change (deposits/withdrawals excluded)
- **Charts need work** (#12): ✅ Fixed by `d4b1d98` — weekly/monthly toggle added, `ChartWindow` type with 7d/30d options
- **Blend v2 pool load failed with unsupported address type** (#63): ✅ Fixed by `008da16` — invalid configured pool ids are ignored, current Blend v2 pools are discovered from the backstop reward zone, and USDC/XLM reserve hints were refreshed for mainnet/testnet
- **Overview still showed invest controls** (#66): ✅ Fixed in current working tree; commit pending — `/rendimentos` now defaults to total graph + yield cards only. Product details and invest/withdraw controls mount only after tapping a yield card or opening an application deep link.

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
- `frontend/__tests__/unit/ux-copy.test.ts` — source guardrails for overview/detail separation and first-screen copy
- `frontend/lib/portfolio-period-analysis.ts` — period analysis with cashflow exclusion
- `backend/src/api/services/defindex-yield.service.ts` — vault operations
- `backend/src/integrations/blend/service.ts` — Blend v2 pool discovery, reserve selection, and supply/withdraw XDR construction
- `backend/tests/blend.service.test.ts` — regression for stale invalid pool id and backstop reward-zone discovery
- `backend/src/config/` — DeFindex vault config

## Latest Verification

2026-06-26:

- `npm --prefix frontend test -- --run __tests__/unit/ux-copy.test.ts __tests__/unit/rendimentos-channel-pin.test.ts` passed.
- `npm --prefix frontend run build -- --debug-build-paths "app/rendimentos/**"` passed and listed `/rendimentos`.
- `npm exec -- tsc --noEmit --pretty false` from `frontend/` still fails on pre-existing unit-test typing issues (`NODE_ENV` readonly and missing Vitest globals in older tests), but reports no `/rendimentos` errors.

2026-06-23:

- `npm --prefix backend test -- --runInBand tests/blend.service.test.ts tests/bridge.routes.test.ts` passed.
- `npm --prefix backend run build` passed.
- `npm --prefix frontend run build` passed.
- Live local probe loaded Blend mainnet pool `CDMAVJPFXPADND3YRL4BSM3AKZWCTFMX27GLLXCML3PD62HEQS5FPVAI` from `reward_zone` and testnet pool `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` from configured defaults.
