# D3 — Architecture Diagrams

Repo: https://github.com/rbfcdog/talk-to-stellar · branch `main` · commit `f8a2d91`

Full Mermaid diagrams at `insta-awards/deliverable-3/ARCHITECTURE-DIAGRAMS.md` — copy into https://mermaid.live to render.

## System layout

```
WhatsApp / Telegram / Web / Ops Dashboard
              ↓
      Agent (LangChain + GPT-4o)
              ↓
      TransferOrchestrator (13-state FSM)
         ↓            ↓            ↓
    Etherfuse     Stellar       Circle/Bridge
    (PIX sandbox) (Horizon)     (payout)
         ↓            ↓            ↓
                    PostgreSQL
              (RPCs, triggers, events)
```

## Transfer states

13 states with defined transitions. Happy path: CREATED → QUOTED → PIX_CHARGE_ISSUED → PIX_FUNDED → CONVERTING → STELLAR_SETTLED → PAYOUT_ROUTING → PAYOUT_INSTRUCTED → RECONCILED. Failure branches go to QUOTE_EXPIRED, PIX_EXPIRED, FAILED, or REFUND_REQUIRED.

## Money flow

BRL enters via PIX (Etherfuse sandbox) → converted to USDC on Stellar testnet → settled with a verifiable tx hash → Circle Mint wire payout in USD → reconciled against expected amounts.

## Database

Transitions run through `transition_transfer()` — a PostgreSQL RPC that locks the row with `SELECT ... FOR UPDATE`, checks `state_version` for optimistic locking, updates state and JSONB evidence, and inserts an append-only `transfer_events` row — all in one transaction.
