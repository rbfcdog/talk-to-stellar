# TalkToStellar — System Overview & Non-Custodial Architecture

**Repo**: https://github.com/rbfcdog/talk-to-stellar · branch `main`  
**Last updated**: 2026-06-18

---

## 1. Non-Custodial Architecture

TalkToStellar is a **non-custodial platform**. The system never holds, controls, or has unrestricted access to user funds. Here's how this is achieved:

### 1.1 Private Key Storage

- **Private keys are stored in Supabase Vault**, not in application tables
- The `wallets` table stores only `public_key` + `vault_secret_id` — never raw private keys
- `vault_secret_id` is an opaque reference to a Supabase Vault secret
- Only the `service_role` (backend) can retrieve the secret — never exposed to clients
- Signing operations run server-side in memory; keys are never transmitted to the browser

### 1.2 Signing Architecture

- Users confirm transactions via **PIN** (4-8 digit, hashed with bcrypt) or **Passkey** (WebAuthn P-256 biometric)
- The backend verifies the user's intent, then signs the Stellar transaction using the Vault-stored key
- The signed XDR is submitted to Stellar — the user never handles raw private keys
- For passkey users: OpenZeppelin Stellar smart accounts with P-256 signer metadata

### 1.3 Why Non-Custodial Matters (Legal Reasons)

- **Not a money transmitter**: TalkToStellar does not hold pooled customer funds
- **Not a custodian**: Each user has their own Stellar wallet with their own private key
- **Not a bank**: The system orchestrates payments but never takes possession of funds
- **Regulatory compliance**: Non-custodial status simplifies KYC/AML obligations in most jurisdictions

---

## 2. Implemented Features — Complete Inventory

### Auth & Identity

| Feature | Key Files | Status |
|---------|-----------|--------|
| Google OAuth sign-in | `auth.router.ts`, `auth.service.ts` | Production |
| PIN-based session auth (4-8 digit) | `auth.service.ts`, `pin-hash.ts` | Production |
| Email+password login with lockout | `login-password.service.ts` | Production |
| PIN reset (3-step email flow) | `security.router.ts`, `pin-reset.service.ts` | Production |
| Multi-channel session linking (WhatsApp, Telegram, Web) | `external.router.ts` | Production |
| OTP recovery via email | `external.router.ts` | Production |
| Identity collision guards (email, phone, CPF unique indexes) | Migration SQL lines 537-561 | Production |
| Language preference (pt-BR / en) |  | Production |
| Early access signup landing | `early-access.router.ts` | Production |

### Passkey / WebAuthn & QR Code

| Feature | Key Files | Status |
|---------|-----------|--------|
| WebAuthn passkey registration (fingerprint, Face ID) | `passkey.router.ts`, `passkey.service.ts` | Production |
| WebAuthn passkey authentication | `passkey.router.ts` | Production |
| QR code login pairing (passkey cross-device) | `passkey.router.ts`, `short-link.controller.ts` | Production |
| Smart account (Stellar Soroban) support | `passkey.service.ts` lines 406-478 | Production |
| Frontend passkey setup page | `frontend/app/setup-passkey/` | Production |

### Payment & Transfer

| Feature | Key Files | Status |
|---------|-----------|--------|
| P2P payments within ecosystem | `actions.router.ts` | Production |
| **External wallet transfers** (send to any Stellar public key) | `send-wallet.controller.ts`, `external.router.ts` | Production |
| Payment confirmation links | `external.router.ts` | Production |
| Pay anyone (public payment links) | `pay-link.controller.ts` | Production |
| Contact management (CRUD + enrichment) | `actions.router.ts`, `smart-contacts.service.ts` | Production |
| Auto-save contacts from external payments | `send-wallet.controller.ts` lines 71-111 | Production |
| Payment replay (repeat last payment) | `payment-replay.service.ts` | Production |
| Invoices (create/list/send) | `financial.router.ts`, `invoice.service.ts` | Production |
| Global profiles (public payment pages) | `global-profile.service.ts` | Production |
| Transaction history | `transaction-history.service.ts` | Production |
| Payment idempotency (deduplication) | `idempotency.service.ts` | Production |

