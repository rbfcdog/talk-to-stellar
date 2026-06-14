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

**Status**: Fixed by `4b10d31` and `c4d38bd`. The login page renders before admin database credentials are needed, and Supabase-backed dashboard modules are lazy-loaded only during submitted credential verification or authenticated dashboard access.

**Diagnosis steps**:
1. Confirm the deployed backend includes `c4d38bd` or later.
2. Open `/ops/login` with `Accept: text/html`; it should return HTML containing `Transfers console`.
3. If the page renders but submit fails, check backend env: `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and that `backend/migrations/20260614_00_ops_admin_auth.sql` has run.
4. If the frontend domain returns 404, follow runbook section 9 for the Next.js rewrite/env.

**Files**: `backend/src/api/services/ops-admin-auth.service.ts`, `backend/src/api/routes/ops.router.ts`, `backend/tests/ops.routes.test.ts`
**Related**: Pain point #46
