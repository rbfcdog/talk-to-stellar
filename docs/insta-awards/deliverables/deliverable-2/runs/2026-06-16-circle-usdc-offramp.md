# Run 2026-06-16 - Circle USDC Off-Ramp Integration

## Summary

Integrated the Circle payout path more tightly with the TTS USDC settlement lifecycle. Circle payout instructions now carry explicit USDC rail metadata from the settled transfer:

```text
PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK
```

The backend Circle sandbox environment is ready for execution. A non-mutating Circle API probe confirmed auth, balance access, and linked wire destination lookup. Then a D2 transfer was created from database-backed Stellar testnet evidence and TTS created a Circle sandbox payout instruction through the application service.

## Files Changed

| File | Purpose |
|---|---|
| `backend/src/api/services/international-transfer.service.ts` | Adds USDC rail metadata to payout adapter input and persisted settlement evidence. |
| `backend/src/api/services/usd-payout-coordination.service.ts` | Exposes USDC rail metadata in `/api/transfers/:id/payout-evidence`. |
| `backend/src/api/services/international-transfer.types.ts` | Adds the payout-evidence `rail` contract. |
| `backend/tests/payout-adapter-contract.test.ts` | Verifies Circle payloads carry USDC rail metadata and redact sensitive values. |
| `backend/tests/international-transfer.service.test.ts` | Verifies a settled USDC transfer creates a Circle sandbox payout instruction through the real adapter with network mocked at `fetch`. |
| `backend/tests/international-transfer.routes.test.ts` | Updates route evidence shape for the new `rail` object. |
| `scripts/circle-e2e-test.ts` | Uses the official business-account payout status endpoint and redacts Circle identifiers. |
| `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md` | Documents the USDC rail, readiness result, evidence rules, and verification commands. |
| `backend/docs/CIRCLE_INTEGRATION_SETUP.md` | Documents current sandbox readiness and the Circle payout metadata sent by TTS. |
| `docs/project-brain/architecture/INTEGRATIONS.md` | Registers current Circle readiness and USDC rail behavior. |
| `docs/project-brain/architecture/MONEY-FLOWS.md` | Updates the BRL -> USDC -> USD lifecycle with Circle metadata. |
| `docs/project-brain/funding/GRANTS.md` | Updates D2 grant status. |
| `docs/insta-awards/deliverables/deliverable-2/*` | Refreshes D2 status, file map, readiness JSON, and evidence wording. |
| `docs/insta-awards/deliverables/deliverable-2/SUBMIT-THIS.md` | Exact submission guide for the four D2 evidence fields. |
| `docs/insta-awards/deliverables/deliverable-2/evidence/circle-sandbox-payout-redacted.json` | Redacted Circle sandbox payout execution snapshot. |

## Commands Run

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.service.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
```

Result:

- `tests/payout-adapter-contract.test.ts`: 8 tests passed.
- `tests/international-transfer.service.test.ts`: 13 tests passed.
- `tests/international-transfer.routes.test.ts`: 6 tests passed.

```bash
npm --prefix backend run circle:payout-readiness
```

Result:

- Circle sandbox API key present: yes.
- Linked wire destination present: yes.
- Destination type: `wire`.
- Destination evidence: hash `9c20e383eab6`, tail `cd88`.
- Source wallet present: yes.
- `ENABLE_REAL_PAYOUT_EXECUTION=true`.
- Circle sandbox API execution ready: yes.
- Blockers: none.

```bash
node <sanitized Circle API probe>
```

Result:

- `GET /v1/businessAccount/balances`: HTTP 200.
- `GET /v1/businessAccount/banks/wires`: HTTP 200.
- Configured linked destination found: yes.
- Linked destination status: `complete`.
- Bank description: `WELLS FARGO BANK, NA ****0010`.
- Mutating payout created: no.

```bash
node <sanitized Supabase D2 inspection script>
```

Result:

- `international_transfers`: 3.
- `international_payout_instructions`: 1.
- `international_payout_events`: 0.
- `international_transfer_reconciliations`: 3.
- Active D2 transfer: `tr_d2_circle_stellar_payment_2`.
- Active D2 Stellar hash shape: `64:hex64`.
- Active D2 payout provider: `circle`.
- Active D2 execution mode: `sandbox_api`.

```bash
node <TTS Circle sandbox execution script>
```

Result:

- Created transfer `tr_d2_circle_stellar_payment_2`.
- Attached Stellar hash `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`.
- Created payout instruction `circle_instruction_e0be3785-0b35-4690-9eb6-5f99b66167ab`.
- Persisted Circle provider response in `international_payout_instructions`.
- Execution mode: `sandbox_api`.
- Provider status after create: `pending`.

```bash
node <TTS Circle status polling script>
```

Result:

- Status refresh attempt 1: `pending`.
- Status refresh attempt 2: `pending`.
- Status refresh attempt 3: `pending`.
- Status history count: 5.

Additional protected refresh through the deployed frontend proxy:

```bash
curl -s -X POST http://127.0.0.1:3000/api/transfers/tr_d2_circle_stellar_payment_2/payout-status-refresh \
  -H "x-international-transfer-ops-secret: <ops-secret>" \
  -H "content-type: application/json" \
  -d "{}"
```

Result:

- Transfer status: `PAYOUT_COMPLETED`.
- Payout status: `completed`.
- Status history count: 6.
- Evidence endpoint now returns instruction status `completed`.

```bash
PORT=3099 node dist/server.js
curl -s http://127.0.0.1:3099/api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence
curl -s http://127.0.0.1:3099/api/transfers/payout-providers
```

Result:

- Payout evidence endpoint returned `success=true`, `ready=true`, `ready_count=4`, `execution_mode=sandbox_api`.
- Payout provider endpoint returned Circle `execution_mode=sandbox_api`, `configured=true`, `execution_enabled=true`, `blockers=[]`.

## Evidence Boundary

The Circle integration is sandbox-ready and executed at the application boundary. Submit the claim that TTS created, persisted, and observed completed status for a Circle sandbox payout instruction. Do not claim production bank delivery from sandbox evidence.

Completed:

- a 64-character Stellar transaction hash,
- `provider_name=circle`,
- a row in `public.international_payout_instructions`,
- a Circle provider payout reference,
- redacted provider request/response evidence,
- payout status polling evidence,
- completed Circle sandbox status observed through protected refresh.
