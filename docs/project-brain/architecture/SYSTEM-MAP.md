# SYSTEM-MAP.md — Architecture Component Diagram

> **Living document.** Updated when modules are added, renamed, or restructured.

```mermaid
graph TD
    subgraph Surfaces
        WA[WhatsApp Bot]
        TG[Telegram Bot]
        WEB[Web Frontend React/Next.js]
        LANDING[Landing Email List]
        OPS[/ops Dashboard]
        ADMIN[Admin Transactions Console]
    end

    subgraph "API Layer (Express.js)"
        AGENT["/api/agent<br/>LangChain/LangGraph<br/>OpenAI GPT-4o"]
        FIN["/api/financial<br/>conversions, sends, profiles"]
        RAMP["/api/ramp<br/>PIX on/off-ramp"]
        EXT["/api/external<br/>account linking, onboarding"]
        AUTH["/api/auth<br/>JWT, passkeys"]
        SEC["/api/security<br/>PIN management"]
        QUOTES["/api/quotes<br/>BRL/USDC quotes"]
        EARLY["/api/early-access<br/>early email list signup"]
        XFERS["/api/transfers<br/>international transfers"]
        OPS_HISTORY["/api/ops/history<br/>complete transaction history"]
        WH["/api/webhooks<br/>Etherfuse, Bridge"]
    end

    subgraph "Orchestration (D1)"
        ORCH[TransferOrchestrator<br/>State machine engine]
        WATCH[StellarSettlementWatcher<br/>Horizon poller]
    end

    subgraph "Services"
        ANCHOR[AnchorService<br/>Etherfuse PIX - 3600+ lines]
        STELLAR[StellarService<br/>Pathfinding, XDR, settlement]
        QUOTE_SVC[QuoteService<br/>BRL/USDC DEX quotes]
        FEE[FeeService<br/>30bps platform spread]
        PAYOUT[PayoutService<br/>USD payout adapters]
        SETTLE[SettlementService<br/>USDC on Stellar]
        DEFINDEX[DefindexService<br/>Vaults]
        EVO[EvolutionService<br/>WhatsApp queue]
        RECEIPT[ReceiptService<br/>SVG receipt generation]
        EARLY_SVC[EarlyAccessSignupService<br/>Supabase email upsert]
        I18N[i18n Service]
    end

    subgraph "Persistence"
        DB[(Supabase PostgreSQL)]
        REPO[Repository Layer<br/>raw Supabase queries]
    end

    subgraph "External"
        ETHER[Etherfuse<br/>PIX sandbox API]
        HORIZON[Stellar Horizon<br/>Testnet]
        OPENAI[OpenAI GPT-4o]
        DEFI[DeFindex Vaults]
        EVOAPI[Evolution API v2]
        BRIDGE[Bridge.xyz PIX/ACH]
        RESEND[Resend Email]
    end

    WA --> EVOAPI
    TG --> TGWH[Telegram Webhook]
    EVOAPI --> EVO
    TGWH --> EVO
    WEB --> AGENT
    WEB --> FIN
    WEB --> RAMP
    WEB --> QUOTES
    LANDING --> EARLY
    OPS --> OPS_HISTORY
    ADMIN --> XFERS

    EVO --> AGENT
    AGENT --> FIN
    AGENT --> RAMP
    AGENT --> QUOTES

    FIN --> STELLAR
    FIN --> QUOTE_SVC
    FIN --> FEE
    RAMP --> ANCHOR
    RAMP --> QUOTE_SVC
    EARLY --> EARLY_SVC
    XFERS --> ORCH
    OPS_HISTORY --> REPO
    ORCH --> REPO
    WATCH --> HORIZON
    WATCH --> ORCH

    ANCHOR --> ETHER
    STELLAR --> HORIZON
    QUOTE_SVC --> HORIZON
    DEFINDEX --> DEFI
    RECEIPT --> RESEND

    EARLY_SVC --> DB
    All --> REPO
    REPO --> DB
```

## Module → File Map

### Surface Layer
- WhatsApp: `backend/src/api/controllers/evolution.controller.ts`, `backend/src/api/services/notifications/evolution.service.ts`
- Telegram: `telegram/` directory, `backend/src/api/services/notifications/`
- Web frontend: `frontend/` (React/Next.js)
- Landing email list: `frontend/components/landing-reluca/EarlyAccessSignup.tsx` posts through `frontend/app/api/early-access/route.ts`
- Ops dashboard: `backend/src/api/controllers/ops.controller.ts` reads complete database transaction history through `backend/src/api/repository/ops-history.repository.ts`
- Admin transactions dashboard: `frontend/app/admin/transactions/` uses Next proxy routes under `frontend/app/api/transfers/`

