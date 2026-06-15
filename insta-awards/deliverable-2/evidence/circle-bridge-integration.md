# Evidence 3: Circle & Bridge Payout Integration

## Status

Compatibility mode implemented and tested. **Live API execution is gated behind env config** (`ENABLE_REAL_PAYOUT_EXECUTION=true` plus provider API keys).

## Architecture

Both `CircleCompatibilityAdapter` (`usd-payout-adapters.ts:525`) and `BridgeCompatibilityAdapter` (`usd-payout-adapters.ts:807`) extend the abstract `CompatibilityPayoutAdapter` (`usd-payout-adapters.ts:339`).

The adapter operates in three modes depending on configuration:

| Mode | Condition | Behavior |
|---|---|---|
| **Compatibility** | No API key, no create URL, or `ENABLE_REAL_PAYOUT_EXECUTION=false` | Builds the provider payload shape with all sensitive fields redacted. Stores as evidence only. No API call. |
| **Sandbox API** | API key + create URL + execution enabled + Circle sandbox URL detected | Executes a real POST to the provider's sandbox API. Persists redacted response evidence. |
| **Live API** | API key + create URL + execution enabled + production URL | Executes a real POST to the provider's production API. |

## Circle Compatibility Payload Shape (Redacted)

When running in compatibility mode, the adapter produces:

```json
{
  "provider_name": "circle",
  "status": "pending",
  "metadata": {
    "mode": "compatibility",
    "provider_api": "circle_mint_business_account_payouts",
    "provider_api_key_present": false,
    "provider_destination_id_present": false,
    "real_execution_enabled": false,
    "linked_bank_account_required": true,
    "provider_payload": {
      "idempotencyKey": "<uuid>",
      "destination": { "type": "wire", "id": "[REDACTED_HASH:xxxxxxxxxxxx]" },
      "amount": { "amount": "99.50", "currency": "USD" },
      "metadata": { ... }
    },
    "destination_metadata": {
      "account_holder_name": "[REDACTED]",
      "routing_number": "[REDACTED_LAST4:0021]",
      "account_number": "[REDACTED_LAST4:6789]"
    }
  }
}
```

Raw routing numbers, account numbers, and bank account IDs are **never persisted** in evidence — even the Circle bank account destination ID is hashed before storage.

## Bridge Compatibility Payload Shape (Redacted)

The Bridge adapter uses the base `CompatibilityPayoutAdapter` class with its own env key names:

```json
{
  "provider_name": "bridge",
  "status": "pending",
  "metadata": {
    "mode": "compatibility",
    "provider_api_key_present": false,
    "real_execution_enabled": false,
    "destination_provider_label": "mercury",
    "provider_payload": {
      "destination": {
        "account_number": "[REDACTED_LAST4:6789]",
        "iban": "[REDACTED]",
        "routing_number": "[REDACTED_LAST4:0021]"
      }
    }
  }
}
```

## Environment Variables

| Variable | Circle | Bridge | Description |
|---|---|---|---|
| API key | `CIRCLE_API_KEY` | `BRIDGE_API_KEY` | Provider authentication token |
| Create URL | `CIRCLE_PAYOUT_CREATE_URL` | `BRIDGE_PAYOUT_CREATE_URL` | POST endpoint for creating payouts |
| Status URL | `CIRCLE_PAYOUT_STATUS_URL` | `BRIDGE_PAYOUT_STATUS_URL` | GET endpoint for polling status (supports `{id}` template) |
| Webhook secret | `CIRCLE_PAYOUT_WEBHOOK_SECRET` | `BRIDGE_PAYOUT_WEBHOOK_SECRET` | Shared secret for webhook signature verification |
| Destination ID | `CIRCLE_PAYOUT_DESTINATION_ID` | N/A (in payload) | Pre-linked Circle bank account ID |
| Global execution gate | `ENABLE_REAL_PAYOUT_EXECUTION` | Same | Must be `'true'` for any live API call |
| Global webhook secret | `PAYOUT_WEBHOOK_SECRET` | Same | Fallback webhook secret |

## Circle Sandbox API Defaults

When `CIRCLE_PAYOUT_CREATE_URL` is not set, the adapter derives the URL from `CIRCLE_ENVIRONMENT`:

- `sandbox` (default): `https://api-sandbox.circle.com/v1/businessAccount/payouts`
- `production`: `https://api.circle.com/v1/businessAccount/payouts`

## Curl Examples

### Circle Compatibility Mode (no real execution)

```bash
curl -s http://localhost:3000/api/transfers/payout-providers | jq '.[] | select(.provider_name=="circle")'
```

Expected output includes `"execution_mode": "compatibility"` and `"execution_enabled": false`.

### Create a Payout Instruction via API (test mode)

```bash
curl -s -X POST http://localhost:3000/api/transfers \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "brl_amount": "500.00",
    "payout_provider": "circle",
    "payout_destination": {
      "accountHolderName": "Origin BR Institution Ltda",
      "accountHolderType": "business",
      "bankName": "Destination USD Banking Partner",
      "routingNumber": "021000021",
      "accountNumber": "123456789",
      "accountType": "checking",
      "country": "US"
    },
    "same_name_payout_required": true
  }' | jq '.payout_instruction'
```

### View Payout Evidence

```bash
curl -s http://localhost:3000/api/transfers/<transfer_id>/payout-evidence \
  -H 'Authorization: Bearer <token>' | jq .
```

## Test Output Format (from contract tests)

```
PASS  tests/payout-adapter-contract.test.ts
  PayoutProviderAdapter contract
    ✓ creates an ops-only mock instruction when mock policy explicitly allows it
    ✓ creates an Etherfuse proof payload without claiming USD bank payout execution
    ✓ creates a Circle compatibility payload with sensitive account fields redacted
    ✓ creates a Bridge compatibility payload with sensitive account fields redacted
    ✓ sends executable destination details while persisting only redacted evidence
    ✓ polls Circle payout status with the default sandbox endpoint
    ✓ rejects unknown payout adapters instead of falling back to mock
    ✓ reports provider readiness and normalizes signed provider events

Tests: 8 passed, 8 total
```

## Bridge Compatibility Note

The Bridge adapter is a **skeleton** — it inherits all behavior from `CompatibilityPayoutAdapter` with no overrides beyond env key names (`usd-payout-adapters.ts:807-813`). It runs in compatibility mode by default. A real Bridge API endpoint URL must be configured in `BRIDGE_PAYOUT_CREATE_URL` to enable execution.