### PIX On/Off Ramp

| Feature | Key Files | Status |
|---------|-----------|--------|
| PIX on-ramp (BRL deposit → Stellar) | `ramp.router.ts`, `anchor.service.ts` | Production |
| PIX off-ramp (sell Stellar → BRL withdrawal) | `ramp.router.ts` | Production |
| PIX virtual accounts | `ramp.router.ts` | Production |
| Etherfuse customer KYC | `ramp.router.ts` | Production |
| Etherfuse sandbox test endpoints | `ramp.router.ts` | Production |
| External bank accounts (PIX destinations) | Migration SQL lines 1098-1145 | Production |

### International Transfers (USD Payouts)

| Feature | Key Files | Status |
|---------|-----------|--------|
| International transfer lifecycle (BRL → USD) | `international-transfer.service.ts` | Production |
| Transfer state machine (QUOTE → PIX → STELLAR → PAYOUT) | `international-transfer-state.service.ts` | Production |
| Circle Mint sandbox wire payouts | `usd-payout-adapters.ts` | Live (sandbox) |
| Bridge.xyz PIX on/off-ramp | `bridge.router.ts` | Built (blocked by KYC) |
| Payout provider adapters (4 providers) | `usd-payout-adapters.ts` | Production |
| Same-name payout enforcement | Migration SQL line 1575 | Production |
| Reconciliation evidence | `settlement-evidence.service.ts` | Production |

### Orchestration (13-State Transfer Engine)

| Feature | Key Files | Status |
|---------|-----------|--------|
| Transfer state machine (13 states) | `stateMachine.ts`, `types.ts` | Production |
| Transfer orchestrator | `TransferOrchestrator.ts` | Production |
| Append-only transfer events (immutable audit) | Migration SQL lines 2534-2657 | Production |
| Stellar settlement watcher (Horizon poller) | `stellarWatcher.ts` | Production |
| Atomic transfer RPCs with optimistic locking | Migration SQL lines 2574-2657 | Production |
| Decimal-safe financial arithmetic | `decimal.ts` | Production |

### Bridge.xyz Integration

| Feature | Key Files | Status |
|---------|-----------|--------|
| Bridge customer CRUD + email lookup | `bridge.router.ts` | Production |
| KYC link generation (Persona + ToS) | `bridge.router.ts` | Production |
| Exchange rates (5 fiat pairs) | `bridge.router.ts` | Production |
| Payout estimation | `bridge.router.ts` | Production |
| PIX external accounts | `bridge.router.ts` | Built, blocked by KYC |
| Liquidation addresses (USDC → PIX) | `bridge.router.ts` | Built, blocked by KYC |
| Virtual accounts (PIX → USDC) | `bridge.router.ts` | Built, blocked by KYC |
| Bridge webhook endpoint | `bridge-webhook.router.ts` | Production |
| Mainnet safety gates | `bridge-mainnet.middleware.ts` | Production |

### Asset Management

| Feature | Key Files | Status |
|---------|-----------|--------|
| Multi-asset (XLM, USDC, BRL/TESOURO, EURC) | `assets.ts` | Production |
| **EUR/EURC as asset** | `assets.ts`, `bridge/types.ts` | Production |
| Conversion rate matrix (all pairs) | `conversion-rate-matrix.service.ts` | Production |
| Auto-conversion rules (on_receive / on_threshold) | `auto-conversion.service.ts` | Production |
| Trustline management | `trustline.service.ts` | Production |
| Platform fee engine (30bps default) | `platform-fee.service.ts` | Production |
| Defindex yield (USDC + EURC vaults) | `defindex-yield.service.ts` | Production (testnet) |

### Wallet & Key Management

