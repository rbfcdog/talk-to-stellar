# Final Transfer Record — Instawards D3

**Repo**: https://github.com/rbfcdog/talk-to-stellar · branch `main` · commit `fbdbace`  
**Date**: 2026-06-16  
**Network**: Circle Mint Sandbox → Stellar Testnet

---

## Architecture

![System Components](diagrams/system-components.png)

The system has four user surfaces (WhatsApp, Telegram, web, ops dashboard) feeding into an Express.js API layer. The agent uses LangChain + GPT-4o to interpret user intent and route transfers. The orchestrator is the core — a 13-state FSM that drives every transfer from intake to reconciliation. Below it, modular services handle PIX anchoring (Etherfuse), Stellar settlement (Horizon), and USD payouts (Circle/Bridge/Mock adapters). Everything is persisted through PostgreSQL RPCs with optimistic locking. The external layer connects to Etherfuse sandbox, Stellar Horizon testnet, OpenAI, Circle Mint sandbox, and Bridge.xyz.

---

## Transfer Lifecycle

![State Machine](diagrams/state-machine.png)

A transfer moves through 9 primary stages on the happy path: CREATED → QUOTED → PIX_CHARGE_ISSUED → PIX_FUNDED → CONVERTING → STELLAR_SETTLED → PAYOUT_ROUTING → PAYOUT_INSTRUCTED → RECONCILED. Four failure branches handle expired quotes, expired PIX charges, generic failures, and refunds.

Transitions are enforced by `TransferStateMachine.canTransition()` in `backend/src/orchestration/stateMachine.ts:42`. The full transition table:

```typescript
const ALLOWED_TRANSITIONS: Record<TransferState, TransferState[]> = {
  CREATED:              ['QUOTED', 'QUOTE_EXPIRED', 'FAILED'],
  QUOTED:               ['PIX_CHARGE_ISSUED', 'QUOTE_EXPIRED', 'FAILED'],
  PIX_CHARGE_ISSUED:    ['PIX_FUNDED', 'PIX_EXPIRED', 'FAILED'],
  PIX_FUNDED:           ['CONVERTING', 'FAILED'],
  CONVERTING:           ['STELLAR_SETTLED', 'FAILED'],
  STELLAR_SETTLED:      ['PAYOUT_ROUTING', 'FAILED'],
  PAYOUT_ROUTING:       ['PAYOUT_INSTRUCTED', 'FAILED'],
  PAYOUT_INSTRUCTED:    ['RECONCILED', 'REFUND_REQUIRED', 'FAILED'],
  RECONCILED:           [],
  QUOTE_EXPIRED:        ['FAILED'],
  PIX_EXPIRED:          ['FAILED'],
  FAILED:               ['REFUND_REQUIRED'],
  REFUND_REQUIRED:      [],
};
```

Every transition runs through a PostgreSQL RPC (`transition_transfer()`):
- `SELECT ... FOR UPDATE` locks the row
- Checks `state_version` for optimistic locking (throws `40001` on conflict)
- Updates `state`, increments `state_version`, applies JSONB evidence updates
- Inserts an append-only `transfer_events` row in the same transaction

Events are immutable — `transfer_events` has `BEFORE UPDATE` and `BEFORE DELETE` triggers that throw.

---

## Money Flow

![Money Flow](diagrams/money-flow.png)

### Phase 1 — Intake & Quote
A user creates a transfer via the agent or API with a BRL amount and destination details. The orchestrator creates the transfer record with `create_transfer_with_event()` RPC. The system fetches a BRL/USDC quote from Stellar DEX paths, including a 30bps platform spread. The quote is attached and the transfer moves to QUOTED.

### Phase 2 — PIX Funding
The Etherfuse sandbox generates a PIX BrCode. The user pays it (simulated in sandbox). Etherfuse fires a webhook with the e2e_id, txid, and paid_at timestamp. The orchestrator confirms funding and the transfer moves to PIX_FUNDED. Evidence includes the charge_id, e2e_id, payer masked identifier, and payment timestamp.

### Phase 3 — Stellar Settlement
The conversion begins — BRL amounts are mapped to USDC via the quote's FX rate. A Stellar payment is submitted on testnet. The `StellarSettlementWatcher` polls Horizon every 10 seconds for confirmation. Once confirmed, the transaction hash, ledger number, and settled_at timestamp are attached as evidence. The transfer moves to STELLAR_SETTLED.

### Phase 4 — Payout & Reconciliation
The payout is routed through the Circle adapter. A wire payment is created via `POST https://api-sandbox.circle.com/v1/businessAccount/payouts` with the linked bank destination (BANK OF AMERICA, NA, account ending in 1098). Circle returns HTTP 201 with a payout ID. The sandbox settlement takes approximately 10 minutes.

Once complete, reconciliation compares the three critical amounts:
- BRL received (from PIX funding evidence)
- USDC settled (from Stellar settlement evidence)
- USD sent (from Circle payout evidence)

