# RUNBOOK.md — Diagnosing Recurring Failures

> **Living document.** New failure modes added as they're discovered. Fixes noted when applied. See [MAINTAINER-GUIDE.md](../MAINTAINER-GUIDE.md).

## 1. "Balance not credited after on-ramp"

**Symptom**: PIX paid, "confirmed" message shown, but balance still shows R$0.00.

**Diagnosis steps**:
1. Check Etherfuse sandbox dashboard — was the on-ramp order completed?
2. Check Stellar Horizon for the user's public key — does the TESOURO or USDC token appear?
3. Check `operations` table for the on-ramp operation — status should be COMPLETED
4. If sandbox completed but token not on Horizon: Etherfuse sandbox minting lag. Wait 30s and re-check.
5. If operation shows COMPLETED but no token: check the `stellar_tx_hash` — verify on Horizon

**Fix**: Re-poll Horizon after settlement callback. Only update balance when token is confirmed on-chain. Add a "Processando... seu saldo será atualizado em instantes" message.

**Files**: `stellar-settlement.service.ts`, balance computation in frontend
**Related**: Pain point #32

## 2. "Rota calculada 2/4 — operação parou"

**Symptom**: Specific account always fails at step 2/4 during "rota calculada" (pathfinding).

**Diagnosis steps**:
1. Check the failing account's trustlines on Stellar Horizon:
   `GET https://horizon-testnet.stellar.org/accounts/{public_key}`
2. Look at `balances[]` — does the account have the required asset trustline?
3. Check if the destination account can receive the asset
4. Check Stellar DEX liquidity for the BRL→USDC pair (testnet liquidity can be thin)

**Fix**: Pre-flight check: before pathfinding, verify both accounts have required trustlines. Surface specific error: "Sua conta não pode receber [ASSET]. Ative em Configurações > Carteira."

**Files**: `stellar.service.ts:884-961`
**Related**: Pain point #8

## 3. NLU Outage Loop

**Symptom**: Agent repeats "I am having trouble understanding requests right now" indefinitely.

**Diagnosis steps**:
1. Check OpenAI API status — is GPT-4o responding?
2. Check `agent_sessions` for the session — is there a corrupted state?
3. Check rate limits — is the API key throttled?
4. Check agent logs for the error type (timeout, rate limit, invalid response)

**Fix**: Implement circuit breaker: after 3 consecutive NLU failures → escalate message: "Parece que estou com dificuldades. Tente novamente mais tarde ou acesse talktostellar.com" and stop retrying. Reset on successful intent.

**Files**: Agent fallback handler
**Related**: Pain point #36

## 4. Investment Page Failing

**Symptom**: "Não foi possível atualizar a aplicação agora" when applying.

**Diagnosis steps**:
1. Check DeFindex API status — `curl https://api.defindex.io/health`
2. Check user's USDC balance on Stellar
3. Check DeFindex vault status — is the vault accepting deposits?
4. Check rate limits — DeFindex may throttle

**Fix**: Add retry with backoff (3 attempts, 1s/2s/4s). Show "Tentando novamente..." during retries. After exhaustion: "Serviço temporariamente indisponível. Tente em alguns minutos."

**Files**: `defindex-yield.service.ts`
**Related**: Pain point #13

## 5. Link Expiry False Positives

**Symptom**: Payment link shows "expirado" immediately after creation, especially after a failed attempt.

**Diagnosis steps**:
1. Check the payment token in `payment_tokens` table — is it marked as `used`?
2. Check if the token was consumed by a failed attempt
3. Check the token's `created_at` — is it within the TTL window?

**Fix**: Only mark tokens as `used` on successful completion, not on first access. Allow retry with the same token within the TTL.

**Files**: Payment token validation, `stellar.service.ts`
**Related**: Pain point #16

## 6. Duplicate Receipts (FIXED)

**Symptom**: One on-ramp generates 2 receipts.

**Status**: ✅ Fixed by `0da597da`. Two-layer deduplication now active:
1. DB-level `dedupe_key` unique constraint on `agent_messages` table
2. In-memory `Set<string>` for external delivery dedupe

