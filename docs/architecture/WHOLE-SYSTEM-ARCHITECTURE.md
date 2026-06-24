# TalkToStellar — Whole-System Architecture

End-to-end architecture of the entire platform: conversational surfaces, the
AI agent, every money movement rail (PIX, USD, on-chain), custodial wallets,
and automated yield. These are system-wide diagrams, not deliverable-specific.

Providers shown are the real integrations: **Etherfuse** (PIX), **Circle**
(USD), **Stellar** (settlement), and **DeFindex / Blend / Soroswap** (yield).

Rendered PNGs:

- [System components](./diagrams/01-system-components.png)
- [Money flows](./diagrams/02-money-flows.png)
- [Custodial wallet lifecycle](./diagrams/03-wallet-lifecycle.png)
- [Automated yield](./diagrams/04-auto-yield.png)
- [Conversational agent](./diagrams/05-agent.png)
- [API surface map](./diagrams/06-api-surface.png)
- [Core data model](./diagrams/07-data-model.png)
- [PIX on/off-ramp sequence](./diagrams/08-pix-sequence.png)
- [USD deposit sequence](./diagrams/09-usd-deposit-sequence.png)
- [Async confirmations](./diagrams/10-async-confirmations.png)
- [Operation lifecycle & errors](./diagrams/11-operation-lifecycle.png)

---

## 1. System Components

How the whole platform fits together — from chat surfaces down to providers.

```mermaid
flowchart TB
    subgraph Surfaces["User Surfaces"]
        WA["WhatsApp"]
        TG["Telegram"]
        WEB["Web App (Next.js)"]
        OPS["Ops & Admin Console"]
    end

    subgraph API["Backend API (Express)"]
        AGENT["Agent API (AI)"]
        FIN["Financial API (send, convert)"]
        RAMP["Ramp API (PIX on/off)"]
        USD["USD Deposit API (wire/ACH)"]
        YIELD["Yield API (earn)"]
        QUOTES["Quotes API"]
        AUTHAPI["Auth & Security API"]
        WH["Webhooks API"]
    end

    subgraph Services["Business Services"]
        ANCHOR["AnchorService — PIX"]
        STELLAR["StellarService — pathfinding, XDR"]
        QUOTE["QuoteService — BRL/USDC"]
        FEE["FeeService — platform spread"]
        PAYOUT["PayoutService — USD payout"]
        WALLET["WalletService — custodial keys"]
        YIELDSVC["YieldService — vaults & pools"]
        RECEIPT["ReceiptService"]
        NOTIFY["NotificationService"]
    end

    subgraph Providers["External Providers"]
        ETHER["Etherfuse — PIX rails"]
        CIRCLE["Circle — USD mint/payout"]
        HORIZON["Stellar Horizon"]
        DEFINDEX["DeFindex — vaults"]
        BLEND["Blend — lending"]
        SOROSWAP["Soroswap — AMM/LP"]
        OPENAI["OpenAI — LLM"]
        EVO["Evolution — WhatsApp gateway"]
    end

    subgraph Data["Persistence"]
        PG["Supabase PostgreSQL"]
        VAULT["Secret Vault — wallet keys"]
    end

    WA --> EVO --> AGENT
    TG --> AGENT
    WEB --> AGENT
    WEB --> FIN
    WEB --> RAMP
    WEB --> USD
    WEB --> YIELD
    OPS --> AUTHAPI

    AGENT --> FIN
    AGENT --> RAMP
    AGENT --> QUOTES

    FIN --> STELLAR
    FIN --> QUOTE
    FIN --> FEE
    RAMP --> ANCHOR
    USD --> PAYOUT
    USD --> WALLET
    YIELD --> YIELDSVC
    QUOTES --> QUOTE
    WH --> ANCHOR
    WH --> PAYOUT

    ANCHOR --> ETHER
    PAYOUT --> CIRCLE
    STELLAR --> HORIZON
    QUOTE --> HORIZON
    WALLET --> VAULT
    WALLET --> HORIZON
    YIELDSVC --> DEFINDEX
    YIELDSVC --> BLEND
    YIELDSVC --> SOROSWAP
    AGENT --> OPENAI
    NOTIFY --> EVO

    FIN --> PG
    RAMP --> PG
    USD --> PG
    YIELD --> PG
    PAYOUT --> PG
```

## 2. Money Flows

Every value path the platform moves money along, all routed through USDC on
Stellar as the settlement layer.

```mermaid
flowchart LR
    subgraph In["Inbound"]
        BRLIN["BRL via PIX"]
        USDIN["USD via wire/ACH"]
    end

    CORE["USDC on Stellar<br/>(custodial wallet)"]

    subgraph Out["Outbound"]
        BRLOUT["BRL via PIX"]
        USDOUT["USD to bank"]
        SEND["Send to another user"]
        EARN["Earn yield"]
    end

    BRLIN -->|"Etherfuse converts BRL to USDC"| CORE
    USDIN -->|"Circle mints USDC"| CORE

    CORE -->|"Etherfuse off-ramp"| BRLOUT
    CORE -->|"Circle payout"| USDOUT
    CORE -->|"Stellar payment"| SEND
    CORE -->|"DeFindex / Blend / Soroswap"| EARN

    EARN -->|"withdraw"| CORE
```

