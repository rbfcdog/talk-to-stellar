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