Amounts are compared using `decimalAbsDiffWithin()` — bigint-based arithmetic that avoids IEEE 754 floating-point errors. If all three match within configurable tolerance and there are no discrepancies, the transfer moves to RECONCILED.

---

## Circle Sandbox — Live Evidence

| Detail | Value |
|---------|-------|
| Wallet ID | `1017459986` |
| Wallet status | active |
| Balance | $124,855.00 USD |
| Wire destination | BANK OF AMERICA, N.A., NY ****1098 |
| Destination ID | `089797c5-0a8e-466a-a0c3-ce54f3c3a4b3` |
| Destination type | wire |
| Payout endpoint | `POST /v1/businessAccount/payouts` |
| Status | complete |
| Adapter code | `backend/src/api/services/usd-payout-adapters.ts:525-690` |

**Sample payout payload (redacted):**

```json
{
  "idempotencyKey": "<uuid>",
  "destination": {
    "type": "wire",
    "id": "089797c5-0a8e-466a-a0c3-ce54f3c3a4b3"
  },
  "amount": { "amount": "10.00", "currency": "USD" },
  "source": { "id": "1017459986", "type": "wallet" },
  "metadata": {
    "beneficiaryEmail": "team.talktostellar@gmail.com",
    "platform": "TalkToStellar"
  }
}
```

**Circle API response (redacted):**

```json
{
  "data": {
    "id": "<payout-id>",
    "destination": {
      "type": "wire",
      "id": "<redacted>",
      "name": "BANK OF AMERICA, N.A., NY ****1098"
    },
    "amount": { "amount": "10.00", "currency": "USD" },
    "sourceWalletId": "1017459986",
    "status": "complete"
  }
}
```

---

## Provider Adapter Architecture

```
PayoutProviderAdapter (interface)
├── getCapabilities()              → PayoutProviderCapabilities
├── createPayoutInstruction(input) → PayoutInstruction
├── getPayoutStatus(id)           → PayoutStatus
├── normalizeWebhookEvent(payload) → PayoutProviderEvent | null
└── cancelPayout(id)              → void

Implementations:
├── CircleCompatibilityAdapter     → Circle Mint sandbox (live)
├── BridgeCompatibilityAdapter     → Bridge (compatibility)
├── EtherfusePixOffRampAdapter     → Etherfuse PIX proof
└── MockUsdPayoutAdapter           → ops mock
```

The factory `getPayoutProviderAdapter(name)` returns the right adapter for `circle`, `bridge`, `etherfuse`, or `mock`. Unknown names throw — no silent fallback.

---

## Files

| Component | File | Lines |
|-----------|------|-------|
| Orchestrator | `backend/src/orchestration/TransferOrchestrator.ts` | 625 |
| State Machine | `backend/src/orchestration/stateMachine.ts` | 67 |
| Domain Types | `backend/src/orchestration/types.ts` | 182 |
| Stellar Watcher | `backend/src/orchestration/stellarWatcher.ts` | 119 |
| Orchestration Logger | `backend/src/orchestration/orchestrationLogger.ts` | 72 |
| Decimal Utils | `backend/src/orchestration/decimal.ts` | ~60 |
| Transfer Repository | `backend/src/api/repository/transfer.repository.ts` | 369 |
| Ops History Repository | `backend/src/api/repository/ops-history.repository.ts` | 414 |
| Ops Controller | `backend/src/api/controllers/ops.controller.ts` | 779 |
| Ops Dashboard View | `backend/src/api/views/ops-dashboard.view.ts` | 1414 |
| Payout Adapters | `backend/src/api/services/usd-payout-adapters.ts` | 943 |
| Payout Coordination | `backend/src/api/services/usd-payout-coordination.service.ts` | 246 |
| Transfer Service | `backend/src/api/services/international-transfer.service.ts` | 953 |
| Transfer Routes | `backend/src/api/routes/international-transfers.router.ts` | 24 |
| DB Migration | `backend/migrations/20260613_00_full_schema.sql` | ~2700 |
| Circle E2E Test | `scripts/circle-e2e-test.ts` | 190 |
| Wire Test Page | `frontend/app/wire-test/wire-test-client.tsx` | 190 |

## Tests

```
npm --prefix backend test -- --runInBand \
  tests/orchestration/stateMachine.test.ts \
  tests/orchestration/orchestrator.test.ts \
  tests/payout-adapter-contract.test.ts \
  tests/international-transfer.service.test.ts \
  tests/international-transfer.routes.test.ts
```

All passing. Covers state machine legality, orchestrator lifecycle, adapter contract (Circle/Bridge/redaction/status polling/webhook), and HTTP route coverage.

## E2E Verification

```bash
npm run circle:e2e
# Wallet → balance check → mock fund → settlement poll → wire payout → completion poll
# Output: VERDICT — all PASS
```
