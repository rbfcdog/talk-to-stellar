# BRL to USD International Account Delivery

This layer extends TalkToStellar with a transfer rail for:

`BRL funding via Pix -> USDC settlement on Stellar -> USD payout instruction to an international bank account`

The destination is modeled generically as an international USD bank account. Wise, Mercury and Revolut are only examples of account providers that may expose USD account details.

## Architecture Overview

New backend modules:

- `BrlUsdQuoteService`: creates BRL -> USD quotes using existing Stellar BRL/USDC pathfinding when available, with a configured fallback rate for sandbox/dev gaps.
- `InternationalTransferService`: owns the lifecycle state machine and orchestration.
- `PixFundingService`: wraps the existing Etherfuse Pix/on-ramp integration instead of duplicating it.
- `StellarSettlementService`: creates or mocks USDC Stellar settlement evidence.
- `SettlementEvidenceService`: builds reconciliation records.
- `PayoutProviderAdapter`: generic USD payout provider interface.
- `MockUsdPayoutAdapter`, `CircleCompatibilityAdapter`, `BridgeCompatibilityAdapter`: payout adapter implementations.

Transfer states:

`QUOTE_CREATED -> PIX_PENDING -> PIX_RECEIVED -> BRL_TO_USDC_PENDING -> USDC_SETTLEMENT_PENDING -> USDC_SETTLED -> PAYOUT_INSTRUCTION_CREATED -> PAYOUT_PENDING -> PAYOUT_COMPLETED`

Failure states:

`FAILED`, `REFUNDED`

## What Is Real

- Quote generation can use the existing Stellar pathfinding quote for configured BRL/USDC assets.
- Pix funding intent creation uses the existing Etherfuse integration.
- Testnet Stellar settlement can submit a real USDC transaction if `STELLAR_SECRET_KEY` and a payout/off-ramp Stellar destination are configured.
- Reconciliation records persist quote, Pix, Stellar and payout evidence.

## What Is Sandboxed

- USD bank payout defaults to `PAYOUT_PROVIDER=mock`.
- Circle and Bridge adapters prepare provider-shaped payout payloads but do not execute a bank payout unless `ENABLE_REAL_PAYOUT_EXECUTION=true` and provider create URL/API key are explicitly configured.
- If Stellar settlement secrets or destination account are missing, the settlement layer creates mock evidence and marks that no real money moved.
- Mainnet settlement does not execute unless `ENABLE_MAINNET_SETTLEMENT_VALIDATION=true` and the amount is below `MAX_MAINNET_VALIDATION_AMOUNT_USD`.

## Environment

Required for normal testnet development:

```bash
STELLAR_NETWORK=TESTNET
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
ETHERFUSE_API_KEY=api_sand:...
ETHERFUSE_WEBHOOK_SECRET=change-me
PAYOUT_PROVIDER=mock
```

Optional real testnet Stellar settlement:

```bash
STELLAR_SECRET_KEY=S...
STELLAR_PUBLIC_KEY=G...
USD_OFFRAMP_STELLAR_DESTINATION=G...
```

Small-value mainnet validation:

```bash
STELLAR_NETWORK=PUBLIC
STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=true
ENABLE_MAINNET_SETTLEMENT_VALIDATION=true
MAX_MAINNET_VALIDATION_AMOUNT_USD=25
```

Provider adapter selection:

```bash
PAYOUT_PROVIDER=mock # mock|circle|bridge
CIRCLE_API_KEY=
CIRCLE_PAYOUT_CREATE_URL=
BRIDGE_API_KEY=
BRIDGE_PAYOUT_CREATE_URL=
ENABLE_REAL_PAYOUT_EXECUTION=false
```

## API Flow

### 1. Create Quote

```bash
curl -s -X POST http://localhost:3001/api/quotes/brl-usd \
  -H "Content-Type: application/json" \
  -d '{ "brl_amount": "560", "user_id": "user_123" }' | jq
```

Response shape:

```json
{
  "success": true,
  "quote": {
    "quote_id": "q_brl_usd_...",
    "source_currency": "BRL",
    "destination_currency": "USD",
    "brl_amount": "560.00",
    "estimated_usdc_amount": "99.7",
    "estimated_usd_amount": "99.45",
    "fx_rate": "5.60000000",
    "platform_fee": { "amount": "1.68", "currency": "BRL", "bps": 30 },
    "estimated_provider_fee": { "amount": "0.24925", "currency": "USD", "bps": 25 },
    "quote_status": "ACTIVE",
    "expires_at": "..."
  }
}
```

### 2. Create Transfer

```bash
curl -s -X POST http://localhost:3001/api/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "quote_id": "q_brl_usd_...",
    "user_id": "user_123",
    "sender_identity": { "legal_name": "Rodrigo Banin", "email": "rodrigo@example.com", "country": "BR" },
    "recipient_identity": { "legal_name": "Rodrigo Banin", "country": "US" },
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

### 3. Create Pix Funding Intent

```bash
curl -s -X POST http://localhost:3001/api/transfers/TR_ID/pix-intent \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "SESSION_ID",
    "session_token": "SESSION_TOKEN"
  }' | jq
```

This wraps the existing Etherfuse Pix flow and stores `pix_order_id`, `pix_payment_id` and payment instructions on the transfer.

### 4. Pix Confirmation Webhook

```bash
curl -s -X POST "http://localhost:3001/webhooks/etherfuse/pix?secret=change-me" \
  -H "Content-Type: application/json" \
  -d '{ "order_id": "pix-order-id", "status": "completed" }' | jq
```

The transfer moves to `PIX_RECEIVED`.

### 5. Settle USDC on Stellar

```bash
curl -s -X POST http://localhost:3001/api/transfers/TR_ID/settle-stellar | jq
```

The transfer moves through `BRL_TO_USDC_PENDING`, `USDC_SETTLEMENT_PENDING` and `USDC_SETTLED`. Evidence includes Stellar tx hash, memo/reference, source account, destination account, asset and network.

### 6. Create USD Payout Instruction

```bash
curl -s -X POST http://localhost:3001/api/transfers/TR_ID/payout-instruction \
  -H "Content-Type: application/json" \
  -d '{ "provider": "mock" }' | jq
```

Default behavior creates a sandbox instruction and does not execute ACH, wire or SWIFT.

### 7. Reconciliation

```bash
curl -s http://localhost:3001/api/transfers/TR_ID/reconciliation | jq
```

Example output includes:

```json
{
  "success": true,
  "reconciliation": {
    "transfer_id": "tr_brl_usd_...",
    "quote_id": "q_brl_usd_...",
    "pix_order_id": "pix-order-id",
    "stellar_tx_hash": "hash-or-mock-hash",
    "stellar_memo": "tts-reference",
    "payout_instruction_id": "mock_instruction_...",
    "provider_payout_id": "mock_payout_...",
    "final_payout_status": "pending"
  }
}
```

## Same-Name Payout Alignment

The transfer stores:

- `same_name_payout_required`
- `same_name_match_status`
- `identity_risk_notes`

The system compares sender legal name, institution/entity name, recipient legal name and payout destination owner. Mismatches are flagged for review but are not automatically blocked in this software layer.

## Adding a Real Provider Adapter

Implement `PayoutProviderAdapter`:

```ts
createPayoutInstruction(input): Promise<PayoutInstruction>
getPayoutStatus(providerPayoutId): Promise<PayoutStatus>
cancelPayout?(providerPayoutId): Promise<void>
```

Then add the provider to `getPayoutProviderAdapter()` and keep real bank execution gated by explicit env configuration.
