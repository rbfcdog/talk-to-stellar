# Bridge.xyz — Integration Reference (Sanitized)

This is the canonical, sanitized replacement for the integration snapshot originally dated 2026-06-18. Raw customer responses, onboarding links, customer identities, and the plaintext API key have been removed. This document describes repository code and retained integration notes, **not verified deployment, production readiness, provider availability, or a security assessment**.

## Credential and customer-data exposure

**Sanitizing current files does not revoke the exposed key or remove historic copies.** Treat the previously published key as compromised. Authorized operators must revoke/rotate it with the provider, update affected deployments securely, review access, and coordinate published-history remediation. Customer-specific ToS/KYC links and identifiers must not be republished or used as examples.

See the [operations runbook](project-brain/operations/RUNBOOK.md) for incident handling and outstanding external remediation. No provider API calls, credential rotation, deployment checks, or history rewriting are implied by this documentation change.

Keep `BRIDGE_API_KEY` and other credentials in the server environment or secret store, never in documentation, browser bundles, screenshots, response dumps, or committed configuration.

## Repository request flow

```text
Browser (/bridge-test)
    → same-origin /api/bridge
    → Next.js route handler
    → configured backend /api/bridge/*
    → BridgeController → BridgeService → BridgeClient
    → Bridge provider API
```

- [`frontend/app/api/bridge/route.ts`](../frontend/app/api/bridge/route.ts) chooses the backend using `BACKEND_URL` (with a code fallback), selects the relative path using `x-bridge-path` or `_path`, and forwards GET/POST/DELETE requests. It forwards the Bridge access password from the cookie/header. This describes implementation, not an assertion that the proxy is deployed or secure.
- [`backend/src/api/routes/bridge.router.ts`](../backend/src/api/routes/bridge.router.ts) defines backend routes and middleware placement. Literal paths such as `/customers/by-email` precede parameterized customer routes.
- [`backend/src/api/controllers/bridge.controller.ts`](../backend/src/api/controllers/bridge.controller.ts) handles requests; [`backend/src/integrations/bridge/service.ts`](../backend/src/integrations/bridge/service.ts) maps operations to provider requests.
- [`backend/src/integrations/bridge/client.ts`](../backend/src/integrations/bridge/client.ts) sends the server-side `Api-Key` header, supports optional idempotency keys on POST requests, applies a timeout, and parses errors. Provider list responses are unwrapped by service methods, rather than assumed to be bare arrays.

## Source map

| File | Purpose |
|------|---------|
| `backend/src/integrations/bridge/config.ts` | Environment configuration and required-key validation |
| `backend/src/integrations/bridge/client.ts` | Provider HTTP transport |
| `backend/src/integrations/bridge/service.ts` | Customer, KYC, account, transfer, wallet, webhook, and exchange-rate operations |
| `backend/src/api/controllers/bridge.controller.ts` | Backend request handlers |
| `backend/src/api/routes/bridge.router.ts` | Route declarations; authoritative route inventory |
| `backend/src/api/middlewares/bridge-mainnet.middleware.ts` | Integration/password gates, mainnet confirmation gate, amount-range helper |
| `frontend/app/bridge-test/bridge-test-client.tsx` | Browser integration test interface |
| `frontend/app/api/bridge/route.ts` | Same-origin proxy to backend |

Line counts and old route counts were removed because they drift as code changes.

## Selected backend routes

These are route declarations, **not live test results**. Paths are relative to `/api/bridge`; use the router source for the complete inventory and exact middleware applied to each route.

| Area | Examples |
|------|----------|
| Customers | `POST /customers`, `GET /customers/by-email`, `GET /customers/:id`, `POST /customers/:id/sync` |
| KYC/readiness | `POST /customers/:id/kyc-link`, `POST /customers/:id/pix-kyc-link`, `GET /customers/:id/readiness` |
| External accounts | `POST /customers/:id/external-accounts/pix-key`, `GET /customers/:id/external-accounts`, `GET /external-accounts/:externalAccountId`, `DELETE /external-accounts/:externalAccountId` |
| Liquidation addresses | `POST /customers/:id/liquidation-addresses/pix`, `GET /customers/:id/liquidation-addresses` |
| Virtual accounts | `POST /customers/:id/virtual-accounts/brl`, `GET /customers/:id/virtual-accounts`; additional fiat rails are declared in the router |
| Transfers | `POST /transfers/crypto-to-pix`, `GET /transfers/:transferId`, `POST /transfers/:transferId/sync`; additional rails and generic transfers are declared in the router |
| Rates/estimates | `GET /exchange-rates`, `POST /estimate` |
| Extended operations | Webhook management, static memos, and custodial wallet routes are also declared in the router |

