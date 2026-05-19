# Security fix batch - 2026-05-19

This batch implements the first set of fixes from `docs/SECURITY_FULL_CODEBASE_SCAN_20260519.md`.

## Fixed in code

### Wallet profile enrichment now requires session auth

`GET /api/financial/wallet-profile/:public_key` now validates `session_id` plus `session_token` through the same `requireSessionAuth` path used by the rest of the financial private endpoints. The service no longer accepts raw `user_id` or unauthenticated `session_id` as context for this endpoint.

### Etherfuse sandbox helper endpoints require internal authorization

These endpoints now require `X-Internal-Api-Secret`, `X-Ramp-Sandbox-Secret` or `Authorization: Bearer <secret>`:

- `POST /api/ramp/etherfuse/resolve-wallet`
- `POST /api/ramp/etherfuse/sandbox/simulate-fiat`
- `POST /api/ramp/etherfuse/sandbox/pix-funded-transfer`
- `POST /api/ramp/etherfuse/sandbox/test-onramp`
- `POST /api/ramp/etherfuse/sandbox/test-offramp`

The Next.js ramp proxy injects the server-side secret automatically when `RAMP_SANDBOX_INTERNAL_SECRET` or `INTERNAL_API_SECRET` is configured in the frontend service environment.

### Sensitive logging is redacted

Added `backend/src/utils/redaction.ts` and applied it to:

- agent tool-call logging;
- Etherfuse request logs;
- Etherfuse response/error logs;
- idempotency response persistence.

The redactor masks common credential and PII fields such as session tokens, API keys, private keys, PINs, PIN hashes, passwords, CPF, email, phone and PIX keys.

### Idempotency response storage is safer

The global idempotency middleware now:

- stores a route/session-scoped idempotency key instead of the raw client key;
- redacts persisted response bodies;
- stores only minimized replay bodies for passkey, security, ramp, login/logout, recovery and account-linking endpoints.

### Frontend no longer sends session token in common query strings

Changed common frontend calls to send `X-Session-Token` instead of `session_token=...` in the URL:

- chat message polling;
- transaction history;
- global profile reads in pay-anyone;
- wallet profile reads;
- claim-payment session validation.

The financial and ramp Next.js proxies now forward `X-Session-Token`/`Authorization` headers to the backend.

### Proxy errors no longer return backend target URL

Frontend API proxy failures for external, financial, passkeys and ramp routes no longer include the backend `target` URL in browser-visible JSON errors.

## Required environment

Backend:

```bash
INTERNAL_API_SECRET=long-random-secret
RAMP_SANDBOX_INTERNAL_SECRET=optional-long-random-secret
PIN_SALT=long-random-value
LOG_LEVEL=info
```

Frontend:

```bash
INTERNAL_API_SECRET=same-value-as-backend-if-RAMP_SANDBOX_INTERNAL_SECRET-is-not-set
RAMP_SANDBOX_INTERNAL_SECRET=same-value-as-backend-if-set
```

If `RAMP_SANDBOX_INTERNAL_SECRET` is set, use it on both backend and frontend. If it is not set, both services can use the shared `INTERNAL_API_SECRET`.

## Still pending

- Move browser sessions from `localStorage` to HttpOnly Secure SameSite cookies.
- Remove backend support for `session_token` query parameters after all clients are migrated.
- Centralize PIN hashing and migrate to per-user salt plus server pepper.
- Apply and verify the Supabase RLS hardening migration.
- Add Redis/Upstash-backed rate limits for multi-instance deployments.