**If recurrence**: Check the dedupe key threading in `anchor.service.ts:8713-8738` and verify the unique constraint on `agent_messages`.

**Files**: `payment-receipt.service.ts`, `anchor.service.ts`
**Related**: Pain point #33

## 7. Ops Dashboard Shows Zero Despite Transaction History (FIXED)

**Symptom**: `/ops` displays `Total visible 0` and "No transfers match this filter" even though users have completed transactions.

**Status**: Fixed in current working tree; commit pending. Verified against configured Supabase on 2026-06-13: `/ops` loaded 1,540 transaction records across all four sources.

**Diagnosis steps**:
1. Check `transfers` for normalized D1 lifecycle records.
2. Check `operations` for PIX, conversion, send, off-ramp, and investment operations.
3. Check `payment_logs` for completed or failed Stellar payment records.
4. Check `international_transfers` for BRL/USD transfer records created before or alongside normalized D1 transfers.
5. If only `/ops` is empty, verify that the dashboard is using the unified ops-history query rather than `transferRepository.list()` directly.

**Fix**: `ops-history.repository.ts` aggregates all authoritative transaction tables for the ops history screen. `/api/ops/history` exposes the same protected read model. Normalized transfer lifecycle details remain available without treating `transfers` as the whole database ledger.

**Files**: `backend/src/api/controllers/ops.controller.ts`, `backend/src/api/repository/ops-history.repository.ts`, `backend/src/api/routes/ops.router.ts`
**Related**: Pain point #42

## 8. Supabase SQL Editor rejects `\if` in ops admin migration (FIXED)

**Symptom**: Running `backend/migrations/20260614_00_ops_admin_auth.sql` in Supabase SQL Editor fails with `ERROR: 42601: syntax error at or near "\" LINE 160: \if :{?ops_admin_login}`.

**Status**: Fixed by `949db79`. The migration is now plain SQL only; optional admin creation is performed separately.

**Recovery steps**:
1. Pull `main` and re-open `backend/migrations/20260614_00_ops_admin_auth.sql`.
2. Confirm the file has no `\if`, `\echo`, or other backslash commands.
3. Run the migration in Supabase SQL Editor.
4. Generate a password hash locally: `OPS_ADMIN_PASSWORD='...' npm --prefix backend run ops:hash-password --silent`.
5. In Supabase SQL Editor, run `select public.upsert_ops_admin_user(lower('admin@example.com'), 'generated-salt-hash', null);`.
6. Open `/ops/login` and sign in with that login and plaintext password.

**Files**: `backend/migrations/20260614_00_ops_admin_auth.sql`, `backend/scripts/run-required-migrations.ts`
**Related**: Pain point #43

## 9. Frontend `/ops/login` returns Next.js 404 (FIXED)

**Symptom**: Opening `/ops/login` on the frontend host shows "This page could not be found."

**Status**: Fixed by `f321a52`. The frontend now rewrites `/ops` and `/ops/:path*` to the backend ops dashboard.

**Diagnosis steps**:
1. Confirm backend route exists: `backend/src/api/routes/ops.router.ts` has `opsRouter.get('/ops/login', ...)`.
2. Confirm frontend rewrite exists: `frontend/next.config.mjs` has rewrites for `/ops` and `/ops/:path*`.
3. Confirm the frontend environment has `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` pointing to the backend origin.
4. Rebuild/redeploy the frontend; Next.js config rewrites are not picked up by an already-running production server.

**Fix**: `frontend/next.config.mjs` proxies the browser ops paths to the backend while keeping the same frontend URL and cookie scope.

**Files**: `frontend/next.config.mjs`, `backend/src/api/routes/ops.router.ts`
**Related**: Pain point #44

## 10. `/ops/login` returns generic JSON 500 instead of HTML (FIXED)

**Symptom**: `/ops/login` returns JSON like `success: false`, `code: temporary_unavailable`, `support_code: TTS-...`, and status 500 instead of the transfer operator login screen.

