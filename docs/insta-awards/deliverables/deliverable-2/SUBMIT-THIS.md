# Deliverable 2 — Submit This

Use these exact artifacts for the four D2 fields.

## 1. Adapter Interface Code

Submit code references:

- `backend/src/api/services/usd-payout-adapters.ts`
- `backend/src/api/services/international-transfer.service.ts`
- `backend/src/api/services/usd-payout-coordination.service.ts`
- `backend/src/api/controllers/international-transfers.controller.ts`
- `backend/src/api/routes/international-transfers.router.ts`
- `backend/src/api/repository/international-transfer.repository.ts`

Supporting tests:

- `backend/tests/payout-adapter-contract.test.ts`
- `backend/tests/international-transfer.service.test.ts`
- `backend/tests/international-transfer.routes.test.ts`

Reviewer summary:

```text
TalkToStellar implements a provider-agnostic payout adapter that converts settled Stellar USDC transfer records into USD payout instructions. The Circle adapter creates Circle Mint /v1/businessAccount/payouts requests, stores redacted provider request/response evidence, polls payout status, and normalizes webhook events.
```

## 2. Hash Transacao Stellar

Submit:

- `docs/insta-awards/deliverables/deliverable-2/evidence/stellar-transaction-hash.md`
- Stellar transaction hash: `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`
- Explorer: `https://stellar.expert/explorer/testnet/tx/e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`

Reviewer summary:

```text
The D2 Circle payout evidence is tied to a database-backed Stellar testnet USDC payment from payment_logs.id=2 and operation 259de57a-ca16-409b-bf73-79c5641cbf16. The transaction hash is a 64-character Stellar testnet hash and is attached to transfer tr_d2_circle_stellar_payment_2.
```

## 3. Integracao Circle/Bridge

Submit:

- `docs/insta-awards/deliverables/deliverable-2/evidence/circle-bridge-integration.md`
- `docs/insta-awards/deliverables/deliverable-2/evidence/circle-readiness-redacted.json`
- `docs/insta-awards/deliverables/deliverable-2/evidence/circle-sandbox-payout-redacted.json`
- `backend/docs/CIRCLE_INTEGRATION_SETUP.md`
- `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`

Reviewer summary:

```text
Circle sandbox API execution is complete for transfer tr_d2_circle_stellar_payment_2. The Circle provider reports execution_mode=sandbox_api, configured=true, execution_enabled=true, and no blockers. The raw Circle API key, linked destination ID, and provider payout ID are not committed; evidence uses redacted hash/tail references.
```

Bridge boundary:

```text
Bridge remains compatibility-only until provider credentials and payout endpoints are available.
```

## 4. Payout Instructions

Submit:

- `docs/insta-awards/deliverables/deliverable-2/evidence/payout-instructions.md`
- `docs/insta-awards/deliverables/deliverable-2/evidence/circle-sandbox-payout-redacted.json`

Key proof:

```text
transfer_id: tr_d2_circle_stellar_payment_2
payout_instruction_id: circle_instruction_e0be3785-0b35-4690-9eb6-5f99b66167ab
provider: circle
execution_mode: sandbox_api
payout_status: completed
provider_payout_reference_hash: d6a354577130d3e1
provider_payout_reference_tail: ef7481
rail: PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK
settlement_asset_code: USDC
off_ramp_source_asset_code: USDC
```

Reviewer summary:

```text
TalkToStellar created a Circle sandbox USD payout instruction from a settled Stellar USDC record, persisted the Circle provider response in international_payout_instructions, refreshed provider status to completed, attached the Stellar settlement hash to payout evidence, and exposed reviewer evidence at /api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence.
```
