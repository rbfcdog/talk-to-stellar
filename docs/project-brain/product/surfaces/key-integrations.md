# Key Integrations Page — Surface Audit

> **Living document.** Updated when `/key-integrations` changes or integration-panel failures recur.

## Flow

```
Operator opens /key-integrations
  -> Next.js renders KeyIntegrationsClient
  -> Freighter panel connects to the browser extension
  -> Blend v2 panel calls same-origin /api/blend paths
  -> Soroswap panel calls same-origin /api/swap paths
  -> frontend/app/api/[...path]/route.ts forwards through proxyBackendApi()
  -> Backend Express routes call Blend and Soroswap services
  -> Panels show wallet network, pool status, token list, quote, XDR build, Freighter signing, and submit results
```

## Current Behavior

- Route: `/key-integrations`.
- Purpose: compact end-to-end test panel for the current SCF key integrations: Freighter, Blend v2, and Soroswap.
- The screen no longer contains Abroad Finance, Reflector, or StellarExpert panels.
- Freighter runs in the browser via `@stellar/freighter-api`; no backend API key is exposed.
- Blend v2 uses `/api/blend/pools` to list configured on-chain pool contracts.
- Soroswap uses same-origin frontend API calls; browser code must not call the backend origin directly.
- The generic catch-all route forwards `/api/<path>` to backend `/api/<path>` through `frontend/lib/backend-proxy.ts`.
- Production fallback for missing backend env is the deployed Railway backend, not `localhost:3001`.

## Known Issues

### Fixed

- **Payment watcher deploy log storm + Backend unreachable** (#53): Fixed by `ef1f793` and `299a21d`. The backend watcher now preflights Horizon account existence, treats 404 accounts as unfunded activation retries, and deduplicates reconnect timers. The frontend catch-all API route now uses the shared production-aware backend proxy. The Soroswap token panel falls back to built-in Stellar tokens when upstream token discovery fails or returns empty.
- **Soroswap quote provider 400** (#54): Fixed by `17a821f`. If Soroswap `/quote` returns its contract-discovery 400, the backend returns a `stellar-broker-fallback` pricing quote with `buildAvailable: false`; the panel shows the fallback source/warning and hides XDR build.
- **Soroswap wallet boundary**: Token list and quote tests do not require a wallet. XDR build requires a real `G...` Stellar public key, and execution requires a funded wallet/signing path. See `docs/integrations/SOROSWAP-SDK-TESTING-FLOW.md`.
- **Soroswap testnet execution boundary + Freighter flow** (#56): Fixed by `2a48ab3`. Token resolution is now network-aware, raw contract route failures return a non-buildable `soroswap-unavailable` response instead of falling into Stellar Broker, and the panel can connect Freighter, build for the connected address, sign the XDR, submit the signed transaction, and show the Horizon hash.
- **Payment watcher SSE stream rate limit fan-out** (#57): Fixed by `2a48ab3`. Stream opening has a serialized queue and stream-level `429` cooldown, preventing provider-level rate limits from becoming per-wallet warning bursts.
- **Key integrations scope**: Fixed by `0ddedd7` and `8af4f34`. `/key-integrations` now focuses on Freighter, Blend v2, and Soroswap only.

### Still Open

- If a panel fails, first separate backend health from provider behavior: `Backend unreachable` means proxy/backend reachability; provider-specific JSON errors mean the backend route was reached.
- Blend v2 is currently pool/status discovery only; deposit/borrow transaction construction remains future work unless a dedicated Blend SDK flow is added.

## Key Files

- `frontend/app/key-integrations/page.tsx` — route entry point.
- `frontend/app/key-integrations/key-integrations-client.tsx` — Freighter, Blend v2, and Soroswap panels.
- `frontend/app/api/[...path]/route.ts` — generic same-origin proxy for integration API paths.
- `frontend/lib/backend-proxy.ts` — backend URL resolution, request forwarding, and error payloads.
- `frontend/next.config.mjs` — build-time backend fallback for route handlers and ops rewrites.
- `backend/src/api/routes/blend.router.ts` — Blend route mount.
- `backend/src/api/controllers/blend.controller.ts` — Blend pool/status controller.
- `backend/src/integrations/blend/service.ts` — Blend v2 pool registry/status checks.
- `backend/src/api/routes/soroswap.router.ts` — Soroswap route mount.
- `backend/src/integrations/soroswap/service.ts` — Soroswap quote/build/token logic, token fallback, and Stellar Broker quote fallback.
- `backend/src/integrations/soroswap/types.ts` — quote capability fields (`source`, `buildAvailable`, `warning`).
- `docs/integrations/SOROSWAP-SDK-TESTING-FLOW.md` — operator workflow for wallet creation, quote-only testing, XDR build, signing, submission, and verification.

## Endpoints

| Purpose | Method | Frontend path | Backend route |
|---------|--------|---------------|---------------|
| Screen | GET | `/key-integrations` | N/A |
| Blend pools | GET | `/api/blend/pools` | `/api/blend/pools` |
| Soroswap tokens | GET | `/api/swap/tokens` | `/api/swap/tokens` |
| Soroswap quote | GET | `/api/swap/quote?...` | `/api/swap/quote` |
| Soroswap XDR build | POST | `/api/swap/build` | `/api/swap/build` |
| Soroswap signed submit | POST | `/api/swap/send` | `/api/swap/send` |

## Latest Verification

2026-06-22:

- `npm --prefix backend test -- --runInBand tests/payment-watcher.service.test.ts` passed.
- `npm --prefix backend test -- --runInBand tests/soroswap.service.test.ts` passed.
- `npm --prefix frontend run test -- --run __tests__/unit/api-catchall-proxy.test.ts` passed.
- `npm --prefix backend run build` passed.
- `npm --prefix frontend run build` passed and listed `/key-integrations` plus dynamic `/api/[...path]`.
- `2a48ab3` added network-aware Soroswap token resolution, non-buildable contract-route responses, Freighter connect/sign controls, signed-XDR submission through `/api/swap/send`, and stream-level payment watcher `429` throttling.
- `0ddedd7` and `8af4f34` slimmed the screen to Blend v2, Soroswap, and Freighter only.
