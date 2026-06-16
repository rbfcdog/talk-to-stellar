# Wire Payout Test Screen — Surface Audit

> **Living document.** Updated when the Circle wire payout test surface changes.

## Flow

```
Operator opens /wire-test
  -> Enters an accepted backend ops token
  -> Enters USD amount
  -> Enters the matching 64-character Stellar settlement transaction hash
  -> Selects Stellar testnet or mainnet
  -> Clicks Send
  -> Frontend calls POST /api/wire-test/send through the Next.js route handler
  -> Next.js route handler forwards the request to POST /api/transfers/wire-test/send
  -> Backend creates a Circle Mint sandbox wire payout with Stellar settlement metadata attached
  -> Screen displays Circle HTTP result, payout id, payout status, amount, redacted destination tail, and Stellar Expert link
```

## Current Behavior

- Operator-facing frontend screen for sending a Circle sandbox wire payout from the browser.
- Route: `/wire-test`.
- Send endpoint: `POST /api/wire-test/send`.
- Backend endpoint: `POST /api/transfers/wire-test/send`.
- Uses a same-origin Next.js route handler, so Circle API keys and bank-account configuration remain backend-only.
- Stores the pasted ops secret only in browser `sessionStorage` under `tts-wire-test-ops-secret`.
- The visible form accepts ops token, amount, Stellar settlement hash, and Stellar network.
- Mutations require backend ops authorization.
- The result panel displays Circle HTTP status indirectly through success/failure, payout id, provider status, amount, destination tail, Stellar Expert link, and raw Circle response details for debugging.
- The frontend proxy adds `backend_url` and `backend_http_status` to responses so deployed-route failures are diagnosable from the browser.
- The backend wire-test handler requires `CIRCLE_API_KEY`, a linked `CIRCLE_PAYOUT_DESTINATION_ID`/`CIRCLE_BANK_ACCOUNT_ID`, and a valid 64-character Stellar transaction hash. It does not fall back to committed Circle credentials or linked-bank IDs.

## Known Issues

- This screen proves Circle sandbox payout creation when Circle returns HTTP 201 and a provider payout id. Initial Circle status can be `pending`.
- Each send requires a Stellar settlement hash so the Circle payout attempt can be shown beside the corresponding `stellar.expert` transaction.
- It prefers `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` from `frontend/app/api/wire-test/send/route.ts`; local browser hosts fall back to `http://localhost:3001`, and deployed hosts fall back to the Railway backend.
- If the backend is unreachable or returns non-JSON, the frontend route returns structured JSON with `wire_backend_unreachable`, `backend_http_status`, `backend_url`, or attempts metadata instead of a generic proxy HTTP 500.
- If `/api/wire-test/send` returns 404 after code changes, rebuild/restart the frontend and backend processes from current source.
- If `/api/wire-test/send` returns `circle_wire_test_not_configured`, configure backend Circle env before retrying. Do not put Circle secrets in frontend env or committed code.

## Key Files

- `frontend/app/wire-test/page.tsx` — route entry point.
- `frontend/app/wire-test/wire-test-client.tsx` — amount/token form, send action, and result rendering.
- `frontend/app/api/wire-test/send/route.ts` — same-origin frontend route handler that forwards to backend.
- `backend/src/api/controllers/international-transfers.controller.ts` — `sendWireTest()` Circle sandbox send handler.
- `backend/src/api/routes/international-transfers.router.ts` — backend route mounting for `POST /api/transfers/wire-test/send`.
- `backend/src/api/services/usd-payout-adapters.ts` — provider adapter interface and Circle adapter.

## Endpoints

| Purpose | Method | Frontend path |
|---------|--------|---------------|
| Screen | GET | `/wire-test` |
| Send Circle sandbox wire | POST | `/api/wire-test/send` |
| Backend target | POST | `/api/transfers/wire-test/send` |

## Latest Verification

2026-06-16:

- Rebuilt frontend from current source; build output includes `/api/wire-test/send`.
- Restarted backend from current compiled source.
- Direct backend call returned HTTP 200 wrapper with Circle HTTP 201, payout id present, status `pending`, amount `$1`.
- Frontend proxy call returned HTTP 200 wrapper with Circle HTTP 201, payout id present, status `pending`, amount `$1`.
- Playwright filled the `/wire-test` form, clicked `Send`, and verified the UI displayed `Wire sent`.
- After `1ab10cd`, the built frontend proxy was re-tested locally against the backend: valid ops auth returned frontend HTTP 200, backend HTTP 200, Circle HTTP 201, payout id present, amount `$1`; invalid ops auth returned structured frontend HTTP 403 with backend HTTP 403, not HTTP 500.
- After the settlement-link update, the visible copy no longer mentions hardcoded credentials, the send form requires a 64-character Stellar hash, and the result renders a `stellar.expert` link from backend-returned `stellar_evidence`.
