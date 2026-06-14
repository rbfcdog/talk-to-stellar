# Deliverable 1 — PIX-to-Stellar Transfer Lifecycle Engine Plan

Updated: 2026-06-13

## Verified Current Architecture

TalkToStellar is an Express + TypeScript backend backed by Supabase/PostgreSQL, with a Next.js frontend and separate Telegram bot client. The project uses raw Supabase repository classes rather than an ORM.

| SOW capability | Verified existing code | Notes |
|---|---|---|
| WhatsApp handler | `backend/src/api/controllers/evolution.controller.ts`, `backend/src/api/services/evolution.service.ts` | Evolution webhook sends messages into the backend agent. |
| Telegram handler | `telegram/src/bot.js`, `telegram/src/agent-client.js` | Telegram forwards messages to the backend agent URL; backend owns money-flow decisions. |
| Agent/tool integration | `backend/src/api/agent/routes.ts`, `backend/src/api/agent/tools.ts` | International USD delivery tools already exist: `create_brl_usd_quote`, `create_usd_bank_transfer_intent`. |
| PIX intake | `backend/src/api/services/pix-funding.service.ts`, `backend/src/api/services/anchor.service.ts`, `backend/src/api/controllers/etherfuse-webhook.controller.ts` | Etherfuse PIX intent and confirmation are already wrapped by `InternationalTransferService`. |
| Quote generation | `backend/src/api/services/brl-usd-quote.service.ts`, `backend/src/api/routes/quotes.router.ts` | Uses Stellar path quote via `BrlReferenceRateService.quoteBrlToUsdc`. |
| BRL→USDC / Stellar settlement | `backend/src/api/services/stellar-settlement.service.ts`, `backend/src/api/services/stellar.service.ts` | Submits USDC payment from configured Stellar account; can mock only under ops mock env. |
| Payout coordination | `backend/src/api/services/usd-payout-coordination.service.ts`, `backend/src/api/services/usd-payout-adapters.ts` | Provider interface and compatibility adapters exist; D1 needs the normalized routing hook and stub/no-op state. |
| Existing transfer lifecycle | `backend/src/api/services/international-transfer.service.ts`, `backend/src/api/services/international-transfer-state.service.ts` | Current state machine is real but uses SOW-adjacent names (`QUOTE_CREATED`, `PIX_PENDING`, `USDC_SETTLED`, etc.). |
| Persistence | `backend/src/api/repository/international-transfer.repository.ts`, `backend/migrations/20260613_00_full_schema.sql` | Raw Supabase queries; the complete schema is maintained in one consolidated bootstrap. |
| Logging | `backend/src/utils/logger.ts` | Custom logger writes stdout and optional `LOG_FILE`, but current orchestrator logs must become strict JSON lines. |
| Current deliverable scaffold | `backend/src/orchestration/*`, `backend/src/api/repository/transfer.repository.ts`, `backend/src/api/controllers/ops.controller.ts` | Present but incomplete: non-atomic transition/event writes, route conflict, synthetic watcher settlement, basic dashboard, docs overclaim completion. |

## Implementation Direction

The existing conversational and institution flows must keep working. The new `transfers` table is the normalized SOW lifecycle record, while `international_transfers` remains the existing operational flow. The bridge between them will be:

1. `InternationalTransferService` continues to call existing PIX, quote, Stellar, and payout services.
2. After each existing lifecycle side effect succeeds, it calls `TransferOrchestrator` to mirror the SOW state transition into `transfers` + `transfer_events`.
3. Agent tools and API responses include the normalized `public_ref` when available, so WhatsApp/Telegram confirmations can show it without the Telegram client needing direct database knowledge.
4. Etherfuse webhook confirmation still enters through `EtherfuseWebhookController`, then `InternationalTransferService.handlePixConfirmation`, then the orchestrator mirror transition.

## State Mapping

| Existing state | Normalized SOW state |
|---|---|
| quote accepted / legacy transfer created | `CREATED` then `QUOTED` |
| `PIX_PENDING` | `PIX_CHARGE_ISSUED` |
| `PIX_RECEIVED` | `PIX_FUNDED` |
| `BRL_TO_USDC_PENDING` / `USDC_SETTLEMENT_PENDING` | `CONVERTING` |
| `USDC_SETTLED` | `STELLAR_SETTLED` |
| payout adapter selection | `PAYOUT_ROUTING` |
| `PAYOUT_INSTRUCTION_CREATED` / `PAYOUT_PENDING` / `PAYOUT_COMPLETED` | `PAYOUT_INSTRUCTED` |
| reconciliation complete | `RECONCILED` |
| `FAILED` | `FAILED` |
| `REFUNDED` | `REFUND_REQUIRED` |

## Libraries and Tools

- TypeScript: already used by backend.
- Express: existing HTTP server; dashboard remains server-rendered HTML to avoid adding a frontend framework.
- Supabase/PostgreSQL: existing persistence layer; no ORM introduced.
- PostgreSQL RPC functions: needed for atomic transfer update + event append because Supabase REST calls are otherwise separate requests.
- Existing custom logger plus a small orchestration JSON logger: keeps the repo pattern while producing reviewer-friendly JSON lines.
- No new frontend framework. The `/ops` UI will use server-rendered HTML/CSS with responsive, dense operational design.

## Migration Decision

The repository now uses one consolidated SQL bootstrap at `backend/migrations/20260613_00_full_schema.sql`. It contains:

- `transfers`
- `transfer_events`
- `transfer_public_ref_seq`
- append-only event protection triggers
- atomic RPC functions:
  - `create_transfer_with_event(...)`
  - `transition_transfer(...)`

`docs/insta-awards/docs/deliverable-1/MIGRATIONS.md` documents the application command, backup requirement, and resulting schema inspection commands/output.

## Gaps to Close This Run

1. Replace non-atomic repository update + event insert pairs with RPC-backed atomic methods.
2. Add DB-backed public reference generation instead of process-local counters.
3. Add orchestration bridge/mapping from the existing international transfer service.
4. Make PIX and Stellar idempotent replays compare the actual evidence keys (`e2e_id`/`txid` and `tx_hash`) before no-oping.
5. Compute reconciliation automatically after Stellar settlement and finalize it after payout instruction when evidence is complete.
6. Replace synthetic watcher settlement with Horizon tracking of submitted transaction hashes when available; keep failure after max attempts.
7. Resolve `/api/transfers` conflicts by adding orchestration list/read/create behavior without breaking existing international-transfer routes.
8. Rework `/ops` list/detail into a polished, token-protected operational dashboard with timeline, reconciliation, raw record, and Stellar explorer links.
9. Update tests for state machine, idempotency, bridge sync, and full lifecycle.
10. Correct `STATUS.md`, `MIGRATIONS.md`, run report, and evidence docs so they do not claim unverified completion.

## Assumptions

- Existing `international_transfers` remains the source of real PIX/Etherfuse and Stellar side effects for this sprint deliverable.
- The normalized `transfers` table is the reviewer-facing lifecycle ledger and API surface.
- Real Stellar testnet execution requires valid env (`STELLAR_SECRET_KEY`, USDC issuer, payout destination, Supabase credentials). If unavailable, this run will produce code/tests and document the exact command path, but will not claim a real testnet evidence transfer.
