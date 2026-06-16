# Run 2026-06-16 - Stellar Expert Links For Circle Frontend

## Summary

The Circle payout test and D2 transfer console now show Stellar Expert evidence beside Circle payout results. Circle wire sends through `/wire-test` require a real 64-character Stellar transaction hash and backend-held Circle configuration.

## Changed Files

| File | Change |
|---|---|
| `frontend/app/wire-test/wire-test-client.tsx` | Added Stellar settlement hash + network controls, removed frontend copy about hardcoded credentials, and rendered a Stellar Expert link in the Circle result panel. |
| `frontend/app/international-transfer/settlement-console.model.ts` | Added `stellarExpertUrl()` helper with testnet/public URL selection. |
| `frontend/app/international-transfer/use-settlement-console.ts` | Preserves settlement network when loading reviewer evidence. |
| `frontend/app/international-transfer/settlement-console-view.tsx` | Turns Stellar settlement evidence into visible Stellar Expert links in overview and payout coordination panels. |
| `backend/src/api/controllers/international-transfers.controller.ts` | Requires backend Circle config and a valid Stellar hash for `/api/transfers/wire-test/send`; returns `stellar_evidence` and redacted destination/source references. |
| `backend/src/api/services/usd-payout-adapters.ts` | Removed committed Circle linked-bank fallback from capability and destination resolution. |
| `backend/src/api/services/international-transfer.service.ts` | Removed committed Circle linked-bank fallback from the wire-test payout helper. |
| `docs/project-brain/product/surfaces/wire-payout-test.md` | Documented the hash requirement, Stellar Expert link, and backend-only Circle configuration boundary. |

## Reviewer Impact

- D2 Circle evidence can be shown in frontend with the matching Stellar Expert transaction link.
- The active D2 Stellar transaction remains:
  `https://stellar.expert/explorer/testnet/tx/e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`
- The active D2 package remains:
  `docs/insta-awards/deliverables/deliverable-2/`

## Security Boundary

- No Circle API key, raw linked-bank destination ID, source wallet ID, routing number, or account number is stored in frontend code.
- The backend no longer falls back to committed Circle API/destination/source values in the wire-test path.
- Circle execution still requires backend env or protected request configuration.

## Verification To Run

```bash
npm --prefix backend run build
npm --prefix frontend run build
```

Then open:

```text
/wire-test?stellar_hash=e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094&stellar_network=testnet
/international-transfer?transfer_id=tr_d2_circle_stellar_payment_2
```

