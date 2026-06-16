# OVERVIEW.md — TalkToStellar

> **Living document.** Updated when new surfaces, flows, or architectural changes land.

New senior engineer starts here.

## What TalkToStellar Is

TalkToStellar is a conversational money platform. Users send money through WhatsApp, Telegram, or web — the platform handles PIX intake (Brazil), asset conversion via the Stellar blockchain, multi-asset balances (BRL, USD/USDC, CETES treasury bonds, XLM), peer-to-peer sends, PIX off-ramps, and yield-bearing vaults (USDC and CETES via DeFindex). Under the hood it's a Stellar smart wallet with a messaging frontend.

**Product statement**: "PIX in, conversion via Stellar, multi-asset balances, send-to-contact, off-ramp to PIX, investments — through WhatsApp, Telegram, and web."

## Surfaces (User-Facing)

| Surface | Technology | Status |
|---------|-----------|--------|
| WhatsApp bot | Evolution API → Express backend → Agent (LangChain/OpenAI) | ✅ Testnet |
| Telegram bot | Telegram webhook → Express backend → Agent | ✅ Testnet |
| Web chat | Frontend (React/Next.js) → Agent API | ✅ Testnet |
| Landing page / early access list | Frontend CTA → `/api/early-access` → Supabase | ✅ Captures early-access emails |
| PIX on-ramp screen | Web frontend → Ramp API → Etherfuse anchor | ✅ Testnet (sandbox) |
| Conversion screen | Web frontend → Financial API → Stellar pathfinding | ✅ Testnet |
| Send-to-contact screen | Web frontend → Financial API → Stellar payment | ✅ Testnet |
| Off-ramp screen | Web frontend → Ramp API → Etherfuse | ✅ Testnet (sandbox) |
| Investments page | Web frontend → DeFindex vault API | ✅ Testnet |
| Balance view | Web frontend → balance computation from Stellar | ✅ Testnet |
| Transaction history | Web frontend → operations DB | ✅ Testnet |
| Receipts | Generated server-side → Resvg SVG rendering | ✅ Testnet |
| Ops dashboard | `/ops/login` → DB-backed admin session → `/ops` complete DB transaction history; normalized rows link to TransferOrchestrator detail | ✅ Polished ledger with secure login; lifecycle detail screenshots pending seeded transfer |
| Admin transactions dashboard | `/admin/transactions` → `/api/transfers` → TransferOrchestrator records/events | ✅ Frontend route; final evidence screenshots pending |
| Wire payout test | `/wire-test` → `/api/transfers/:id/payout-evidence` + protected Circle payout action endpoints | ✅ Frontend route for Circle sandbox wire instruction and status polling |
| Admin fee wallet | Configurable treasury public key | ✅ Configured |
| FAQ page | Standalone web page | ⚠️ Pending (pain point #38) |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  SURFACE LAYER (WhatsApp / Telegram / Web)          │
│  Evolution API ← Telegram webhook ← Web frontend    │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  AGENT LAYER (LangChain/LangGraph + OpenAI GPT-4o)  │
│  Intent routing, NLU, structured tool calling        │
│  src/api/agent/                                      │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  API LAYER (Express.js controllers + services)       │
│  /api/financial  — conversions, sends, profiles      │
│  /api/ramp       — PIX on/off-ramp (Etherfuse)       │
│  /api/transfers  — international transfer lifecycle  │
│  /api/early-access — landing email list signup        │
│  /api/quotes     — BRL/USDC quote generation         │
│  /api/webhooks   — Etherfuse PIX + Bridge webhooks   │
│  /api/external   — account linking, onboarding        │
│  /api/auth       — authentication (JWT, passkeys)    │
│  /api/security   — PIN management                    │
│  /ops/login      — DB-backed ops admin login          │
│  /ops            — operational dashboard             │
│  /api/ops/history — complete DB transaction history   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  ORCHESTRATION LAYER (Deliverable 1)                 │
│  TransferOrchestrator — state machine engine          │
│  StellarSettlementWatcher — Horizon poller            │
│  src/orchestration/                                   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  SERVICE LAYER                                        │
│  AnchorService      — Etherfuse PIX (3600+ lines)     │
│  StellarService     — Pathfinding, XDR, settlement    │
│  QuoteService       — BRL/USDC quotes (Stellar DEX)   │
│  FeeService         — 30bps platform spread           │
│  PayoutService      — USD payout adapters (Circle/Etherfuse/Bridge/Mock) │
│  SettlementService  — USDC settlement on Stellar       │
│  DefindexService    — Vault deposits/withdrawals       │
│  AgentService       — Agent orchestration              │
│  EvolutionService   — WhatsApp queue + delivery        │
│  ReceiptService     — Receipt image generation         │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  PERSISTENCE (Supabase PostgreSQL)                    │
│  Repository pattern — raw Supabase queries            │
│  Key tables: wallets, operations, agent_sessions,      │
│  international_transfers, transfers (new),             │
│  transfer_events (new), contacts, conversion_rules,    │
│  early_access_signups                                  │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  EXTERNAL INTEGRATIONS                                │
│  Etherfuse — PIX on/off-ramp (sandbox API)            │
│  Stellar — Horizon (testnet, mainnet-ready)           │
│  OpenAI — GPT-4o for NLU agent                         │
│  DeFindex — Yield vaults (USDC, CETES)                │
│  Evolution — WhatsApp API (Evolution API v2)          │
│  Bridge.xyz — PIX/ACH (Stripe-owned, alternate)       │
│  Resend — Email confirmation                          │
└─────────────────────────────────────────────────────┘
```

**Runtime**: Node.js/Express/TypeScript on Railway. Stellar testnet is the default environment. Mainnet infrastructure exists but is disabled behind feature flags (`STELLAR_MAINNET_ENABLED=false`, `ENABLE_MAINNET_SETTLEMENT_VALIDATION=false`).

## Money Flows

### 1. On-Ramp (PIX → Balance)

```
User enters BRL amount
  ↓
POST /api/ramp/etherfuse/onramp
  → PixFundingService.createPixIntent()
  → AnchorService.createOnRampForSession()
  → EtherfuseClient.createOnRamp()
  ↓
Returns: PIX QR code + copy-paste (BrCode)
  ↓
User pays via bank app
  ↓
Etherfuse webhook: POST /api/webhooks/etherfuse/pix
  → InternationalTransferService.handlePixConfirmation()
  ↓
PIX_FUNDED → BRL_TO_USDC_PENDING → Auto-conversion
  ↓
Stellar settlement: USDC lands in user's wallet
  ↓
Balance updated — user notified via WhatsApp/Telegram
```

**Key files**: `pix-funding.service.ts`, `anchor.service.ts`, `etherfuse-webhook.controller.ts`, `stellar-settlement.service.ts`

### 2. Conversion (Asset → Asset, "Best Route")

```
User selects source asset + amount + destination asset
  ↓
GET /api/financial/conversion-preview
  → StellarService.quoteStrictSendConversion()
  → BrlReferenceRateService (Stellar DEX pathfinding)
  ↓
Returns: rate, fee, estimated output, quote TTL
  ↓
User confirms → PIN screen
  ↓
POST /api/financial/conversion-confirmation
  → StellarService.submitAssetPaymentFromSecret()
  ↓
Operation tracked with OP-xxx ID
  ↓
Balance updated in real-time
```

**Key files**: `financial.controller.ts`, `stellar.service.ts`, `brl-reference-rate.service.ts`

### 3. P2P Send (Sender → Recipient)

```
User: "Tess, send $500 to Marina"
  ↓
Agent resolves recipient from contacts OR user DB by email/phone
  ↓
Two paths:
  a) Sender has enough balance → direct Stellar payment
  b) Sender needs funding → leads through on-ramp + conversion
  ↓
