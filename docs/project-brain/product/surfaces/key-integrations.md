# Key Integrations Page — Surface Audit

> **Living document.** Updated when `/key-integrations` changes or integration-panel failures recur.

## Flow

```
Operator opens /key-integrations
  -> Next.js renders KeyIntegrationsClient
  -> Client calls same-origin /api/abroad, /api/oracle, /api/fraud-screen, and /api/swap paths
  -> frontend/app/api/[...path]/route.ts forwards through proxyBackendApi()
  -> Backend Express routes call Abroad Finance, Reflector, StellarExpert, and Soroswap services
  -> Panels show live corridor, price, fraud, token, quote, and XDR-build results
```

## Current Behavior

- Route: `/key-integrations`.
- Purpose: compact end-to-end test panel for the four highest-impact ecosystem integrations.
- Uses same-origin frontend API calls; browser code must not call the backend origin directly.
- The generic catch-all route forwards `/api/<path>` to backend `/api/<path>` through `frontend/lib/backend-proxy.ts`.
- Production fallback for missing backend env is the deployed Railway backend, not `localhost:3001`.

## Known Issues

### Fixed

- **Payment watcher deploy log storm + Backend unreachable** (#53): Fixed by `ef1f793` and `299a21d`. The backend watcher now preflights Horizon account existence, treats 404 accounts as unfunded activation retries, and deduplicates reconnect timers. The frontend catch-all API route now uses the shared production-aware backend proxy, so key-integrations panels no longer depend on a localhost fallback in deployed builds. The Soroswap token panel falls back to built-in Stellar tokens when upstream token discovery fails or returns empty.

### Still Open

- None currently tracked for this surface. If a panel fails, first separate backend health from provider behavior: `Backend unreachable` means proxy/backend reachability; provider-specific JSON errors mean the backend route was reached.

## Key Files

- `frontend/app/key-integrations/page.tsx` — route entry point.
- `frontend/app/key-integrations/key-integrations-client.tsx` — panel UI and client-side calls.
- `frontend/app/api/[...path]/route.ts` — generic same-origin proxy for integration API paths.
- `frontend/lib/backend-proxy.ts` — backend URL resolution, request forwarding, and error payloads.
- `frontend/next.config.mjs` — build-time backend fallback for route handlers and ops rewrites.
- `backend/src/api/routes/abroad-finance.router.ts` — Abroad Finance route mount.
- `backend/src/api/routes/reflector.router.ts` — Reflector route mount.
- `backend/src/api/routes/fraud-screening.router.ts` — StellarExpert fraud-screen route mount.
- `backend/src/api/routes/soroswap.router.ts` — Soroswap route mount.
- `backend/src/integrations/payment-watcher/service.ts` — related background watcher that can affect backend reachability during deploys.
- `backend/src/integrations/soroswap/service.ts` — Soroswap quote/build/token logic and built-in token fallback.

## Endpoints

| Purpose | Method | Frontend path | Backend route |
|---------|--------|---------------|---------------|
| Screen | GET | `/key-integrations` | N/A |
| Abroad corridors | GET | `/api/abroad/corridors` | `/api/abroad/corridors` |
| Abroad quote | GET | `/api/abroad/quote?amount=...` | `/api/abroad/quote` |
| PIX QR decode | POST | `/api/abroad/decode-pix` | `/api/abroad/decode-pix` |
| Reflector rates | GET | `/api/oracle/rates` | `/api/oracle/rates` |
| Reflector price | GET | `/api/oracle/price/:asset` | `/api/oracle/price/:asset` |
| Fraud address | GET | `/api/fraud-screen/address/:address` | `/api/fraud-screen/address/:address` |
| Soroswap tokens | GET | `/api/swap/tokens` | `/api/swap/tokens` |
| Soroswap quote | GET | `/api/swap/quote?...` | `/api/swap/quote` |
| Soroswap XDR build | POST | `/api/swap/build` | `/api/swap/build` |

## Latest Verification

2026-06-22:

- `npm --prefix backend test -- --runInBand tests/payment-watcher.service.test.ts` passed.
- `npm --prefix backend test -- --runInBand tests/soroswap.service.test.ts` passed.
- `npm --prefix frontend run test -- --run __tests__/unit/api-catchall-proxy.test.ts` passed.
- `npm --prefix backend run build` passed.
- `npm --prefix frontend run build` passed and listed `/key-integrations` plus dynamic `/api/[...path]`.
- After `ef1f793`/`3ce5a80` were pushed, production `/health` recovered at `2026-06-22T01:38:57Z`; `/api/oracle/rates`, `/api/abroad/corridors`, and `/api/fraud-screen/address/:address` responded from the backend.
- `GET /api/payment-watcher/status` returned active watchers with one reconnecting unfunded account and zero pending subscriptions, confirming the watcher was no longer stuck in a large pending loop.
- Before `299a21d`, `/api/swap/tokens` and `/api/swap/quote` reached the backend but Soroswap upstream returned `Failed to get Soroswap contract address`. `299a21d` fixes the token-list panel with built-in fallback tokens; quote/build still depends on Soroswap upstream availability.