**Status**: Fixed by `4b10d31`, `c4d38bd`, and `6529ec7`. The login page renders before admin database credentials are needed, Supabase-backed dashboard modules are lazy-loaded only during submitted credential verification or authenticated dashboard access, `/ops` bypasses idempotency storage, and the global error handler renders login HTML for `/ops/login`.

**Diagnosis steps**:
1. Confirm the deployed backend includes `6529ec7` or later.
2. Open `/ops/login` with `Accept: text/html`; it should return HTML containing `Transfers console`.
3. If the page renders but submit returns "Could not open the transfers console", follow runbook section 11.
4. If the page renders but submit shows "Ops login is unavailable", check backend env: `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and that `backend/migrations/20260614_00_ops_admin_auth.sql` has run.
5. If the frontend domain returns 404, follow runbook section 9 for the Next.js rewrite/env.

**Files**: `backend/src/api/services/ops-admin-auth.service.ts`, `backend/src/api/routes/ops.router.ts`, `backend/tests/ops.routes.test.ts`
**Related**: Pain point #46

## 11. `/ops/login` form submit returns "Could not open the transfers console" (FIXED)

**Symptom**: `/ops/login` renders the `Transfers console` page, but after entering the operator email/password it returns the same page with `Could not open the transfers console. Try again in a few seconds.`

**Status**: Fixed by `002ccd9`. The server-rendered `/ops` browser routes bypass backend CORS middleware so frontend-hosted form posts can reach the ops controller. JSON API routes keep normal CORS enforcement.

**Diagnosis steps**:
1. Confirm the deployed backend includes `002ccd9` or later.
2. Confirm the frontend still rewrites `/ops` and `/ops/:path*` to the backend.
3. Submit `/ops/login` from the frontend host. If the backend logs previously showed `CORS origin denied`, this fix is the required deployment.
4. If the page now shows `Invalid operator credentials`, the route is working and the remaining issue is the admin row/password.
5. If the page shows `Ops login is unavailable: JWT_SECRET is required` or a Supabase error, fix backend env or the `ops_admin_users` migration/admin row.

**Files**: `backend/src/app.ts`, `backend/src/api/middlewares/security.middleware.ts`, `backend/tests/security.middleware.test.ts`
**Related**: Pain point #47

## 12. Conversion Confirmation Shows Generic Temporary Error for Insufficient Balance (FIXED)

**Symptom**: `/confirm-conversion` reaches the progress screen, then shows `Conversion not completed`, `I could not finish that right now. Try again in a few seconds.`, and an error ID like `TTS-20260615164337-6RF248`.

**Observed case**: On 2026-06-15, `payment_confirmations.id = 154` was a `123 TESOURO -> 28.1956173 USDC` confirmation. The wallet had `89.6400000 TESOURO`, so the real backend error was insufficient source balance.

**Diagnosis steps**:
1. Query `payment_confirmations` near the support-code timestamp. Look for a pending `external_conversion_confirm` row.
2. Query `payment_logs` for the same time window. If no row exists, the failure happened before token reservation or transaction submission.
3. Check the wallet Horizon balances for the source asset.
4. Reproduce only quote/XDR build, not submission, with the same public key and source/destination assets.
5. If the raw error looks like `Saldo de <ASSET> insuficiente`, it should map to `insufficient_balance`.

**Status**: Fixed by `227832a`. Backend `publicErrorCode()` and frontend `mapPublicError()` now classify asset-specific Portuguese insufficient-balance messages.

**Files**: `backend/src/utils/public-error.ts`, `frontend/lib/public-errors.ts`, `backend/tests/public-error.test.ts`, `frontend/__tests__/unit/public-errors.test.ts`
**Related**: Pain point #49

## 13. `/wire-test` send shows generic HTTP 500 (FIXED)

**Symptom**: The Circle sandbox wire test page loads, but clicking `Send` shows `Send wire $10 failed with HTTP 500`.

**Status**: Fixed by `1ab10cd`. The frontend route handler now falls back to the deployed Railway backend when a deployed frontend has no usable backend env, preserves upstream backend/Circle statuses, and returns structured diagnostics instead of a generic proxy 500.

**Diagnosis steps**:
1. Confirm the frontend build includes `frontend/app/api/wire-test/send/route.ts`; `npm --prefix frontend run build` should list `/api/wire-test/send`.
2. Confirm backend health: `GET https://talk-to-stellar-production-e284.up.railway.app/health` should return 200.
3. Confirm the backend route is mounted: unauthenticated `POST /api/transfers/wire-test/send` should return 403, not 404.
4. If the frontend still shows 500 after `1ab10cd`, open the raw response panel and check `backend_url`, `backend_http_status`, and `attempts`.
5. If the frontend returns 403, the route is working and the ops secret is wrong or missing.
6. If Circle returns a non-201 status, the route is working and the issue is provider configuration, linked bank status, source wallet balance, or Circle sandbox availability.

