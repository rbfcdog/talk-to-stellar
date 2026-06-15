# Deliverable 2 Status — USD Delivery & Payout Coordination Layer

Updated: 2026-06-15

## Executive Status

All four requested D2 evidence labels now have concrete files in the active package. The code and documentation foundation is ready for reviewer inspection, but final real same-transfer evidence is not complete yet.

The current database does not contain a usable real D2 payout transfer. The current backend shell also does not have `CIRCLE_API_KEY` available and has `ENABLE_REAL_PAYOUT_EXECUTION=false`, so Circle sandbox payout execution cannot be honestly claimed from this run.

## Deliverable Checklist

| Requested evidence label | Current status | Evidence file |
|---|---|---|
| Adapter Interface Code | Ready for code review and test proof. | `evidence/adapter-interface-code.md` |
| Hash Transacao Stellar | Evidence requirements are documented. Final same-transfer hash is pending. | `evidence/stellar-transaction-hash.md` |
| Integracao Circle/Bridge | Circle linked-bank foundation and redacted readiness are present. Circle sandbox API payout execution is pending. Bridge remains compatibility-only until provider access exists. | `evidence/circle-bridge-integration.md`, `evidence/circle-readiness-redacted.json` |
| Payout Instructions | Routes, services, schema, and command flow are ready. Current DB has zero payout instruction rows. | `evidence/payout-instructions.md` |

## Current Real-Evidence Boundary

What is real now:

- Provider-agnostic adapter code exists in `backend/src/api/services/usd-payout-adapters.ts`.
- Backend payout coordination and evidence code exists in `backend/src/api/services/usd-payout-coordination.service.ts`.
- Circle sandbox linked-bank setup exists outside Git, with only redacted hash/tail evidence committed.
- D1 has real historical Stellar testnet JSON evidence from live database export.

What is not complete yet:

- No current `international_transfers` row has a valid real same-transfer 64-character Stellar hash plus real payout instruction evidence.
- `public.international_payout_instructions` currently has 0 rows.
- `public.international_payout_events` currently has 0 rows.
- The existing `international_transfers` rows use mock-prefixed Stellar and PIX identifiers and cannot be submitted as final real D2 evidence.
- Circle sandbox payout API execution cannot run from this shell until the backend process has the rotated Circle sandbox key and `ENABLE_REAL_PAYOUT_EXECUTION=true`.

## Final Completion Requirements

To mark D2 complete, run one same-transfer path:

1. Create or use a real BRL to USDC international transfer until Stellar settlement is attached to `international_transfers.stellar_tx_hash`.
2. Configure backend secrets with the rotated Circle sandbox key and the linked Circle wire bank destination ID.
3. Enable sandbox execution with `ENABLE_REAL_PAYOUT_EXECUTION=true`.
4. Call `POST /api/transfers/:id/payout-instruction` for that settled transfer.
5. Persist a Circle provider payout ID in `international_payout_instructions`.
6. Refresh status or capture a signed webhook into `international_payout_events`.
7. Export `/api/transfers/:id/payout-evidence` and `/api/transfers/:id/reconciliation`.
8. Capture the ops dashboard detail screenshot for the same transfer.

Until those are done, use the precise claim: "D2 foundation and compatibility evidence are ready; final same-transfer Circle payout execution evidence is pending."
