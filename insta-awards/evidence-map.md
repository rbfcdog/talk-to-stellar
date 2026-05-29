# Evidence Map for Reviewers

This document maps each planned evidence item in the Instawards SOW to concrete
repository locations and demo artifacts that should be captured.

## Backend Code Evidence

| Evidence | Where to inspect |
| --- | --- |
| Express route mounting | `backend/src/app.ts` |
| Quote endpoint | `backend/src/api/routes/quotes.router.ts`, `backend/src/api/controllers/quotes.controller.ts` |
| BRL/USD quote logic | `backend/src/api/services/brl-usd-quote.service.ts` |
| Transfer endpoint | `backend/src/api/routes/international-transfers.router.ts`, `backend/src/api/controllers/international-transfers.controller.ts` |
| Transfer orchestration | `backend/src/api/services/international-transfer.service.ts` |
| Transfer state machine | `backend/src/api/services/international-transfer-state.service.ts` |
| Transfer data types | `backend/src/api/services/international-transfer.types.ts` |
| Transfer repository | `backend/src/api/repository/international-transfer.repository.ts` |
| Pix funding | `backend/src/api/services/pix-funding.service.ts` |
| Etherfuse ramp integration | `backend/src/api/services/anchor.service.ts`, `backend/src/api/routes/ramp.router.ts` |
| Stellar settlement | `backend/src/api/services/stellar-settlement.service.ts` |
| Stellar pathfinding and payment submission | `backend/src/api/services/stellar.service.ts` |
| Settlement evidence | `backend/src/api/services/settlement-evidence.service.ts` |
| Payout adapters | `backend/src/api/services/usd-payout-adapters.ts` |
| Stellar transaction evidence repository | `backend/src/api/repository/stellar-transaction.repository.ts` |

## Database Evidence

Migration:

```text
backend/migrations/20260520_00_international_usd_transfers.sql
```

Tables:

```text
international_transfer_quotes
international_transfers
international_transfer_reconciliations
```

Reviewer evidence to export:

- One quote row.
- One transfer row.
- One reconciliation row.
- Any attached Stellar transaction hash.
- Pix order/payment reference.
- Payout instruction/provider reference.

## API Evidence

Base API route mounting:

```text
/api/quotes
/api/transfers
```

Recommended reviewer API sequence:

```text
POST /api/quotes/brl-usd
POST /api/transfers
POST /api/transfers/:id/pix-intent
POST /api/transfers/:id/funding-confirmation
POST /api/transfers/:id/settle-stellar
POST /api/transfers/:id/payout-instruction
GET  /api/transfers/:id/reconciliation
GET  /api/transfers/:id
```

Evidence to capture:

- Request body.
- Response body.
- HTTP status.
- Transfer state after each call.
- Redacted error output if a provider is not configured.
- Timestamp of each transition.

## Frontend Evidence

Reviewer/demo UI:

```text
frontend/app/institution-settlement/page.tsx
frontend/app/international-transfer/page.tsx
frontend/app/international-transfer/international-transfer-client.tsx
```

Routes:

```text
/institution-settlement
/international-transfer
```

Evidence to capture:

- Initial setup screen.
- Quote generated.
- Transfer/lifecycle record created.
- Funding intent created.
- Funding confirmed.
- Stellar settlement evidence attached.
- Payout instruction created.
- Reconciliation panel.
- API log panel with sensitive data redacted.

## Test Evidence

Primary tests:

```text
backend/tests/international-transfer.service.test.ts
backend/tests/financial-conversion-reference.test.ts
```

What they prove:

- BRL/USD quotes can be created with route/path quote data.
- Same-name payout checks work.
- Transfer lifecycle advances through quote, Pix, Stellar settlement, payout,
  and reconciliation.
- Reconciliation metrics include route evidence and fee validation.
- Conversion quote safety avoids using obviously distorted testnet rates.

Recommended validation commands:

```bash
npm --prefix backend test -- --runInBand backend/tests/international-transfer.service.test.ts
npm --prefix backend test -- --runInBand backend/tests/financial-conversion-reference.test.ts
```

If the exact Jest invocation differs in the deployed environment, use the
project's current backend test script and preserve the output in the evidence
package.

## Existing Documentation Evidence

| Document | Use |
| --- | --- |
| `sow/SOW_instawards_submission_brl_usd_rail_20260520.md` | Current SOW source in repo. |
| `docs/BRL_USD_INTERNATIONAL_ACCOUNT_DELIVERY.md` | Technical overview and API flow. |
| `docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md` | Reviewer UI walkthrough. |
| `docs/BRL_USD_STELLAR_WISE_TECHNICAL_DESIGN.md` | Architecture and provider design background. |
| `docs/BRL_USD_RAIL_OPERATOR_RUNBOOK.md` | Operator-oriented runbook, if current environment uses it. |

## Stellar Evidence

Real Stellar evidence is available only if settlement credentials and
destination are configured.

Relevant environment variables:

```text
STELLAR_NETWORK
STELLAR_SECRET_KEY
STELLAR_PUBLIC_KEY
USDC_ASSET_CODE
USDC_ASSET_ISSUER
USD_OFFRAMP_STELLAR_DESTINATION
PAYOUT_STELLAR_DESTINATION_PUBLIC_KEY
ENABLE_MAINNET_SETTLEMENT_VALIDATION
MAX_MAINNET_VALIDATION_AMOUNT_USD
```

Evidence to capture:

- Network: testnet or public.
- Transaction hash.
- Memo/reference.
- Source account.
- Destination account.
- Asset code and issuer.
- Amount.
- Horizon link or explorer link.

If credentials are missing and the service returns mock/sandbox evidence, the
evidence package must label it clearly as mock/sandbox and should not present it
as real settlement.

## Payout Adapter Evidence

Relevant file:

```text
backend/src/api/services/usd-payout-adapters.ts
```

Adapters and evidence:

| Adapter | Evidence to capture | Current production status |
| --- | --- | --- |
| Mock | Instruction ID, provider status, simulated completion flag. | Sandbox/mock only. |
| Etherfuse | Prepared off-ramp proof payload or sandbox off-ramp result if credentials/PIN are provided. | Sandbox/proof only. |
| Circle | Provider-shaped request payload and response if sandbox URL/API key are configured. | Compatibility only unless explicitly enabled. |
| Bridge | Provider-shaped request payload and response if sandbox URL/API key are configured. | Compatibility only unless explicitly enabled. |

Provider execution controls:

```text
PAYOUT_PROVIDER
CIRCLE_API_KEY
CIRCLE_PAYOUT_CREATE_URL
BRIDGE_API_KEY
BRIDGE_PAYOUT_CREATE_URL
ENABLE_REAL_PAYOUT_EXECUTION
MOCK_USD_PAYOUT_AUTO_COMPLETE
```

## Final Review Package Checklist

- Git commit hash for the final sprint code.
- Environment summary with secrets redacted.
- Database migration applied.
- Demo video.
- Screenshots from `/institution-settlement`.
- API request/response transcript.
- Transfer lifecycle row from database.
- Reconciliation JSON.
- Stellar transaction hash if real testnet/mainnet validation was configured.
- Payout adapter payload and provider response or sandbox proof.
- Risk/compliance note stating this is not production remittance.
- README or setup instructions for reproducing the demo.