**Verification**: On 2026-06-16, built frontend `POST /api/wire-test/send` returned frontend HTTP 200, backend HTTP 200, Circle HTTP 201, payout id present, amount `$1`. A bad ops secret returned structured frontend HTTP 403 with backend HTTP 403.

**Files**: `frontend/app/api/wire-test/send/route.ts`, `frontend/app/wire-test/wire-test-client.tsx`, `backend/src/api/controllers/international-transfers.controller.ts`
**Related**: Pain point #52

## 14. Payment Watcher SSE `Not Found` Storm + Key Integrations `Backend unreachable` (FIXED)

**Symptom**: On deploy, logs repeat `[payment-watcher] SSE error for G...: Not Found` hundreds or thousands of times. The `/key-integrations` page also shows `Backend unreachable` for Abroad Finance, Reflector, or Soroswap panels.

**Status**: Fixed by `ef1f793`, `299a21d`, and `17a821f`.

**Diagnosis steps**:
1. Check backend health first: `GET /health`. If it times out, inspect deploy logs before testing frontend panels.
2. Search logs for `[payment-watcher]` and count whether `Not Found` appears as `WARN`. After `ef1f793`, not-yet-funded accounts should only produce debug-level activation retry logs.
3. Check `GET /api/payment-watcher/status`; `reconnecting` can be non-zero for unfunded accounts, but `watching` should only count active Horizon streams.
4. Confirm `frontend/app/api/[...path]/route.ts` delegates to `proxyBackendApi(req, "api", path, { injectSession: false })`.
5. Confirm production frontend builds have `BACKEND_URL`/`NEXT_PUBLIC_BACKEND_URL`; if missing, `frontend/lib/backend-proxy.ts` and `frontend/next.config.mjs` now fall back to the deployed Railway backend instead of `localhost:3001`.
6. If `/api/swap/quote` returns a Soroswap contract-discovery 400, confirm the deployed backend includes `17a821f`; the route should return a `stellar-broker-fallback` quote with `buildAvailable: false`.

**Fix**: The payment watcher now checks `GET Horizon /accounts/{publicKey}` before opening an SSE stream, uses a 10s account-check timeout, treats `404` as an unfunded wallet activation retry, closes failed stream handles, and deduplicates reconnect timers. The generic frontend API route now uses the shared production-aware backend proxy. The Soroswap token route returns built-in Stellar tokens if upstream token discovery fails or returns an empty list. The Soroswap quote route falls back to Stellar Broker pricing when Soroswap `/quote` fails and marks fallback quotes as pricing-only so XDR build is disabled.

**Files**: `backend/src/integrations/payment-watcher/service.ts`, `backend/tests/payment-watcher.service.test.ts`, `backend/src/integrations/soroswap/service.ts`, `backend/src/integrations/soroswap/types.ts`, `backend/tests/soroswap.service.test.ts`, `frontend/app/key-integrations/key-integrations-client.tsx`, `frontend/app/api/[...path]/route.ts`, `frontend/lib/backend-proxy.ts`, `frontend/next.config.mjs`, `frontend/__tests__/unit/api-catchall-proxy.test.ts`
**Related**: Pain points #53 and #54

## 15. Payment Watcher Horizon Preflight HTTP 429 Burst (FIXED)

**Symptom**: Deploy logs repeat `[payment-watcher] Horizon preflight failed for G...: Horizon account check returned HTTP 429; retrying in 120s` across many wallet addresses in the same second.

