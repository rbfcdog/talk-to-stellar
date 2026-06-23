# Wire On-Ramp Page — Surface Audit

> **Living document.** Updated when `/wire-onramp` changes or Bridge deposit-link failures recur.

## Flow

```
User opens /wire-onramp from WhatsApp or web
  -> Next.js renders WireOnrampClient
  -> Client resolves session_id, email, short_link_code, or cached browser email
  -> Client calls /api/bridge/session/usd-account
  -> Frontend API proxy forwards to backend Bridge route
  -> BridgeController resolves email/customer and live or cached USD virtual accounts
  -> Page renders wire/ACH instructions and destination Stellar wallet status
```

## Current Behavior

- Route: `/wire-onramp`.
- Purpose: user-facing USD deposit instructions for Bridge virtual accounts.
- Entry points can include `session_id`, `email`, or `short_link_code`.
- Browser localStorage key `tts:wire-onramp:email` stores the last successful email so returning users can reload the page without retyping it.
- The user can manually enter a Bridge account email that differs from WhatsApp/session context; manual no-account searches force the typed email.
- The page uses the operational shell visual system shared with `/bridge-test`: status pills, compact stats, and full wire/ACH instruction cards.
- Backend account lookup returns `customer_id`, `lookup_source`, and `virtual_account_source` so the UI can show whether data came from Bridge live API or `bridge_va_cache`.
- Virtual-account received totals come from direct VA balance fields when present, otherwise Bridge activity totals such as `funds_received`.

## Known Issues

### Fixed

- **Short-link page showed processing despite existing account** (#61): Fixed by `f1229d9`. The backend now resolves `short_link_code` through `short_links` and `agent_sessions`, then loads the Bridge customer and falls back to cached USD VAs when the live Bridge VA list is empty or unavailable. The page no longer shows a generic pending message when cached instructions exist.
- **Login email not remembered** (#61): Fixed by `f1229d9`. Successful account loads persist the normalized email in browser localStorage and the Change action can clear it.
- **Manual Bridge email override missing in no-account state** (#62): Fixed by `008da16`. The empty state now explains that the Bridge email can differ from WhatsApp, shows an inline email form, and calls the account loader with `forceEmail` so typed addresses are searched directly.

### Still Open

- If a real Bridge customer exists but neither live Bridge API nor `bridge_va_cache` returns a USD virtual account, the page still renders an empty-state card. Diagnose with the runbook before treating it as a UI bug.

## Key Files

- `frontend/app/wire-onramp/page.tsx` — route entry point.
- `frontend/app/wire-onramp/wire-onramp-client.tsx` — deposit-instruction UI, short-link forwarding, cached email behavior, and VA render.
- `frontend/app/api/[...path]/route.ts` — same-origin API proxy used by `/api/bridge/session/usd-account`.
- `backend/src/api/routes/bridge.router.ts` — maps `/api/bridge/session/usd-account`.
- `backend/src/api/controllers/bridge.controller.ts` — short-link/session/email resolution and Bridge USD VA loading.
- `backend/tests/bridge.routes.test.ts` — regression coverage for short-link plus cached-VA fallback.

## Endpoints

| Purpose | Method | Frontend path | Backend route |
|---------|--------|---------------|---------------|
| Screen | GET | `/wire-onramp` | N/A |
| Session USD account | GET | `/api/bridge/session/usd-account?session_id=...` | `/api/bridge/session/usd-account` |
| Email USD account | GET | `/api/bridge/session/usd-account?email=...` | `/api/bridge/session/usd-account` |
| Short-link USD account | GET | `/api/bridge/session/usd-account?short_link_code=...` | `/api/bridge/session/usd-account` |

## Latest Verification

2026-06-23:

- `npm --prefix backend test -- --runInBand tests/blend.service.test.ts tests/bridge.routes.test.ts` passed.
- `npm --prefix backend run build` passed.
- `npm --prefix frontend run build` passed and listed `/wire-onramp`.
