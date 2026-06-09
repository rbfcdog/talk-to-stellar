# PIX → USDC → ACH Atomic Flow

## Overview

Single-operation flow: user sends BRL via PIX, receives USD in their US bank account.
Three conversions happen atomically: BRL (PIX) → USDC (Stellar) → USD (ACH).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TalkToStellar                            │
│                                                              │
│  User says: "mandar $100 pra conta dos EUA"                  │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ 1. Validate  │ → │ 2. Quote     │ → │ 3. Execute   │   │
│  │ customer +   │    │ BRL→USDC     │    │ PIX→USDC→ACH │   │
│  │ US bank acct │    │ rate + fees  │    │ atomic       │   │
│  └──────────────┘    └──────────────┘    └──────┬───────┘   │
│                                                  │           │
│  ┌───────────────────────────────────────────────┘           │
│  │  Bridge.xyz Orchestration                                  │
│  │                                                            │
│  │  Step A: PIX Virtual Account ──→ Stellar USDC              │
│  │    POST /customers/{id}/virtual_accounts                   │
│  │    { source: { currency: "brl" },                          │
│  │      destination: { rail: "stellar", currency: "usdc",     │
│  │                     address: "G..." } }                    │
│  │                                                            │
│  │  Step B: User sends PIX → Bridge receives BRL              │
│  │    Webhook: virtual_account.deposit_received               │
│  │                                                            │
│  │  Step C: ACH Off-Ramp Transfer                             │
│  │    POST /transfers                                         │
│  │    { source: { rail: "stellar", currency: "usdc",          │
│  │               from_address: "G..." },                       │
│  │      destination: { amount: "$100", rail: "ach",           │
│  │                     currency: "usd",                       │
│  │                     external_account_id: "ea_..." } }       │
│  │                                                            │
│  │  Step D: Bridge auto-converts → USD → ACH → bank           │
│  │    Webhook: transfer.completed                             │
│  │                                                            │
│  └────────────────────────────────────────────────────────────┘
│                                                              │
│  User receives: "$100.00 sent to Chase ****9123 ✓"           │
└──────────────────────────────────────────────────────────────┘
```

## API Sequence (from TalkToStellar → Bridge)

```
1. POST /v0/customers/{id}/external_accounts
   → Register US bank account (one-time setup per user)

2. POST /v0/customers/{id}/virtual_accounts
   → Create PIX deposit address → USDC on Stellar
   → Returns PIX key for user to pay

3. [User sends PIX payment]

4. Webhook: virtual_account.deposit_received
   → TalkToStellar receives notification

5. POST /v0/transfers
   → Create ACH off-ramp: Stellar USDC → US bank
   → Returns transfer ID

6. Webhook: transfer.completed
   → User gets receipt in WhatsApp/Telegram
```

## Code Structure

```
backend/src/api/services/
├── bridge-pix-ach.service.ts     ← NEW: orchestrates PIX→USDC→ACH flow
└── bridge-webhook.service.ts     ← NEW: handles Bridge webhook dispatch
```

### bridge-pix-ach.service.ts

```typescript
class BridgePixAchService {
  // 1. Register the user's US bank account (one-time)
  async registerUsBankAccount(userId: string, bankDetails: USBankInput): Promise<string>

  // 2. Create the full PIX → ACH flow
  async createPixToAchOrder(input: PixToAchInput): Promise<PixToAchOrder>

  // 3. Handle deposit received — auto-triggers ACH off-ramp
  async onPixDepositReceived(virtualAccountId: string, amount: string): Promise<AchTransfer>

  // 4. Handle ACH completed — sends user receipt
  async onAchCompleted(transferId: string): Promise<void>
}
```

### Flow States

```
awaiting_pix ──→ pix_received ──→ converting_ach ──→ completed
     │                                    │
     └── (timeout 30m) ──→ expired         └── (fail) ──→ failed
```

## User Experience (WhatsApp)

**User**: mandar 100 dolares pra minha conta chase

**TTS**: Claro! Sua conta Chase terminando em 9123 está registrada.
       Para receber $100.00:
       • Você envia: ~R$ 560.00 via PIX
       • Taxa Bridge: ~R$ 2.80 (0.50%)
       • Taxa TTS: R$ 1.68 (0.30%)
       • Chega na sua conta: $100.00
       
       Envie o PIX para esta chave: tts-rodrigo@bridge.xyz
       
       Assim que o PIX cair, convertemos para dólar e enviamos
       via ACH para sua conta. Você recebe o comprovante.

**User**: [Sends PIX]

**TTS**: ✅ PIX recebido! Convertendo R$ 560.00 → $100.00.
       Enviando para sua conta Chase via ACH...

**TTS**: ✅ $100.00 enviado para Chase ****9123!
       Deve chegar em 1-2 dias úteis.
       Comprovante: https://talktostellar.com/receipt/xYz123
```

## Implementation

The service lives at `backend/src/api/services/bridge-pix-ach.service.ts` and uses:

- `BridgeService` from `integrations/bridge` for all API calls
- `ExternalService` for short-link generation (receipt URLs)
- `AgentRepository` for session state tracking
- Supabase for persisting the order state between PIX deposit and ACH completion