## 3. Custodial Wallet Lifecycle

Each user gets a Stellar wallet whose key is held in the secret vault. The
platform sponsors reserves so the user never needs XLM.

```mermaid
stateDiagram-v2
    [*] --> Created: keypair generated, secret vaulted
    Created --> Funded: platform sponsors reserves
    Funded --> Trusted: USDC trustline added (sponsored)
    Trusted --> Active: can hold and receive USDC
    Active --> Earning: idle USDC swept to yield
    Earning --> Active: yield withdrawn
    Active --> Active: receive / send / convert
```

## 4. Automated Yield

Idle USDC across all custodial wallets is periodically swept into yield
protocols, split by configured allocation.

```mermaid
flowchart TB
    SWEEP["Auto-Yield Sweep<br/>(every N hours)"]
    SCAN["Scan custodial wallets<br/>for idle USDC"]
    ALLOC["Allocate idle USDC<br/>by strategy share"]

    SWEEP --> SCAN --> ALLOC
    ALLOC -->|"share %"| DEFINDEX["DeFindex vault"]
    ALLOC -->|"share %"| BLEND["Blend lending pool"]
    ALLOC -->|"share % (+ XLM)"| SOROSWAP["Soroswap LP"]

    DEFINDEX --> POS["Position recorded<br/>+ daily earnings notice"]
    BLEND --> POS
    SOROSWAP --> POS
```

## 5. Conversational Agent

The agent turns natural-language chat into financial actions through tools.

```mermaid
flowchart LR
    USER["User message<br/>(WhatsApp / Telegram / Web)"]
    AGENT["AI Agent<br/>(LangChain + OpenAI)"]
    TOOLS["Financial Tools"]

    USER --> AGENT --> TOOLS
    TOOLS --> T1["Quote BRL/USD"]
    TOOLS --> T2["Convert"]
    TOOLS --> T3["Send payment"]
    TOOLS --> T4["PIX on/off-ramp"]
    TOOLS --> T5["Check balance"]
    TOOLS --> T6["Invest / withdraw yield"]

    T1 --> REPLY["Reply + receipt"]
    T2 --> REPLY
    T3 --> REPLY
    T4 --> REPLY
    T5 --> REPLY
    T6 --> REPLY
    REPLY --> USER
```

## 6. API Surface Map

Every API route group across the whole product and where it lands.

```mermaid
flowchart LR
    subgraph Clients["Clients"]
        CHAT["Chat (WhatsApp / Telegram)"]
        WEBUI["Web App"]
        OPSUI["Ops / Admin Console"]
    end

    subgraph Proxy["Next.js"]
        PROXY["/api proxy to backend"]
    end

    subgraph Routes["Backend API Routes"]
        R_AGENT["Agent API"]
        R_FIN["Financial API (send, convert)"]
        R_RAMP["Ramp API (PIX)"]
        R_USD["USD Deposit API (wire/ACH)"]
        R_YIELD["Yield API (earn)"]
        R_QUOTE["Quotes API"]
        R_AUTH["Auth & Security API"]
        R_WH["Webhooks API"]
    end

    subgraph Handlers["Services"]
        H_AGENT["Agent + tools"]
        H_STELLAR["StellarService"]
        H_ANCHOR["AnchorService (Etherfuse)"]
        H_PAYOUT["PayoutService (Circle)"]
        H_WALLET["WalletService"]
        H_YIELD["YieldService"]
        H_QUOTE["QuoteService"]
    end

    CHAT --> PROXY
    WEBUI --> PROXY
    OPSUI --> PROXY
    PROXY --> R_AGENT --> H_AGENT
    PROXY --> R_FIN --> H_STELLAR
    PROXY --> R_RAMP --> H_ANCHOR
    PROXY --> R_USD --> H_PAYOUT
    R_USD --> H_WALLET
    PROXY --> R_YIELD --> H_YIELD
    PROXY --> R_QUOTE --> H_QUOTE
    PROXY --> R_AUTH
    PROXY --> R_WH
    R_WH --> H_ANCHOR
    R_WH --> H_PAYOUT
```

## 7. Core Data Model

The main entities behind every product, all anchored on the user's session
and custodial wallet.

