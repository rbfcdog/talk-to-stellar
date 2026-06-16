# Run Log — Wire Payout Test Screen

Date: 2026-06-16

## Summary

Added and verified a simple frontend screen at `/wire-test` for sending a Circle sandbox wire payout through a same-origin Next.js route handler. The screen accepts an ops token and USD amount, then calls the backend Circle wire-test handler.

## Files Changed

- `frontend/app/wire-test/page.tsx` — route entry point.
- `frontend/app/wire-test/wire-test-client.tsx` — operator UI, amount/token form, protected send action, and Circle result display.
- `frontend/app/api/wire-test/send/route.ts` — frontend route handler that forwards to backend.
- `backend/src/api/controllers/international-transfers.controller.ts` — `sendWireTest()` Circle sandbox send handler.
- `backend/src/api/routes/international-transfers.router.ts` — backend route mount for `POST /api/transfers/wire-test/send`.
- `docs/project-brain/product/surfaces/wire-payout-test.md` — surface audit and endpoint map.
- `docs/project-brain/OVERVIEW.md` — registered the new frontend surface.
- `docs/project-brain/README.md` — registered the new surface doc.
- `docs/project-brain/architecture/SYSTEM-MAP.md` — added the surface to the architecture map.
- `docs/project-brain/DOCS-INDEX.md` — registered the surface and updated D2 status wording.

## Commands Run

```bash
npm --prefix frontend run build
npm --prefix backend start
BACKEND_URL=http://127.0.0.1:3001 npm --prefix frontend run start -- -p 3000 -H 0.0.0.0
curl -s http://127.0.0.1:3000/api/transfers/payout-providers
curl -s http://127.0.0.1:3000/api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence
curl -s -X POST http://127.0.0.1:3000/api/transfers/tr_d2_circle_stellar_payment_2/payout-status-refresh -H "x-international-transfer-ops-secret: <ops-secret>" -d "{}"
curl -s -X POST http://127.0.0.1:3001/api/transfers/wire-test/send -H "x-international-transfer-ops-secret: <ops-secret>" -H "content-type: application/json" -d '{"amount":"1"}'
curl -s -X POST http://127.0.0.1:3000/api/wire-test/send -H "x-international-transfer-ops-secret: <ops-secret>" -H "content-type: application/json" -d '{"amount":"1"}'
npx playwright screenshot --viewport-size=1440,1200 http://127.0.0.1:3000/wire-test /tmp/tts-wire-test.png
```

## Verification Result

- Frontend page: `GET http://127.0.0.1:3000/wire-test` returned HTTP 200.
- Provider readiness through frontend proxy returned Circle `execution_mode=sandbox_api`, `configured=true`, `execution_enabled=true`, `blockers=[]`.
- Payout evidence through frontend proxy returned `ready=true`, `ready_count=4`, `required_count=4`.
- Protected payout status refresh through frontend proxy returned `transfer_status=PAYOUT_COMPLETED`, `payout_status=completed`, and `status_history_count=6`.
- Direct backend wire-test send returned HTTP 200 wrapper with Circle HTTP 201, payout id present, status `pending`, amount `$1`.
- Frontend proxy wire-test send returned HTTP 200 wrapper with Circle HTTP 201, payout id present, status `pending`, amount `$1`.
- Playwright filled `/wire-test`, clicked `Send`, and verified the UI displayed `Wire sent`.
- Production frontend build passed and includes `/wire-test`.

## Local Endpoints

```text
Screen: http://localhost:3000/wire-test
Send wire: POST http://localhost:3000/api/wire-test/send
Backend target: POST http://localhost:3001/api/transfers/wire-test/send
```

## Boundary

This proves Circle sandbox wire payout creation through TTS application endpoints. Circle can initially return provider status `pending`; that is not a production bank-delivery claim.
