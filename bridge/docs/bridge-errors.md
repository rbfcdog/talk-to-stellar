# Bridge.xyz — Error Reference

Errors encountered during integration and their fixes.

## Customer Creation

| Error | Cause | Fix |
|-------|-------|-----|
| `unauthorized` | API key missing or wrong format | Use `Api-Key` header (not bearer) |
| `missing_address_data` | Customer needs KYC with address verification | Complete Persona KYC flow |
| `fields missing from customer body: first_name,ssn` | Missing required fields | Send `first_name` + `last_name` (min 2 chars) |
| `Invalid parameters — country is not a recognized field` | `country` field not accepted at top-level | Remove `country` — goes in `residential_address.country` |
| `Invalid parameters — type must be individual or business` | Missing or invalid `type` | Always send `type: "individual"` |

## PIX External Account

| Error | Cause | Fix |
|-------|-------|-----|
| `account_type must be one of: pix, us, iban, clabe...` | Wrong account_type value | Use `"pix"` not `"pix_key"` |
| `pix_key must be Hash` | pix_key must be an object | Send `pix_key: { pix_key: "...", document_number?: "..." }` |
| `missing_address_data` | Customer needs completed KYC | Complete Persona KYC first |

## Exchange Rates

| Error | Cause | Fix |
|-------|-------|-----|
| `Resource not found` on `/exchange_rate` | Wrong path | Use `GET /exchange_rates?from=usd&to=brl` |
| `usdc` pair not supported | Only fiat pairs supported | Use `usd` not `usdc` |
| `midmarket_rate` + `buy_rate` + `sell_rate` fields | Response structure | Field names from real API response |

## KYC Links

| Error | Cause | Fix |
|-------|-------|-----|
| `unauthorized` on `POST /customers/:id/kyc_links` | API key lacks customer-scoped KYC permission | Use standalone `POST /kyc_links` with `email` + `type` |
| `duplicate_record` with 400/409 | KYC link already exists for this email | Handle `existing_kyc_link` from error response |
| `email is missing, type is missing` | Required fields for standalone endpoint | Send `{ email, type }` |

## List Responses

| Error | Cause | Fix |
|-------|-------|-----|
| `customers.find is not a function` | Bridge returns `{ count, data: [...] }` not a plain array | Unwrap `.data` from list responses |
| Same for liquidations, virtual accounts, external accounts | All list endpoints return `{ data: [...] }` | Fixed in all `list*` methods in service |

## Route Order

| Error | Cause | Fix |
|-------|-------|-----|
| 404 on `GET /customers/by-email` | Express matched `by-email` as `:id` param | Move static routes before parameterized routes |
| `GET /customers/:id` catches everything | Express routes match in order | `GET /customers/by-email` must come before `GET /customers/:id` |

## Frontend / Deploy

| Error | Cause | Fix |
|-------|-------|-----|
| `NetworkError when attempting to fetch` | CORS — static page calls cross-origin backend | Use Next.js API route proxy at `/api/bridge/route.ts` |
| Catch-all `[...path]` returns 404 | Dynamic segments don't work as expected on Vercel | Use single endpoint with `x-bridge-path` header |
| `ApiResponse` declared but never used | Unused type in strict builds | Remove unused types before push |
| `loadCustomer` declared but never read | Unused function after UI change | Remove dead code |
| Build times out on Vercel | `npx next build` slow with Turbopack | Vercel auto-builds on push — just push and wait |
