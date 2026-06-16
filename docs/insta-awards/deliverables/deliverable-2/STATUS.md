# Deliverable 2 Status — USD Delivery & Payout Coordination Layer

Updated: 2026-06-16

## Executive Status

All four requested D2 evidence labels now have concrete files in the active package. Circle sandbox API readiness has been verified from backend env, and a Circle sandbox payout instruction was created and refreshed to completed status through the TTS application.

The active D2 proof transfer is `tr_d2_circle_stellar_payment_2`. It has a 64-character Stellar testnet hash, provider `circle`, execution mode `sandbox_api`, and a persisted row in `public.international_payout_instructions`. A protected status refresh observed Circle provider status `completed`.

## Deliverable Checklist

| Requested evidence label | Current status | Evidence file |
|---|---|---|
| Adapter Interface Code | Ready for code review and test proof. | `evidence/adapter-interface-code.md` |
| Hash Transacao Stellar | Ready. D2 transfer uses a 64-character Stellar testnet hash from `payment_logs.id=2`. | `evidence/stellar-transaction-hash.md` |
| Integracao Circle/Bridge | Ready. Circle sandbox payout instruction executed and persisted. Bridge remains compatibility-only until provider access exists. | `evidence/circle-bridge-integration.md`, `evidence/circle-readiness-redacted.json`, `evidence/circle-sandbox-payout-redacted.json` |
| Payout Instructions | Ready. Circle sandbox payout instruction row exists with status `completed`. | `evidence/payout-instructions.md`, `evidence/circle-sandbox-payout-redacted.json` |

## Current Real-Evidence Boundary

What is real now:

- Provider-agnostic adapter code exists in `backend/src/api/services/usd-payout-adapters.ts`.
- Backend payout coordination and evidence code exists in `backend/src/api/services/usd-payout-coordination.service.ts`.
- Circle sandbox linked-bank setup exists outside Git, with only redacted hash/tail evidence committed.
- Circle sandbox API auth and linked wire lookup are verified: balances HTTP 200, wires HTTP 200, destination found with status `complete`.
- Payout instructions now carry USDC rail metadata: `PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK`, settlement asset `USDC`, off-ramp source asset `USDC`, payout currency `USD`.
- Circle sandbox payout execution exists for transfer `tr_d2_circle_stellar_payment_2`.
- `public.international_payout_instructions` has a Circle row with `execution_mode=sandbox_api`.
- D1 has verified Stellar testnet JSON evidence from live database export.

What is not complete yet:

- `public.international_payout_events` currently has 0 rows because no signed Circle webhook has been received yet.
- The later D3 full demo still needs a single filmed walkthrough from PIX intake through Circle evidence.

## Completion Proof

Completed for D2:

1. Created transfer `tr_d2_circle_stellar_payment_2` from database-backed Stellar USDC evidence.
2. Attached Stellar transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`.
3. Used Circle sandbox key, linked wire destination, and `ENABLE_REAL_PAYOUT_EXECUTION=true`.
4. Created a Circle payout instruction through the TTS application.
5. Persisted the Circle provider payout reference in `international_payout_instructions`.
6. Refreshed provider status through the protected payout refresh endpoint; final observed status is `completed`.
7. Verified `/api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence` returns `ready=true`, `ready_count=4`, `execution_mode=sandbox_api`, and instruction status `completed`.

Remaining follow-up:

1. Capture a signed Circle webhook if reviewer requires webhook proof in addition to protected status polling.
2. Capture dashboard screenshots/video later for D3 full demo evidence.

Current precise claim: "D2 Circle sandbox payout instruction execution is complete, persisted, and observed completed through protected status polling."