### API Layer
- Agent: `backend/src/api/agent/` — routes, tools, prompt templates
- Financial: `backend/src/api/routes/financial.router.ts`, `controllers/financial.controller.ts`
- Ramp: `backend/src/api/routes/ramp.router.ts`, `controllers/ramp.controller.ts`
- External: `backend/src/api/routes/external.router.ts`, `controllers/external.controller.ts`
- Auth: `backend/src/api/routes/auth.router.ts`
- Security: `backend/src/api/routes/security.router.ts`
- Quotes: `backend/src/api/routes/quotes.router.ts`
- Early access signup: `backend/src/api/routes/early-access.router.ts`, `backend/src/api/controllers/early-access.controller.ts`
- Transfers: `backend/src/api/routes/international-transfers.router.ts`, `routes/ops.router.ts`
- Ops complete history: `GET /api/ops/history` in `backend/src/api/routes/ops.router.ts`, backed by `backend/src/api/repository/ops-history.repository.ts`
- Frontend transfer proxy: `frontend/app/api/transfers/route.ts`, `frontend/app/api/transfers/[...path]/route.ts`, `frontend/lib/backend-proxy.ts`
- Mounted transfer JSON handlers: `backend/src/api/controllers/international-transfers.controller.ts` handles `/api/transfers` first in current Express route order; `ops.controller.ts` still serves `/ops` pages.
- Webhooks: `backend/src/api/routes/webhooks.router.ts`, `controllers/etherfuse-webhook.controller.ts`, `controllers/bridge-webhook.controller.ts`

### Orchestration (D1)
- Engine: `backend/src/orchestration/TransferOrchestrator.ts`
- State machine: `backend/src/orchestration/stateMachine.ts`
- Watcher: `backend/src/orchestration/stellarWatcher.ts`
- Types: `backend/src/orchestration/types.ts`
- Decimal-safe helpers: `backend/src/orchestration/decimal.ts`
- Structured JSON logs: `backend/src/orchestration/orchestrationLogger.ts`
- Existing flow bridge: `backend/src/api/services/international-transfer.service.ts` calls `TransferOrchestrator.syncFromInternationalTransfer()`

### Services
- Etherfuse: `backend/src/api/services/anchor.service.ts` (8920 lines, monolithic)
- Stellar: `backend/src/api/services/stellar.service.ts` (~1300 lines)
- Quotes: `backend/src/api/services/brl-reference-rate.service.ts`, `brl-usd-quote.service.ts`
- Fees: `backend/src/api/services/economy-engine.service.ts`, `platform-fee.service.ts`
- Payout: `backend/src/api/services/usd-payout-adapters.ts`, `usd-payout-coordination.service.ts` — provider interface plus Circle Mint bank payout foundation, Bridge compatibility, Etherfuse proof, and ops mock
- Settlement: `backend/src/api/services/stellar-settlement.service.ts`
- DeFindex: `backend/src/api/services/defindex-yield.service.ts`
- Evolution: `backend/src/api/services/notifications/evolution.service.ts`
- Receipt: `backend/src/api/services/receipt-image.service.ts`, `payment-receipt.service.ts`
- Early access signup: `backend/src/api/services/early-access-signup.service.ts` writes normalized emails to `early_access_signups`
- PIX funding: `backend/src/api/services/pix-funding.service.ts`
- International transfer lifecycle: `backend/src/api/services/international-transfer.service.ts`, `international-transfer-lifecycle.ts`, `international-transfer-state.service.ts`

### Repository
- `backend/src/api/repository/` — all repositories (Supabase raw queries)
- Key: `international-transfer.repository.ts`, `transfer.repository.ts` (D1 normalized lifecycle), `ops-history.repository.ts` (complete operational read model), `operation.repository.ts`, `wallet.repository.ts`, `agent.repository.ts`

### Database Migrations
- Single SQL source of truth: `backend/migrations/20260613_00_full_schema.sql`
- The consolidated bootstrap creates the complete current database from zero.
- Do not create parallel migrations under Supabase CLI temp paths, source-tree schema bootstrap files, or runtime startup code.

### D1 Evidence Scripts
- Log export: `backend/scripts/export-transfer-log.ts`, `backend/src/scripts/export-transfer-log.ts`
- Transfer record export: `backend/scripts/export-transfer-record.ts`, `backend/src/scripts/export-transfer-record.ts`

### Operational Scripts
- Repository-level Node scripts are service-local under `backend/scripts/`.
- Root `package.json` keeps wrapper commands for env generation, passkey env generation, and Instawards evidence capture.

### Integrations
- Etherfuse: `backend/src/integrations/regional-starter-pack/anchors/etherfuse/`
- Bridge.xyz: `backend/src/integrations/bridge/`
- Circle Mint payout foundation: `backend/src/api/services/usd-payout-adapters.ts`
- DeFindex: `@defindex/sdk` (npm package)
- Supabase: `backend/src/config/supabase.ts`
- Stellar: `backend/src/config/stellar.ts`

### Config
- Runtime: `backend/src/config/runtime.ts`
- Assets: `backend/src/config/assets.ts`
- Secrets: `backend/src/config/secrets.ts`
- Mainnet: `backend/.env.mainnet.example`
