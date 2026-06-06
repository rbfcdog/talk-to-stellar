# BRL -> USDC -> USD Account Rail Runbook

This is the exact operational checklist for turning the new TalkToStellar international transfer rail into a reviewer-ready demo and, later, an integration-ready product.

The current implementation is an orchestration layer. It does not claim regulated money transmission, does not execute live ACH/wire by default, and labels sandbox or compatibility payout surfaces explicitly.

## 1. What Exists Now

Backend:

- BRL -> USD quote service at `POST /api/quotes/brl-usd`.
- International transfer state machine.
- Transfer creation at `POST /api/transfers`.
- Pix funding wrapper at `POST /api/transfers/:id/pix-intent`.
- Etherfuse Pix webhook receiver at `POST /api/webhooks/etherfuse/pix`.
- Operator-authorized Stellar settlement evidence step at `POST /api/transfers/:id/settle-stellar`.
- Operator-authorized USD payout instruction adapter at `POST /api/transfers/:id/payout-instruction`.
- Reconciliation report at `GET /api/transfers/:id/reconciliation`.
- Etherfuse proof, Circle compatibility, Bridge compatibility, and ops-only mock payout adapters.
- Wise is destination metadata only. There is no Wise API adapter and no Wise payout execution in this sprint.

Frontend:

- Live tester at `/international-transfer`.
- Existing cost/model lab remains at `/global-transfer`.
- Next.js proxies were added for `/api/quotes`, `/api/transfers`, and `/api/webhooks`.

Database:

- Migration file: `backend/migrations/20260520_00_international_usd_transfers.sql`.
- Tables:
  - `international_transfer_quotes`
  - `international_transfers`
  - `international_transfer_reconciliations`

## 2. Required Setup Before Testing

### 2.1 Apply The Migration

Run the SQL file in Supabase:

```bash
backend/migrations/20260520_00_international_usd_transfers.sql
```

The migration creates the quote, transfer, and reconciliation tables and enables RLS.

Important: because the backend uses the Supabase service role client, backend writes work after the migration. If you later expose these tables directly to browser clients, add user-scoped RLS policies first.

### 2.2 Backend Environment

For local or Railway sandbox:

```bash
STELLAR_NETWORK=TESTNET
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

ETHERFUSE_API_KEY=api_sand:...
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
ETHERFUSE_WEBHOOK_SECRET=choose-a-long-random-secret

INTERNATIONAL_TRANSFER_OPS_SECRET=choose-a-long-random-secret
PAYOUT_PROVIDER=etherfuse
ENABLE_REAL_PAYOUT_EXECUTION=false
ENABLE_MAINNET_SETTLEMENT_VALIDATION=false
MAX_MAINNET_VALIDATION_AMOUNT_USD=25
ALLOW_OPS_MOCKS=false
ALLOW_STELLAR_MOCK_SETTLEMENT=false
ALLOW_MOCK_USD_PAYOUTS=false
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=false
```

For real testnet Stellar settlement evidence:

```bash
STELLAR_SECRET_KEY=S...
STELLAR_PUBLIC_KEY=G...
USD_OFFRAMP_STELLAR_DESTINATION=G...
```

If those Stellar values are missing and `ALLOW_STELLAR_MOCK_SETTLEMENT` is not explicitly enabled for an ops-only run, the settlement step fails instead of producing fake evidence.

### 2.3 Frontend Environment

For local:

```bash
BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

For Railway/Vercel:

```bash
BACKEND_URL=https://your-backend-service.up.railway.app
NEXT_PUBLIC_BACKEND_URL=https://your-backend-service.up.railway.app
```

Do not proxy provider webhook secrets through the browser. Real Etherfuse callbacks must call the backend webhook route with the provider secret. Local funding confirmation uses the operator-only transfer endpoint and requires `INTERNATIONAL_TRANSFER_OPS_SECRET`.
The reviewer UI only sends that ops secret when an operator types it into `Execution credentials`; it is not injected by the public frontend proxy.
If the destination account profile is `wise`, payout adapters keep it as metadata-only and return `wise_metadata_only`; they do not call Wise or execute a provider payout to Wise details.

## 3. How To Test From The Frontend

Open:

```text
/international-transfer
```

Use the buttons in this order:

1. `Quote`
   - Calls `POST /api/quotes/brl-usd`.
   - Creates a BRL -> USD quote with fees, estimated USDC, estimated USD, FX rate, expiry, and quote ID.

2. `Transfer`
   - Calls `POST /api/transfers`.
   - Creates the tracked transfer using the quote and the international USD bank account destination.
   - Initial status becomes `QUOTE_CREATED`.

3. `Pix intent`
   - Calls `POST /api/transfers/:id/pix-intent`.
   - With `Mock Pix funding intent` enabled, it creates a sandbox Pix reference.
   - With mock disabled, it attempts the real Etherfuse sandbox flow and needs a valid TalkToStellar session.
   - Status becomes `PIX_PENDING`.

4. Funding confirmation
   - Real route: Etherfuse calls `POST /api/webhooks/etherfuse/pix` directly with the provider webhook secret.
   - Operator route: `POST /api/transfers/:id/funding-confirmation` requires `INTERNATIONAL_TRANSFER_OPS_SECRET` and only works for ops-enabled mock Pix intents.
   - Status becomes `PIX_RECEIVED`.

5. `Stellar`
   - Calls `POST /api/transfers/:id/settle-stellar`.
   - Requires `INTERNATIONAL_TRANSFER_OPS_SECRET` in `Execution credentials`.
   - Moves through BRL -> USDC and Stellar settlement states.
   - Attaches `stellar_tx_hash`, `stellar_memo`, source/destination accounts, asset data, and settlement timestamp.
   - If Stellar secrets are not configured, this fails unless ops-only mock settlement is explicitly enabled.

6. `Payout`
   - Calls `POST /api/transfers/:id/payout-instruction`.
   - Requires `INTERNATIONAL_TRANSFER_OPS_SECRET` in `Execution credentials`.
   - Creates a USD payout instruction through the selected adapter.
   - Default provider is `etherfuse`.

7. `Payout status`
   - Calls `POST /api/transfers/:id/payout-status-refresh`.
   - Requires `INTERNATIONAL_TRANSFER_OPS_SECRET` in `Execution credentials`.
   - Calls the selected adapter status method and updates transfer/reconciliation state.

8. `Reconciliation`
   - Calls `GET /api/transfers/:id/reconciliation`.
   - Returns the linked quote ID, Pix reference, Stellar tx hash/memo, payout instruction ID, provider payout ID, and final payout status.

`Run payment-backed route` creates the quote, transfer, and Pix intent. Later operator-only steps require provider callbacks or an explicit ops secret.

## 4. How To Test From Curl

### 4.1 Create Quote

```bash
curl -s -X POST http://localhost:3001/api/quotes/brl-usd \
  -H "Content-Type: application/json" \
  -d '{ "brl_amount": "1000", "user_id": "demo-user" }' | jq
```

Save `quote.quote_id`.

### 4.2 Create Transfer

```bash
curl -s -X POST http://localhost:3001/api/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "quote_id": "QUOTE_ID",
    "user_id": "demo-user",
    "sender_identity": {
      "legal_name": "Rodrigo Banin",
      "email": "rodrigo@example.com",
      "country": "BR",
      "type": "individual"
    },
    "recipient_identity": {
      "legal_name": "Rodrigo Banin",
      "country": "US",
      "type": "individual"
    },
    "payout_destination": {
      "accountHolderName": "Rodrigo Banin",
      "accountHolderType": "individual",
      "bankName": "International USD Bank",
      "routingNumber": "021000021",
      "accountNumber": "123456789",
      "accountType": "checking",
      "country": "US",
      "providerLabel": "other"
    }
  }' | jq
```

Save `transfer.transfer_id`.

### 4.3 Create Mock Pix Intent

Requires:

```bash
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true
```

```bash
curl -s -X POST http://localhost:3001/api/transfers/TRANSFER_ID/pix-intent \
  -H "Content-Type: application/json" \
  -d '{ "mock_pix_intent": true }' | jq
```

### 4.4 Simulate Pix Confirmed

```bash
curl -s -X POST http://localhost:3001/api/webhooks/etherfuse/pix \
  -H "Content-Type: application/json" \
  -H "X-Etherfuse-Webhook-Secret: YOUR_SECRET" \
  -d '{
    "transfer_id": "TRANSFER_ID",
    "order_id": "PIX_ORDER_ID",
    "status": "completed",
    "event": "pix.received"
  }' | jq
```

### 4.5 Attach Stellar Settlement Evidence

```bash
curl -s -X POST http://localhost:3001/api/transfers/TRANSFER_ID/settle-stellar \
  -H "Content-Type: application/json" \
  -H "X-International-Transfer-Ops-Secret: YOUR_OPS_SECRET" \
  -d '{}' | jq
```

### 4.6 Create USD Payout Instruction

```bash
curl -s -X POST http://localhost:3001/api/transfers/TRANSFER_ID/payout-instruction \
  -H "Content-Type: application/json" \
  -H "X-International-Transfer-Ops-Secret: YOUR_OPS_SECRET" \
  -d '{ "provider": "etherfuse" }' | jq
```

### 4.7 Refresh Payout Status

```bash
curl -s -X POST http://localhost:3001/api/transfers/TRANSFER_ID/payout-status-refresh \
  -H "Content-Type: application/json" \
  -H "X-International-Transfer-Ops-Secret: YOUR_OPS_SECRET" \
  -d '{}' | jq