**Status**: Fixed by `935822b`. Account preflight checks are serialized, spaced, and rate-limit aware.

**Diagnosis steps**:
1. Search logs for `[payment-watcher] Horizon preflight` and count HTTP `429` occurrences per minute.
2. Confirm the deployed backend includes `935822b` or later.
3. Check `PAYMENT_WATCHER_ACCOUNT_CHECK_SPACING_MS`; default is `1000`, which sends at most one account preflight per second.
4. Check `PAYMENT_WATCHER_RATE_LIMIT_RETRY_MS`; default is `300000` when Horizon does not return `Retry-After`.
5. Confirm logs now show at most one global warning: `Horizon preflight rate limited (HTTP 429); pausing account checks...`.
6. Check `GET /api/payment-watcher/status`; many `reconnecting` addresses can be normal after a provider cooldown, but logs should not burst per address.

**Fix**: `PaymentWatcherService.accountExists()` now waits for a global account-check slot before calling Horizon, parses `Retry-After` on HTTP 429, pauses queued account checks during the cooldown, and schedules reconnects after that cooldown. `subscribe()` handles the rate-limit error separately so one provider-level warning replaces per-wallet warning spam.

**Files**: `backend/src/integrations/payment-watcher/service.ts`, `backend/tests/payment-watcher.service.test.ts`
**Related**: Pain point #55

## 16. Soroswap Testnet Quote/Build Cannot Execute (FIXED)

**Symptom**: A testnet wallet can be created, funded, and given a USDC trustline, but `/api/swap/quote` could not produce a buildable Soroswap quote and `/api/swap/build` rejected the quote as fallback-only.

**Observed on 2026-06-22**:
- `POST /api/stellar/wallets` returned a test wallet.
- Friendbot funded the wallet on testnet.
- A USDC trustline transaction succeeded.
- `/api/swap/tokens` returned 13 testnet tokens.
- Symbol quote `USDC -> XLM` returned `stellar-broker-fallback` after Soroswap `400 Invalid Stellar address`.
- Raw testnet contract quote `USDC -> XLM` and `XLM -> USDC` returned Soroswap `No path found`.
- Scanning XLM against every token returned by `/api/swap/tokens` found no buildable route.
- On 2026-06-22, live Soroswap TESTNET `/quote` was reachable with the configured API key but returned `400 No path found` for USDC->XLM, while Horizon strict-send paths returned a classic TESTNET USDC->XLM route.

**Diagnosis steps**:
1. Confirm `STELLAR_NETWORK=TESTNET`.
2. Call `GET /api/swap/tokens` and capture the XLM/USDC contract addresses.
3. Call `GET /api/swap/quote?assetIn=USDC&assetOut=XLM&amount=10&tradeType=EXACT_IN`.
4. If the response is `stellar-path-payment-fallback`, it is buildable through Horizon path-payment XDR rather than Soroswap build.
5. If the response is `stellar-broker-fallback`, inspect `rawQuote.soroswapError`; this is display-only pricing and `/api/swap/build` should stay disabled.
6. Retry with raw token contract IDs from `/api/swap/tokens`.
7. If Soroswap returns `No path found`, this is provider liquidity/route availability, not wallet signing.
8. If `/api/swap/build` returns an unfunded-account message, fund/activate the Freighter TESTNET account and add the source asset trustline before retrying.
9. If fallback receives contract IDs and returns `Invalid asset`, the fallback path is being used for a contract quote it cannot price.

**Fix**: `2a48ab3` made token resolution network-aware, corrected the static mainnet USDC SAC wrapper, added explicit testnet XLM/USDC SAC wrappers, stopped routing raw Soroban contract IDs into Stellar Broker fallback, and returns a non-buildable `soroswap-unavailable` response when Soroswap has no route. The current fix adds a buildable `stellar-path-payment-fallback` for symbol pairs when Horizon can quote a trusted strict-send/strict-receive path, and `/api/swap/build` uses the existing Stellar path-payment XDR builders for that fallback. Buildable quotes can now be built, signed with Freighter, and submitted through `POST /api/swap/send`; an unfunded Freighter account still must be activated before build succeeds.