| Feature | Key Files | Status |
|---------|-----------|--------|
| **Supabase Vault for private keys** | `vault.service.ts` | Production |
| Non-custodial wallet architecture | Migration SQL lines 42-61 | Production |
| Stellar wallet creation & funding | `stellar.service.ts` | Production |
| Mainnet wallet infrastructure | `mainnet-wallet.service.ts` | Production |
| Smart accounts (Soroban passkey wallets) | `passkey.service.ts` | Production |

### Notifications & Messaging

| Feature | Key Files | Status |
|---------|-----------|--------|
| **WhatsApp integration (Evolution API)** | `evolution.router.ts`, `evolution.service.ts` | Production |
| **Telegram integration** | `transfer-notification.service.ts` | Production |
| Transfer receipt notifications (multi-channel) | `transfer-notification.service.ts` | Production |
| Balance alerts | `balance-alert.service.ts` | Production |
| FX rate alerts | `fx-rate-alert.service.ts` | Production |
| Daily summary scheduler | `daily-summary.service.ts` | Production |

### Email System

| Feature | Key Files | Status |
|---------|-----------|--------|
| **Email confirmation codes** | `email-confirmation.service.ts` | Production |
| **Multi-provider email (SES, Resend, SendGrid)** | `email-confirmation.service.ts` | Production |
| Email verification table with RLS | Migration SQL lines 1151-1202 | Production |

### Security

| Feature | Key Files | Status |
|---------|-----------|--------|
| **Row-Level Security on 48+ tables** | Migration SQL | Production |
| Service-role RLS policies | Migration SQL lines 447-452 | Production |
| Rate limiting on auth/passkey/security routes | `app.ts`, `security.middleware.ts` | Production |
| Audit event logging | `audit.middleware.ts` | Production |
| Private key content scrubbing from chat | `agent.repository.ts` | Production |
| Sensitive data redaction | `redaction.ts` | Production |
| Public error sanitization (no internal leaks) | `public-error.ts` | Production |
| Login lockout (5 attempts → 15 min) | `login-password.service.ts` | Production |

### Frontend (45+ pages)

| Page | Route | Status |
|------|-------|--------|
| Landing | `/` | Production |
| Login / Create account | `/login`, `/create-account` | Production |
| Chat (AI agent) | `/chat` | Production |
| Balance | `/balance` | Production |
| **Send to external wallet** | `/send-external` | Production |
| Convert / Confirm conversion | `/convert`, `/confirm-conversion` | Production |
| PIX on-ramp / off-ramp | `/pix-on`, `/pix-off`, `/pix-ramp` | Production |
| International transfer | `/international-transfer`, `/global-transfer` | Production |
| Receipt view | `/receipt` | Production |
| Passkey setup | `/setup-passkey` | Production |
| Bridge test | `/bridge-test` | Production |
| Wire test | `/wire-test` | Production |
| Transactions / History | `/transactions` | Production |
| Profile | `/profile`, `/u/:username` | Production |
| Yield / Rendimentos | `/yield`, `/rendimento` | Production |
| Pay anyone | `/pay-anyone` | Production |

---

## 3. Major Pending Items

### KYC / Compliance

| Item | Priority | Notes |
|------|----------|-------|
| Bridge.xyz KYC completion | High | `a@gmail.com` customer needs Persona KYC + ToS acceptance to unblock money movement |
| Avenia account activation | Medium | Account created (HTTP 201), login blocked — needs email verification or admin manual activation |
| Production KYC/KYB policy document | Medium | Formal AML/KYC policy for regulatory submissions |
| PEP/sanctions screening automation | Medium | Integrate compliance screening into onboarding flow |

### Bridge.xyz — Money Movement

| Item | Priority | Notes |
|------|----------|-------|
| PIX external account creation | High | Code ready, blocked by KYC |
| Liquidation address creation (USDC → PIX) | High | Code ready, blocked by KYC |
| Virtual account creation (PIX → USDC) | High | Code ready, blocked by KYC |
| Transfer creation (one-time payments) | High | Code ready, blocked by KYC |
| Webhook management UI | Low | CRUD for webhook endpoints |
| Transfer status sync jobs (polling fallback) | Low | Background polling for webhook gaps |
| WhatsApp/Telegram Bridge UX | Low | Natural language commands for Bridge flows |