POST /api/financial/send
  → StellarService.buildPaymentXdr() + signAndSubmitXdr()
  ↓
Cross-asset: sender pays BRL, recipient receives USD/CETES/XLM
  ↓
Platform fee (30bps) → admin fee wallet
  ↓
Both sender + recipient notified
```

**Key files**: `agent/routes.ts`, `financial.controller.ts`, `stellar.service.ts`

### 4. Off-Ramp (Balance → PIX)

```
User requests PIX withdrawal
  ↓
POST /api/ramp/etherfuse/offramp
  → AnchorService.createOffRampForSession()
  ↓
USDC → BRL conversion via Stellar pathfinding
  ↓
PIX sent to user's registered PIX key
  ↓
Off-ramp fee calculated (should be instant — pain point #15)
```

**Key files**: `ramp.controller.ts`, `anchor.service.ts`

### 5. Investments / Vaults (DeFindex)

```
User applies USDC to vaults
  ↓
POST /api/financial/defindex/apply
  → DefindexService.applyToVault()
  ↓
USDC deposited → DeFindex vault (USDC or CETES)
  ↓
Yield accrues automatically
  ↓
User can withdraw: principal + yield
  ↓
Performance % must exclude deposits/withdrawals (pain point #11)
```

**Key files**: `defindex-yield.service.ts`

## Glossary

| Term | Definition |
|------|-----------|
| **CETES** | Brazilian treasury bond token on Stellar (via Etherfuse/DeFindex) |
| **XLM** | Stellar native token (used for fees, minimum balance) |
| **USDC** | USD Coin on Stellar (`GA5ZSEJ...KZVN` mainnet issuer) |
| **Etherfuse** | PIX on/off-ramp provider (sandbox: `api.sand.etherfuse.com`) |
| **DeFindex** | Yield-bearing vault provider (`api.defindex.io`) |
| **"Best Route"** | Stellar DEX pathfinding via `strictSendPaths` — cheapest conversion path |
| **Operation ID** | Format `OP-xxxxxx` — unique identifier for every on-chain operation |
| **PIN** | 6-digit security PIN for sensitive operations (send, off-ramp, view balances) |
| **Platform Fee** | 30 bps (0.30%) spread collected to admin treasury wallet |
| **BrCode** | Brazilian PIX copy-paste string (CRC16-CCITT encoded) |
| **Public Ref** | Format `TTS-YYYY-NNNNNN` — human-readable transfer identifier (new orchestrator) |

## Current State

### What Works (Testnet)
- ✅ WhatsApp/Telegram conversational agent
- ✅ PIX on-ramp via Etherfuse sandbox
- ✅ PIX off-ramp
- ✅ BRL→USDC conversion with pathfinding
- ✅ Asset-to-asset conversion (USDC→CETES, XLM→USDC, etc.)
- ✅ P2P send with cross-asset delivery
- ✅ DeFindex vault deposits/withdrawals
- ✅ Receipt generation
- ✅ Admin fee wallet collection
- ✅ PIN-based security
- ✅ Passkey/WebAuthn authentication
- ✅ Google OAuth login
- 🔄 Orchestration engine (D1 — code/tests passing; real testnet evidence pending)
- ✅ Ops dashboard (D1 — polished ledger code/tests/list screenshots passing; lifecycle detail screenshots pending seeded transfer)
- ✅ Daily financial summaries
- ✅ International transfer lifecycle (PIX → USDC → USD payout)

### What's Testnet-Only (Not Production)
- ⚠️ PIX is simulated via Etherfuse sandbox (no real BRL moves)
- ⚠️ No real KYC/KYB on users (development mode)
- ⚠️ No real USD bank payouts (mock mode)
- ⚠️ Stellar mainnet is configured but disabled by feature flags

### Known Fragile Areas
See [PAIN-POINTS.md](./PAIN-POINTS.md) for full details. Key clusters:
1. **Quote/fee drift** — values change mid-flow (#30)
2. **Balance not credited after on-ramp** — ledger sync issue (#32)
3. **Screen flow state** — windows not closing, link expiry false positives (#4, #16, #17)
4. **i18n leakage** — user receives wrong language (#10)
5. **Conversational routing** — inverted conversions, wrong asset messages (#19, #26)
6. **Stuck at "rota calculada 2/4"** — specific account fails consistently (#8)
7. **Duplicate receipts** — 2 comprovantes for 1 operation (#33)
