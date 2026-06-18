# Bridge.xyz — Error Reference

Errors encountered during integration and their fixes.

## Customer Creation

| Error | Cause | Fix |
|-------|-------|-----|
| `unauthorized` | API key missing or wrong format | Use `Api-Key` header (not bearer) |
| `missing_address_data` | Customer needs KYC with address verification | Complete Persona KYC flow |
| `fields missing from customer body` | Missing required fields | Send `first_name`, `last_name`, `type` |
| `country is not a recognized field` | `country` not a top-level field | Remove `country` — goes in `residential_address.country` |
| `type must be individual or business` | Missing or invalid `type` | Always send `type: "individual"` |

## PIX External Account

| Error | Cause | Fix |
|-------|-------|-----|
| `account_type must be one of: pix, us, iban...` | Wrong account_type | Use `"pix"` not `"pix_key"` |
| `pix_key must be Hash` | pix_key must be an object | Send `pix_key: { pix_key: "..." }` |
| `missing_address_data` | Customer needs completed KYC | Complete Persona KYC first |

## Liquidation Addresses

| Error | Cause | Fix |
|-------|-------|-----|
| `chain is missing` | Required field | Include `chain: "base"` in payload |
| `missing_address_data` | Customer needs KYC | Complete Persona KYC first |

## Virtual Accounts

| Error | Cause | Fix |
|-------|-------|-----|
| `missing_address_data` | Customer needs KYC | Complete Persona KYC first |

## Exchange Rates

| Error | Cause | Fix |
|-------|-------|-----|
| 404 on `/exchange_rate` | Wrong path | Use `GET /exchange_rates?from=usd&to=brl` |
| `usdc` pair not supported | Only fiat pairs (USD↔BRL) | Use `usd` not `usdc` |
| Supported pairs: USD↔BRL, USD↔COP, USD↔EUR, USD↔GBP, USD↔MXN, USD↔USDT |

## KYC Links

| Error | Cause | Fix |
|-------|-------|-----|
| 401 on `POST /customers/:id/kyc_links` | API key lacks KYC permission | Use standalone `POST /kyc_links` with `email` + `type` |
| `duplicate_record` with 400 | KYC link already exists | Return `existing_kyc_link` from error response |
| `email is missing, type is missing` | Required for standalone endpoint | Send `{ email, type }` |

## KYC Requirements (All Money Movement Blocked Without This)

Customer `status: not_started` → needs:
1. **ToS acceptance** — via `tos_link` → opens `compliance.bridge.xyz/accept-terms-of-service`
2. **Persona KYC** — via `kyc_link` → opens `bridge.withpersona.com/verify`
3. Required fields: `tax_identification_number` (CPF), `date_of_birth`, `address_of_residence`, `min_age_18`, `government_id_document`, `selfie_verification`

**Every money-moving feature requires KYC completion:**
- PIX external accounts
- Liquidation addresses
- Virtual accounts
- Transfers

## List Responses

| Error | Cause | Fix |
|-------|-------|-----|
| `customers.find is not a function` | Bridge returns `{ count, data: [...] }` | Unwrap `.data` from list responses |
| Same for all list endpoints | All return `{ data: [...] }` | Fixed in `listCustomers`, `listVirtualAccounts`, `listExternalAccounts`, `listLiquidationAddresses`, `listCustomerTransfers` |

## Route Order

| Error | Cause | Fix |
|-------|-------|-----|
| 404 on `GET /customers/by-email` | Express matched `by-email` as `:id` param | Move static routes BEFORE parameterized routes in router |

## Frontend / Deploy

| Error | Cause | Fix |
|-------|-------|-----|
| `NetworkError when attempting to fetch` | CORS — cross-origin call | Use Next.js API route proxy at `/api/bridge/route.ts` |
| Catch-all `[...path]` returns 404 on Vercel | Dynamic segments routing fail | Use single endpoint with `x-bridge-path` header |
| `ApiResponse` / `loadCustomer` unused | Dead code | Remove unused types/functions before push |
