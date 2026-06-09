# Bridge.xyz — Integration Research for TalkToStellar

## What is Bridge?

**Bridge.xyz** (acquired by Stripe, 2024) is a stablecoin orchestration platform that provides APIs to move money between fiat and crypto rails. It handles regulatory compliance, KYC, banking relationships, and blockchain infrastructure — all through a single API.

> *"Move, store, and accept stablecoins — all through a single API."*

---

## Why Bridge Matters for TalkToStellar

TalkToStellar currently uses **Etherfuse** (sandbox) for PIX on/off-ramp and has no USD off-ramp. Bridge can replace both:

| Capability | Current (Etherfuse) | Bridge |
|---|---|---|
| **PIX on-ramp** | Sandbox only, TESOURO settlement | Production-ready, PIX → USDC on Stellar |
| **PIX off-ramp** | Sandbox only | Production-ready, USDC → PIX to any key |
| **USD ACH on-ramp** | None | US bank account → USDC |
| **USD ACH off-ramp** | None | USDC → any US bank account |
| **USD Wire** | None | USDC ↔ Wire transfers |
| **Stellar support** | Custom TESOURO issuer | **Native Stellar USDC** |
| **KYC** | Etherfuse handles | Bridge handles (individual + business) |
| **Compliance** | Etherfuse | Bridge + Stripe (MSB licensed, NMLS #2450917) |
| **Yield** | None | USDB earns rewards automatically (US Treasuries) |
| **Cards** | None | Stablecoin-backed cards via Stripe Issuing |
| **Min PIX** | Varies | **10 BRL** |
| **Min ACH** | N/A | **$1 USD** |

---

## Supported Rails Relevant to TalkToStellar

### PIX (BRL) — Both On-Ramp and Off-Ramp

```
BRL via PIX → USDC on Stellar (on-ramp)
USDC on Stellar → BRL via PIX (off-ramp)
```

- **Minimum**: 10 BRL
- **KYC required**: CPF (individual) or CNPJ (business), phone, selfie
- **Virtual Accounts**: Unique PIX key per customer
- **Liquidation Addresses**: Auto-convert inbound crypto → PIX out
- **Endorsement**: Requires PIX endorsement on customer profile

### ACH (USD) — Both On-Ramp and Off-Ramp

```
USD via ACH → USDC on Stellar (on-ramp)
USDC on Stellar → USD via ACH (off-ramp)
```

- **Minimum**: $1 USD
- **Methods**: Standard ACH, Same-Day ACH, Wire, FedNow
- **Virtual Accounts**: Account + routing number per customer
- **Off-ramp**: US bank account via External Account API

### Stellar — Natively Supported

Bridge supports **USDC on Stellar** as both source and destination for ALL fiat rails:

| Fiat Rail | USDC on Stellar |
|---|---|
| BRL @ PIX | ✅ both directions |
| USD @ ACH | ✅ both directions |
| USD @ Wire | ✅ both directions |
| EUR @ SEPA | ✅ both directions |
| MXN @ SPEI | ✅ both directions |
| GBP @ Faster Payments | ✅ both directions |

---

## API Architecture

### Core Concepts

```
Customer → KYC → Endorsement → Transfer/VirtualAccount/LiquidationAddress
```

1. **Customer** — Individual or business, KYC'd
2. **Endorsement** — Permission to use specific currency/rail (e.g., PIX endorsement)
3. **Transfer** — One-time fiat ↔ crypto conversion
4. **Virtual Account** — Persistent deposit address (PIX key or US account number)
5. **Liquidation Address** — Auto-forward inbound crypto to fiat destination
6. **External Account** — Bank account or PIX key for off-ramp destination
7. **Bridge Wallet** — Custodial wallet for holding stablecoins

### Key Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /v0/customers` | Create customer (individual or business) |
| `POST /v0/customers/:id/kyc_links` | Generate hosted KYC link |
| `PUT /v0/customers/:id` | Update customer with KYC data |
| `POST /v0/transfers` | Create one-time transfer (on-ramp or off-ramp) |
| `POST /v0/customers/:id/virtual_accounts` | Create persistent deposit address |
| `POST /v0/customers/:id/external_accounts` | Add PIX key or US bank account |
| `POST /v0/customers/:id/liquidation_addresses` | Auto-forward crypto address to fiat |

---

## PIX On-Ramp Flow (BRL → USDC on Stellar)

```
1. Create Customer (CPF + phone + selfie)
2. Create PIX endorsement
3. Create Virtual Account (BRL, destination: USDC on Stellar)
4. Customer sends PIX to the generated PIX key
5. Bridge auto-converts BRL → USDC on Stellar
6. Webhook confirms completion
```

```bash
# Create virtual account for PIX → USDC on Stellar
curl -X POST https://api.bridge.xyz/v0/customers/{customer_id}/virtual_accounts \
  -H 'Api-Key: {api_key}' \
  -H 'Content-Type: application/json' \
  -d '{
    "source": { "currency": "brl" },
    "destination": {
      "payment_rail": "stellar",
      "currency": "usdc",
      "address": "G...STELLAR_PUBLIC_KEY..."
    },
    "developer_fee_percent": "0.30"
  }'
```

## PIX Off-Ramp Flow (USDC → BRL via PIX)

```
1. Customer already KYC'd with PIX endorsement
2. Add External Account (PIX key)
3. Create Transfer from Bridge Wallet → PIX destination
4. Bridge auto-converts USDC → BRL, sends via PIX
```

```bash
# Off-ramp: USDC on Stellar → BRL via PIX
curl -X POST https://api.bridge.xyz/v0/transfers \
  -H 'Api-Key: {api_key}' \
  -H 'Content-Type: application/json' \
  -d '{
    "on_behalf_of": "{customer_id}",
    "developer_fee_percent": "0.30",
    "source": {
      "currency": "usdc",
      "payment_rail": "stellar",
      "from_address": "G...STELLAR_PUBLIC_KEY..."
    },
    "destination": {
      "amount": "100.00",
      "currency": "brl",
      "payment_rail": "pix",
      "external_account_id": "{pix_key_external_account_id}"
    }
  }'
```

## USD ACH Off-Ramp Flow (USDC → USD to Bank)

```
1. Customer KYC'd
2. Add External Account (US bank routing + account number)
3. Create Transfer from Bridge Wallet → ACH to bank
4. Bridge auto-converts USDC → USD, sends via ACH
```

```bash
# Off-ramp: USDC → USD via ACH
curl -X POST https://api.bridge.xyz/v0/transfers \
  -H 'Api-Key: {api_key}' \
  -H 'Content-Type: application/json' \
  -d '{
    "on_behalf_of": "{customer_id}",
    "source": {
      "currency": "usdc",
      "payment_rail": "stellar",
      "from_address": "G..."
    },
    "destination": {
      "amount": "100.00",
      "currency": "usd",
      "payment_rail": "ach",
      "external_account_id": "{us_bank_account_id}",
      "ach_reference": "TTS PAYOUT"
    }
  }'
```

---

## Comparison: Bridge vs Current Architecture

| Layer | Current | Bridge Integration |
|---|---|---|
| **PIX BRL → Crypto** | Etherfuse sandbox (TESOURO) | Bridge production (USDC on Stellar) |
| **Crypto → PIX BRL** | Etherfuse sandbox | Bridge production |
| **Crypto → USD bank** | None (planned) | Bridge ACH/Wire |
| **KYC** | Etherfuse handles | Bridge handles |
| **Stellar integration** | Direct SDK + custom issuer | Bridge abstracts, native USDC |
| **Fee monetization** | Manual spread | `developer_fee_percent` built-in |
| **Webhooks** | Custom | Bridge webhooks with signatures |
| **Compliance** | Self-managed | Bridge + Stripe (MSB licensed) |

---

## Implementation Strategy

### Phase 1: Replace PIX On/Off-Ramp
- Remove Etherfuse integration
- Integrate Bridge Customers API (KYC)
- Integrate Bridge Virtual Accounts (PIX in) + Transfers (PIX out)
- Map existing TalkToStellar users to Bridge customers

### Phase 2: Add USD ACH Off-Ramp
- Let users add US bank accounts via Bridge External Accounts API
- Implement Transfer off-ramp: USDC → USD → ACH
- Show USD balance + withdrawal UI in chat

### Phase 3: USD ACH On-Ramp + Virtual Accounts
- US users can deposit USD via ACH → USDC in TalkToStellar
- Virtual Accounts with US routing/account numbers

### Phase 4: Cards + Yield
- USDB (Bridge's native stablecoin) auto-earns yield (US Treasuries, 3-4%)
- Stablecoin-backed cards via Stripe Issuing

---

## Key Advantages Over Current Setup

1. **Production-ready PIX** — No more sandbox-only limitation
2. **Native Stellar USDC** — No custom TESOURO issuer, simpler trustlines
3. **USD off-ramp** — Fills the biggest feature gap (can't send to US bank)
4. **Stripe backing** — Enterprise compliance, banking licenses, reliability
5. **Built-in monetization** — `developer_fee_percent` on every transfer
6. **Yield on idle balance** — USDB earns 3-4% automatically
7. **Card issuance** — Future: debit card spending from account balance
8. **Single API** — One integration covers PIX, ACH, Wire, SEPA, cards, yield

---

## Risks and Considerations

| Risk | Mitigation |
|---|---|
| **Bridge pricing/fees** | Need to model vs current spread; Bridge fees are transparent |
| **Brazil KYC requirements** | Bridge supports CPF, CNPJ, selfie, address proof for PIX |
| **Migration from Etherfuse** | Phase migration; keep Etherfuse as fallback during transition |
| **API dependency** | Bridge is Stripe-owned; enterprise SLA expected |
| **Stellar USDC issuer** | Bridge uses Circle's USDC on Stellar (standard, liquid) |
| **PIX endorsement approval** | Requires Bridge sales team; early contact recommended |

---

## Next Steps

1. **Contact Bridge sales** at `sales@bridge.xyz` to request PIX access
2. **Create sandbox account** at `https://apidocs.bridge.xyz`
3. **Build proof-of-concept**: PIX on-ramp (BRL → USDC on Stellar)
4. **Model economics**: compare Bridge fees vs current Etherfuse + spread
5. **Design KYC flow**: how TalkToStellar onboarding maps to Bridge KYC

---

*Research date: June 2026. Bridge API docs: https://apidocs.bridge.xyz*