### Platform Gaps

| Item | Priority | Notes |
|------|----------|-------|
| **Non-custodial documentation (this doc)** | High | Done |
| **Mainnet deployment** for Stellar wallets | High | Currently testnet only — Mainnet infrastructure exists but not activated |
| Production monitoring / alerting | High | Ops dashboard exists, needs alerting rules |
| Automated testing (E2E) | Medium | Unit tests exist, no integration/E2E |
| CI/CD pipeline | Medium | Manual deploys to Railway/Vercel |
| Rate limiting on money movement | High | Exists on auth routes, not on transfer/payout |
| Transaction rollback / refund flow | Medium | State machine supports REFUND_REQUIRED, implementation incomplete |
| Webhook idempotency for all providers | Medium | Bridge webhook partial, Etherfuse pending |

### Database

| Item | Priority | Notes |
|------|----------|-------|
| Bridge tables migration application | High | `20260618_00_bridge_tables.sql` created, not applied |
| User-facing RLS policies | Medium | All tables have RLS enabled, but user-facing policies not defined (service_role only) |
| Migration version tracking | Low | No migration framework — manual SQL application |

---

## 4. Cross-Border Payment Flow (End-to-End)

```
User sends BRL via PIX
        ↓
   Etherfuse Sandbox
        ↓
   Stellar Testnet (USDC settlement)
        ↓
   TransferOrchestrator (13-state FSM)
        ↓
   Circle Mint / Bridge.xyz (USD wire payout)
        ↓
   US Bank Account (BANK OF AMERICA, NA)
```

Non-custodial at every step: the user's Stellar wallet holds USDC directly. The system orchestrates but never takes custody.

---

## 5. Environment

| Component | Value |
|-----------|-------|
| Backend URL | `https://talk-to-stellar-production-e284.up.railway.app` |
| Stellar network | Testnet (Mainnet code ready, not activated) |
| Circle Mint | Sandbox (wallet `1017459986`, $124,845 USD) |
| Bridge.xyz | Mainnet (live API key, KYC blocked) |
| Database | Supabase (48+ tables, RLS enabled) |
| Email | SES / Resend / SendGrid configured |
| WhatsApp | Evolution API v2 |
| Telegram | Bot API |

---

## 6. Resumen Ejecutivo (Español)

TalkToStellar es una plataforma **no custodial** de pagos transfronterizos. El sistema nunca retiene, controla ni tiene acceso irrestricto a los fondos de los usuarios. Cada usuario tiene su propia wallet Stellar con su propia clave privada almacenada en Supabase Vault, accesible únicamente por el backend (service_role). Las transacciones se confirman mediante PIN o Passkey biométrico, y el backend firma en nombre del usuario sin exponer las claves privadas.

**Ya implementado**:
- Autenticación por PIN, Google OAuth, email+password, Passkey/WebAuthn
- Transferencias a wallets externas (cualquier clave pública Stellar)
- PIX on/off-ramp vía Etherfuse
- Transferencias internacionales USD vía Circle Mint (sandbox) y Bridge.xyz (KYC pendiente)
- Multi-asset: XLM, USDC, BRL/TESOURO, EURC
- WhatsApp y Telegram para notificaciones y recibos
- QR codes para login cross-device y perfiles públicos
- Row-Level Security en 48+ tablas
- 45+ páginas frontend
- Código de envío de email multi-proveedor (SES, Resend, SendGrid)

**Pendiente principal**: KYC en Bridge.xyz para desbloquear movimiento de dinero real. Cliente `a@gmail.com` necesita completar Persona KYC + aceptar ToS.

**Razón legal para ser no custodial**: La plataforma no califica como transmisor de dinero ni custodio. Cada usuario mantiene control total de sus fondos en su propia wallet Stellar. Esto simplifica obligaciones KYC/AML y reduce riesgo regulatorio.
