# Bridge.xyz API Quick Reference

## Authentication
```
Header: Api-Key: {your_api_key}
Header: Idempotency-Key: {unique_key}
Base URL: https://api.bridge.xyz/v0
```

## Customers & KYC

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v0/customers` | Create customer (individual/business) |
| `GET` | `/v0/customers/{id}` | Get customer |
| `PUT` | `/v0/customers/{id}` | Update customer (KYC data) |
| `POST` | `/v0/customers/{id}/kyc_links` | Generate hosted KYC URL |
| `GET` | `/v0/kyc_links/{id}` | Check KYC status |

## Transfers (One-Time)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v0/transfers` | Create transfer (on-ramp or off-ramp) |
| `GET` | `/v0/transfers/{id}` | Get transfer status |
| `GET` | `/v0/customers/{id}/transfers` | List customer transfers |
| `DELETE` | `/v0/transfers/{id}` | Cancel awaiting_funds transfer |

### Transfer States
`awaiting_funds` → `pending` → `completed` / `failed`

### Source/Destination Payment Rails
- `pix` (BRL)
- `ach_push`, `ach`, `ach_same_day`, `wire`, `fednow` (USD)
- `stellar`, `ethereum`, `solana`, `polygon`, `base`, `arbitrum`, etc.
- `bridge_wallet` (custodial)

## Virtual Accounts (Persistent Deposit)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v0/customers/{id}/virtual_accounts` | Create deposit address |
| `GET` | `/v0/customers/{id}/virtual_accounts` | List virtual accounts |
| `PUT` | `/v0/virtual_accounts/{id}` | Update virtual account |
| `POST` | `/v0/virtual_accounts/{id}/deactivate` | Deactivate |
| `POST` | `/v0/virtual_accounts/{id}/reactivate` | Reactivate |

## External Accounts (Off-Ramp Destinations)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v0/customers/{id}/external_accounts` | Add PIX key or US bank |
| `GET` | `/v0/customers/{id}/external_accounts` | List external accounts |

### PIX Key External Account
```json
{
  "currency": "brl",
  "account_type": "pix_key",
  "pix_key": "email@example.com",
  "account_owner_name": "Ada Lovelace"
}
```

### US Bank External Account
```json
{
  "currency": "usd",
  "account_type": "us",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "account_owner_type": "individual",
  "account_owner_name": "Ada Lovelace",
  "account": {
    "routing_number": "101019644",
    "account_number": "215268129123",
    "checking_or_savings": "checking"
  },
  "address": {
    "street_line_1": "923 Folsom Street",
    "country": "USA",
    "state": "CA",
    "city": "San Francisco",
    "postal_code": "941070000"
  }
}
```

## Liquidation Addresses (Auto-Forward)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v0/customers/{id}/liquidation_addresses` | Create auto-forward address |
| `GET` | `/v0/customers/{id}/liquidation_addresses` | List liquidation addresses |

## Bridge Wallets (Custodial)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/v0/bridge_wallets` | Create custodial wallet |
| `GET` | `/v0/bridge_wallets/{id}` | Get wallet details |

## Exchange Rates

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/v0/exchange_rates?from=usdc&to=brl` | Get current rate |

## Webhooks

Events: `transfer.completed`, `transfer.failed`, `virtual_account.deposit_received`, etc.
Verify with signature header `X-Bridge-Signature`.

## Developer Fees

Set `developer_fee_percent` (e.g., `"0.30"` for 0.30%) on transfers and virtual accounts.
Bridge automatically withholds the fee from the transaction amount.

## Stellar-Specific Notes

- **USDC on Stellar**: Use `"payment_rail": "stellar"`, `"currency": "usdc"`, `"address": "G..."`
- **EURC on Stellar**: Also supported as `"stellar"` + `"eurc"`
- **Minimums**: 10 BRL for PIX, $1 USD for ACH, 2 BRL for PIX off-ramp
- Stellar addresses must be valid G... format public keys
