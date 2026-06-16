# Run Log — Wire Payout Test Screen

Date: 2026-06-16

## Summary

Added a simple frontend screen at `/wire-test` for testing Circle wire payout coordination through the existing Next.js transfer proxy. The screen loads Circle readiness, redacted payout evidence, and can run protected Circle instruction/status actions when an operator pastes an accepted backend ops secret.

## Files Changed

- `frontend/app/wire-test/page.tsx` — route entry point.
- `frontend/app/wire-test/wire-test-client.tsx` — operator UI, Circle readiness/evidence display, endpoint list, protected create/refresh actions.
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
npx playwright screenshot --viewport-size=1440,1200 http://127.0.0.1:3000/wire-test /tmp/tts-wire-test.png
```

## Verification Result

- Frontend page: `GET http://127.0.0.1:3000/wire-test` returned HTTP 200.
- Provider readiness through frontend proxy returned Circle `execution_mode=sandbox_api`, `configured=true`, `execution_enabled=true`, `blockers=[]`.
- Payout evidence through frontend proxy returned `ready=true`, `ready_count=4`, `required_count=4`.
- Protected payout status refresh through frontend proxy returned `transfer_status=PAYOUT_COMPLETED`, `payout_status=completed`, and `status_history_count=6`.
- Production frontend build passed and includes `/wire-test`.

## Local Endpoints

```text
Screen: http://localhost:3000/wire-test
Provider readiness: http://localhost:3000/api/transfers/payout-providers
Payout evidence: http://localhost:3000/api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence
Create instruction: POST http://localhost:3000/api/transfers/tr_d2_circle_stellar_payment_2/payout-instruction
Refresh status: POST http://localhost:3000/api/transfers/tr_d2_circle_stellar_payment_2/payout-status-refresh
```

## Boundary

This proves Circle sandbox payout completion through TTS application endpoints. It does not claim production bank delivery.