**Files**: `backend/src/integrations/soroswap/service.ts`, `backend/src/integrations/soroswap/config.ts`, `backend/tests/soroswap.service.test.ts`
**Related**: Pain points #56, #60

## 17. Payment Watcher SSE HTTP 429 Fan-Out (FIXED)

**Symptom**: Backend startup logs many `[payment-watcher] SSE error for G...: Too Many Requests; retrying in 30s` entries after account preflight succeeds.

**Observed on 2026-06-22**: Starting the local backend with 252 stored wallets produced many SSE `Too Many Requests` warnings. The earlier preflight fix still logged one global preflight cooldown, but the stream path independently fanned out warning logs.

**Diagnosis steps**:
1. Start backend with payment watcher enabled.
2. Watch for `[payment-watcher] Subscribing to <N> wallets`.
3. Search logs for `Horizon SSE stream rate limited (HTTP 429)`.
4. If the provider rate-limits stream opening, the log should appear once per cooldown window rather than once per wallet.
5. Check `GET /api/payment-watcher/status` if backend is still running; a large number of reconnecting addresses after startup indicates stream-level rate limiting.
6. Check `PAYMENT_WATCHER_STREAM_OPEN_SPACING_MS`; default is `1000`, which opens at most one stream per second.
7. Check `PAYMENT_WATCHER_STREAM_RATE_LIMIT_RETRY_MS`; default is `300000` when Horizon does not provide stream retry metadata.

**Fix**: `2a48ab3` added a serialized stream-open queue, detects `429`/`Too Many Requests` in the SSE error path, applies a shared stream cooldown, and suppresses the generic per-wallet `SSE error ... retrying in 30s` warning during provider-level rate limits.

**Files**: `backend/src/integrations/payment-watcher/service.ts`, `backend/tests/payment-watcher.service.test.ts`
**Related**: Pain point #57

## 18. Bridge Virtual Account Wire Balance Missing In `/bridge-test` (FIXED)

**Symptom**: A Bridge virtual account received a wire, but the `/bridge-test` virtual-account card still showed no balance.

**Status**: Fixed by `b067970` and follow-up `3087e4c`. The screen now calls a dedicated virtual-account balance endpoint instead of matching destination addresses against `/wallets/balances`, and the backend uses Bridge's customer-scoped VA lookup plus `/history` activity endpoint.

**Diagnosis steps**:
1. Confirm the virtual account id in the `/bridge-test` card.
2. Call `GET /api/bridge` with header `x-bridge-path: /customers/{customerId}/virtual-accounts/{virtualAccountId}/balance`.
3. Inspect `balances[]`. Source `virtual_account` means Bridge exposed a direct live balance; source `bridge_wallet` means the endpoint matched destination `bridge_wallet_id`; source `activity` means it summarized received-funds events.
4. If `balances[]` is empty but `warnings[]` includes `activity`, confirm `BridgeService.getVirtualAccountActivity()` is calling `/customers/{customerId}/virtual_accounts/{virtualAccountId}/history`, not `/activity`.
5. If `warnings[]` includes `Bridge wallet not found`, do not stop diagnosis there; that can refer to destination wallet metadata and does not prove the wire was missing.
6. If `balances[]` is empty but the bank wire is recent, wait for Bridge history to post a `funds_received` or `payment_processed` event, then refresh the card.

**Fix**: `BridgeController.getVirtualAccountBalance()` loads the live virtual account, activity, and Bridge wallet balances; it prefers non-zero live/wallet balances, falls back to received activity totals, and returns zero live balances if no positive value exists. `3087e4c` corrected Bridge VA lookup to `/customers/{customerId}/virtual_accounts/{virtualAccountId}` and activity to `/history`, then dedupes `funds_received`/`payment_processed` by deposit id.

**Files**: `backend/src/api/controllers/bridge.controller.ts`, `backend/src/api/routes/bridge.router.ts`, `backend/src/integrations/bridge/types.ts`, `frontend/app/bridge-test/bridge-test-client.tsx`
**Related**: Pain points #58 and #59