```

### 4.8 Get Reconciliation

```bash
curl -s http://localhost:3001/api/transfers/TRANSFER_ID/reconciliation | jq
```

## 5. Integrations Still Needed

### 5.1 Pix/Etherfuse

Needed:

- Confirm the production/sandbox Etherfuse webhook payload shape.
- Point Etherfuse webhook to:

```text
https://YOUR_BACKEND/api/webhooks/etherfuse/pix
```

- Set `ETHERFUSE_WEBHOOK_SECRET` only in the backend/provider configuration.
- Map the real Etherfuse transaction/order ID to `pix_order_id` and `pix_payment_id`.
- Preserve webhook replay/idempotency evidence if Etherfuse sends event IDs.

Current status:

- The service already wraps existing Etherfuse customer, quote, and on-ramp calls.
- Explicit mock Pix intents are ops-only and disabled unless `ALLOW_OPS_MOCKS=true` and `INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true`.

### 5.2 Stellar Settlement

Needed:

- Fund the configured Stellar source wallet on testnet.
- Add the USDC trustline where needed.
- Configure `STELLAR_SECRET_KEY`, `STELLAR_PUBLIC_KEY`, and `USD_OFFRAMP_STELLAR_DESTINATION`.
- Confirm whether the destination is the off-ramp provider wallet, a treasury wallet, or a sandbox provider wallet.

Current status:

- If configured, the settlement service submits a Stellar payment.
- If not configured, settlement fails unless ops-only mock settlement is explicitly enabled.
- Mainnet execution is blocked unless `ENABLE_MAINNET_SETTLEMENT_VALIDATION=true`.

### 5.3 USD Payout Provider

Needed:

- Choose the first real provider path:
  - Bridge-style stablecoin orchestration and payout.
  - Circle-style treasury mint/redeem flow.
  - Another regulated payout provider.
- Replace compatibility URLs with provider sandbox endpoints.
- Map provider response IDs to `provider_payout_id`.
- Implement provider status polling/webhook handling.
- Add provider-specific error mapping.

Current status:

- `PAYOUT_PROVIDER=etherfuse` is the default proof adapter.
- `PAYOUT_PROVIDER=circle` and `PAYOUT_PROVIDER=bridge` prepare provider-shaped compatibility payloads.
- `PAYOUT_PROVIDER=mock` is ops-only and should not be used for reviewer evidence unless clearly labeled.
- Real API execution only happens if `ENABLE_REAL_PAYOUT_EXECUTION=true` and the provider URL/API key are set.

### 5.4 Identity And Compliance Operations

Needed:

- Define when same-name payout is required.
- Decide which mismatches go to manual review.
- Add KYC/KYB provider data to sender and recipient identity records.
- Add sanctions screening and transaction monitoring before live payouts.
- Confirm IOF, FX classification, reporting, and regulated partner responsibilities with counsel.

Current status:

- Same-name matching exists.
- Mismatches are flagged in `same_name_match_status` and `identity_risk_notes`.
- Mismatches do not block automatically yet.

### 5.5 Database Hardening

Needed before direct client access:

- Add RLS policies scoped by authenticated user/institution.
- Add audit tables for status transitions and webhook receipt IDs.
- Add immutable ledger entries for money movement.

Current status:

- RLS is enabled by migration.
- Backend service role handles server-side writes.
- Reconciliation record links quote, Pix, Stellar, and payout evidence.

## 6. Demo Evidence To Capture

For Instawards or SCF evidence, capture:

- Screenshot of `/international-transfer` before running.
- Screenshot after `Quote`.
- Screenshot after funding confirmation or real provider callback.
- Screenshot after operator-authorized Stellar settlement.
- Screenshot after operator-authorized payout instruction.
- Screenshot of the reconciliation JSON.
- Backend logs for the same transfer ID.
- Stellar explorer link if a real testnet transaction was submitted.
- The commit hash that contains the implementation.

## 7. Production Decision Points

Do not proceed to live funds until these decisions are closed:

- Who is the regulated FX partner in Brazil?
- Who receives Pix in production?
- Who owns KYC/KYB and sanctions screening?
- Which provider redeems USDC into bank USD?
- Which provider executes ACH/wire/SWIFT payout?
- Are same-name payouts mandatory for the first pilot?
- What is the maximum ticket size for low-value mainnet validation?
- What is the refund path if Pix is received but Stellar or payout fails?

## 8. Recommended Next Build Order

1. Apply database migration in Supabase.
2. Deploy backend with sandbox env.
3. Deploy frontend with `BACKEND_URL` and `NEXT_PUBLIC_BACKEND_URL`.
4. Open `/international-transfer` and run `Run payment-backed route`.
5. Configure Stellar testnet secrets and off-ramp destination.
6. Run the same flow again and confirm a real Stellar testnet hash is attached.
7. Request sandbox access for Bridge or Circle.
8. Validate a provider compatibility adapter in sandbox.
9. Add provider payout status polling/webhook handling.
10. Add manual-review state before third-party or mismatched payouts.
