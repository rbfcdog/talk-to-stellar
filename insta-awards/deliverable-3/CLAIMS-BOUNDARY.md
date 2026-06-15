# Claims Boundary — What This Demo Proves vs What It Does NOT Claim

**Principles**: Be honest about scope. A reviewer who trusts your claims boundary will trust your evidence.

---

## What This Demonstration Proves

### Architecture & Design
- [x] **13-state transfer lifecycle** from `CREATED` through `RECONCILED` (or terminal `FAILED`/`REFUND_REQUIRED`).
- [x] **Atomic state transitions** via PostgreSQL RPC `transition_transfer()` with optimistic locking (`state_version`).
- [x] **Append-only event log** (`transfer_events` table) — events are immutable; update/delete triggers fire exceptions.
- [x] **Structured JSON orchestration logs** emitted per transition, writable to file via `LOG_FILE` env var.
- [x] **Provider-agnostic payout adapter interface** supporting Circle Mint, Bridge, Etherfuse, and mock backends.
- [x] **Idempotency handling** — replay events appended without state change when duplicate PIX/Stellar/payout evidence arrives.
- [x] **Operational dashboard** with read-only HTML UI, metrics, filtering, pagination, and transfer detail forensics.
- [x] **Reconciliation engine** comparing BRL in, USDC settled, USD out expected, with flagged discrepancies.
- [x] **Legacy sync bridge** mapping existing `international_transfers` rows into the normalized `transfers` table.

### Technical Integration
- [x] **Stellar testnet settlement** — real Horizon transaction hashes verified by `StellarSettlementWatcher` polling.
- [x] **Etherfuse sandbox PIX** — charge creation and webhook-based funding confirmation.
- [x] **Stellar pathfinding quotes** — BRL/USDC path quotes via `strictSendPaths`.
- [x] **Same-name identity checks** on payout routing (matches account holder name from destination endpoint).
- [x] **stellar.expert verification** — each transfer detail page links to the corresponding testnet explorer tx.
- [x] **DB-backed ops admin auth** — scrypt-hashed operator credentials with session JWT, CSRF protection, account lockout.

---

## What This Demonstration Does NOT Claim

### Money Movement
- [ ] **No real BRL moves.** PIX charges are issued against Etherfuse's sandbox API. No real bank accounts fund these transfers.
- [ ] **No real USD reaches any bank account.** Payouts use mock adapters (`ALLOW_MOCK_USD_PAYOUTS=true`) or sandbox simulation. Even when Circle/Bridge API keys are configured, payout execution requires `ENABLE_REAL_PAYOUT_EXECUTION=true` and is explicitly OFF for demo.
- [ ] **No production remittance.** This is a testnet/sandbox integration demo. No consumer funds, no regulated money transmission.

### Network
- [ ] **Testnet only.** All Stellar transactions execute against `https://horizon-testnet.stellar.org`. The `MAINNET` badge only appears when `STELLAR_NETWORK=mainnet` is set — the demo runs in `TESTNET` mode.
- [ ] **No mainnet USDC.** Asset codes and issuers in testnet (`GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLTLAE` for USDC) are testnet-only tokens with no real-world value.

### Production Readiness
- [ ] **No production KYC/AML.** User identities in the demo are test fixtures. No document verification, sanctions screening, or regulatory checks are performed.
- [ ] **No 24/7 operations.** The `StellarSettlementWatcher` is an in-process `setInterval` poller, not a production job queue. Restarting the server loses in-memory poller state.
- [ ] **No horizontal scaling.** State machine optimistic locking works at DB level, but no distributed coordination (leader election, partitioned polling) is implemented.
- [ ] **No SLA, no retry policy beyond idempotent replay.** Expired watchers fail transfers; there is no automatic retry escalation.
- [ ] **No secret management.** API keys and secrets are read from environment variables. No vault integration.

### Regulatory
- [ ] **Not a licensed money transmitter.** This is a technical demonstration of a software system, not a regulated financial service.
- [ ] **Not audited.** No third-party security audit has been performed.
- [ ] **Not compliant with any specific jurisdiction's financial regulations.**

### Provider Commitments
- [ ] **Circle, Bridge, Wise, Etherfuse are not production partners.** Adapter interfaces are compatibility layers. Production agreements with these providers require separate commercial negotiations.
- [ ] **No guaranteed pricing.** Quotes use testnet liquidity pool data. Real-world spreads, provider fees, and bank FX rates will differ.

---

## Environment Boundaries Summary

| Boundary | Demo | Production |
|---|---|---|
| Stellar network | **Testnet** | Mainnet |
| PIX provider | Etherfuse **sandbox** | Etherfuse production |
| Payout execution | **Mock** (`ALLOW_MOCK_USD_PAYOUTS=true`) or sandbox | Real with `ENABLE_REAL_PAYOUT_EXECUTION=true` |
| User identity | Test fixtures | KYC/KYB verified |
| Secret storage | Env vars | Vault/KMS |
| Polling | In-process interval | Job queue / cron |
| Auth | DB-backed scrypt + JWT | SSO / OIDC |

---

## Diagram: What This Demo Covers

```
 [WhatsApp/Telegram/Web] ──→ [Agent/API] ──→ [TransferOrchestrator]
                                                   │
                                              13-state FSM
                                              ├── CREATED
                                              ├── QUOTED
                                              ├── PIX_CHARGE_ISSUED     ← Etherfuse sandbox
                                              ├── PIX_FUNDED           ← Etherfuse webhook (sandbox)
                                              ├── CONVERTING
                                              ├── STELLAR_SETTLED      ← Horizon testnet TX ✔
                                              ├── PAYOUT_ROUTING       ← Adapter interface
                                              ├── PAYOUT_INSTRUCTED    ← Mock/sandbox instruction
                                              └── RECONCILED           ← Amounts matched automatically

  [StellarSettlementWatcher] polls Horizon testnet every 10s
  [Ops Dashboard] at /ops shows complete lifecycle
  [Transfer Detail] at /ops/transfers/:id shows timeline + evidence + reconciliation + raw JSON
```

Everything inside the dashed border exists, runs, and is verifiable. Everything outside (production PIX, mainnet USDC, real bank payouts) is out of scope.