```mermaid
erDiagram
    AGENT_SESSION ||--|| WALLET : "owns"
    AGENT_SESSION ||--o{ OPERATION : "initiates"
    WALLET ||--o{ YIELD_POSITION : "holds"
    AGENT_SESSION ||--o{ USD_CUSTOMER : "links"
    USD_CUSTOMER ||--o{ USD_DESTINATION_WALLET : "delivers to"
    OPERATION ||--o{ OPERATION_EVENT : "audit trail"

    AGENT_SESSION {
        string session_id
        string email
        string channel
    }
    WALLET {
        string public_key
        string vault_secret_id
        string balance
    }
    OPERATION {
        string id
        string type
        string status
        string amount
    }
    OPERATION_EVENT {
        string operation_id
        string event
        string created_at
    }
    YIELD_POSITION {
        string protocol
        string asset
        string amount
    }
    USD_CUSTOMER {
        string email
        string kyc_status
    }
    USD_DESTINATION_WALLET {
        string public_key
        bool is_funded
        bool has_usdc_trustline
    }
```

## 8. PIX On/Off-Ramp Sequence

Brazilian reais in and out, with USDC on Stellar as the settlement layer.

```mermaid
sequenceDiagram
    actor User
    participant Agent
    participant AnchorService
    participant Etherfuse
    participant Stellar

    Note over User,Stellar: On-ramp (BRL to USDC)
    User->>Agent: "Add R$500"
    Agent->>AnchorService: create PIX charge
    AnchorService->>Etherfuse: request PIX QR
    Etherfuse-->>User: PIX QR / code
    User->>Etherfuse: pays PIX
    Etherfuse-->>AnchorService: funding webhook
    AnchorService->>Stellar: credit USDC to custodial wallet
    Stellar-->>User: balance updated

    Note over User,Stellar: Off-ramp (USDC to BRL)
    User->>Agent: "Withdraw R$500 to my PIX key"
    Agent->>AnchorService: create off-ramp
    AnchorService->>Stellar: move USDC from wallet
    AnchorService->>Etherfuse: payout BRL to PIX key
    Etherfuse-->>User: BRL received
```

## 9. USD Deposit Sequence

US dollars arrive by wire/ACH and land as USDC on the user's Stellar wallet.

```mermaid
sequenceDiagram
    actor User
    participant App
    participant PayoutService as USD Service
    participant Circle
    participant Stellar

    User->>App: request USD deposit details
    App->>PayoutService: get / create USD account
    PayoutService-->>User: bank details (routing, account, memo)
    User->>Circle: wire / ACH USD to the account
    Circle-->>PayoutService: funds received, mint USDC
    PayoutService->>Stellar: deliver USDC to custodial wallet
    Stellar-->>User: USDC balance updated
```

## 10. Async Confirmations

Money movement is confirmed asynchronously — by provider webhooks and by an
on-chain settlement watcher.

```mermaid
flowchart LR
    subgraph Providers["Providers"]
        ETHER_WH["Etherfuse webhook<br/>(PIX funded)"]
        CIRCLE_WH["Circle webhook<br/>(USD payout)"]
    end

    WH["Webhooks API"]
    WATCH["Stellar Settlement Watcher<br/>(polls Horizon)"]
    HORIZON["Stellar Horizon"]

    STATE["Operation state update<br/>+ append event"]
    NOTIFY["Notify user<br/>(WhatsApp / Telegram)"]

    ETHER_WH --> WH
    CIRCLE_WH --> WH
    WH -->|"validate secret"| STATE
    WATCH --> HORIZON
    HORIZON -->|"tx confirmed"| WATCH
    WATCH --> STATE
    STATE --> NOTIFY
```

## 11. Operation Lifecycle & Errors

The state machine every money-movement operation follows, with terminal and
error branches.

```mermaid
stateDiagram-v2
    [*] --> Created
    Created --> Quoted: quote attached
    Quoted --> Funding: funding requested
    Funding --> Funded: provider confirms
    Funded --> Settling: USDC on Stellar
    Settling --> Settled: tx confirmed
    Settled --> Completed: delivered / recorded
    Completed --> [*]

    Created --> Expired: quote / charge expired
    Funding --> Failed: provider error
    Settling --> Failed: settlement error
    Failed --> RefundReview: refund required
    Expired --> [*]
    RefundReview --> [*]
```

---

## Code Map

| Layer | Where |
|---|---|
| Surfaces | `frontend/`, `backend/src/api/controllers/evolution.controller.ts`, `telegram/` |
| Agent | `backend/src/api/agent/` |
| PIX (Etherfuse) | `backend/src/api/services/anchor.service.ts`, `backend/src/integrations/.../etherfuse/` |
| USD payout (Circle) | `backend/src/api/services/usd-payout-adapters.ts` |
| Stellar | `backend/src/api/services/stellar.service.ts`, `backend/src/config/stellar.ts` |
| Custodial wallets | `backend/src/api/repository/core/wallet.repository.ts`, `backend/src/api/services/core/vault.service.ts` |
| Yield | `backend/src/api/services/defindex-yield.service.ts`, `backend/src/integrations/{auto-yield,soroswap,aquarius}/` |
| Quotes & fees | `backend/src/api/services/brl-usd-quote.service.ts`, `platform-fee.service.ts` |
| Persistence | `backend/src/api/repository/`, `backend/migrations/` |