The old snapshot's “not yet built” list and “ready for production” labels are not maintained capability or readiness evidence. Consult the current source instead; provider eligibility and actual deployment remain separate questions.

## Onboarding and KYC guidance

Use only an authorized account and the intended environment. Never reuse a customer identity or onboarding URL from a document.

1. Create or locate the authorized customer's record through the application.
2. Request fresh onboarding links through the application's customer-specific KYC flow. Treat returned ToS and identity-verification links as sensitive; do not copy them into logs, tickets, demos, or documentation.
3. Have the account holder complete the provider's required consent and identity checks through the authorized flow.
4. Refresh/sync the customer's readiness and required endorsements before attempting an account or transfer operation. Do not infer readiness from a historical response.
5. Resolve provider-reported requirements through the supported flow; do not bypass KYC, invent customer information, or move funds solely to test whether a blocker disappeared.

If a written example needs an email, use **`synthetic.customer@example.com` (synthetic; not a real onboarding account)**. Use symbolic IDs such as `SYNTHETIC_CUSTOMER_ID`, never actual customer or inquiry identifiers. Raw response examples and actionable ToS/Persona URLs are intentionally omitted.

### Retained historical troubleshooting notes

The original snapshot reported `missing_address_data` when creating accounts or liquidation addresses before onboarding requirements were satisfied. It also recorded these integration pitfalls; they are historical observations, not current provider guarantees:

- PIX external-account payloads used `account_type: "pix"` and a `pix_key` object containing `pix_key` and `document_number`, rather than a plain string.
- Customer country information belonged under `residential_address`, not a top-level `country` field.
- Exchange-rate requests used `/exchange_rates?from=X&to=Y`.
- Customer/list responses could be envelopes such as `{ count, data }`; do not treat the envelope itself as the result array.
- An idempotency header on GET requests caused a provider error in the original investigation; the current client GET path does not supply one.
- The same-origin API route was used to avoid browser cross-origin requests. Old hosting/rewrite troubleshooting does not establish a current hosting limitation.

## Configuration is not a safety attestation

Read [`config.ts`](../backend/src/integrations/bridge/config.ts) and the [middleware](../backend/src/api/middlewares/bridge-mainnet.middleware.ts) before configuring an environment. The earlier claim that all guards defaulted to “OFF/SAFE” was inaccurate for the current source.

| Setting | Current code fallback / interpretation |
|---------|----------------------------------------|
| `BRIDGE_API_KEY` | Required by configuration validation; no key value belongs in this document |
| `BRIDGE_API_URL` | Provider base URL; default `https://api.bridge.xyz/v0` |
| `BRIDGE_ENABLED` | Defaults to disabled in production-like environments, enabled otherwise; the service disables itself if required configuration is missing |
| `BRIDGE_SANDBOX` | Defaults to the inverse of production-like environment detection; do not treat this flag alone as proof of provider-environment isolation |
| `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT` | Defaults to `true`; explicitly set `false` where money movement must be disabled |
| `BRIDGE_REQUIRE_MANUAL_CONFIRMATION` | Defaults to `false`; when enabled, guarded routes require `confirm_mainnet: true` |
| `BRIDGE_ACCESS_PASSWORD` | Middleware skips the password gate if unset; it also contains explicit bypasses. This is not a claim of comprehensive authorization |
| `BRIDGE_MIN_BRL_AMOUNT` / `BRIDGE_MAX_BRL_AMOUNT` | Defaults `10` / `50000` |
| `BRIDGE_MIN_USDC_AMOUNT` / `BRIDGE_MAX_USDC_AMOUNT` | Defaults `0.01` / `10000` |
| `BRIDGE_DEFAULT_SOURCE_CHAIN` / `BRIDGE_DEFAULT_SOURCE_CURRENCY` | Defaults `stellar` / `usdc` |
| `BRIDGE_DEFAULT_DESTINATION_CURRENCY` / `BRIDGE_DEFAULT_DESTINATION_RAIL` | Defaults `brl` / `pix` |

These are source defaults, not observed deployment values. Route-level guard coverage, authorization, provider permissions, KYC eligibility, and end-to-end settlement require separate review and verification.
