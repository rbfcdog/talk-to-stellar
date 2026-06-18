# Stellar in Bridge.xyz

## Is Stellar actually supported?

**Yes — and it's a first-class chain, not an afterthought.**

Bridge.xyz officially supports Stellar as a destination chain for:
- Virtual accounts (fiat → USDC on Stellar)
- Liquidation addresses (USDC on Stellar → fiat)
- Transfers (send USDC from Stellar wallet to bank)

Stellar sits alongside Ethereum, Solana, Base, Polygon, Arbitrum, and Tron in Bridge's supported chain list. It is described internally as "the dominant rail for MoneyGram and several African corridors."

---

## Why is the Bridge wallet "Base" by default?

It wasn't — that was a misconfiguration in the TalkToStellar codebase.

The original `backend/src/integrations/bridge/config.ts` had:
```typescript
BRIDGE_DEFAULT_SOURCE_CHAIN=base   // ← wrong for TalkToStellar
```

**This was fixed.** It now defaults to `stellar`. You can confirm with:

```env
BRIDGE_DEFAULT_SOURCE_CHAIN=stellar
```

Bridge itself has no concept of a "native wallet chain." When you create a virtual account or transfer, you pick the destination chain — Stellar, Base, or anything else. Bridge is chain-agnostic. Your app sets the default.

---

## How Bridge + Stellar works in practice

### On-ramp (fiat → USDC on Stellar)

1. User creates a virtual account specifying `payment_rail: "stellar"` and their Stellar wallet address as the destination
2. Bridge gives user a local bank account (Lead Bank for USD, SEPA account for EUR, etc.)
3. User deposits fiat to that account via wire / ACH / PIX / SEPA
4. Bridge converts the fiat to USDC and delivers it to the Stellar wallet
5. Delivery happens via standard Stellar transaction with the memo attached

### Off-ramp (USDC on Stellar → fiat)

1. User sends USDC from their Stellar wallet to Bridge's deposit address
2. **The Stellar memo is mandatory** — without it Bridge can't route the payment
3. Bridge converts USDC to fiat and pays out via PIX / ACH / SEPA / wire

### Stellar-specific details

| Field | Value |
|---|---|
| USDC issuer on Stellar | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| `payment_rail` value | `"stellar"` |
| `currency` value | `"usdc"` |
| `blockchain_memo` | **Required** — Bridge rejects the request without it |
| Auto-generated memo | Backend generates a 7-digit numeric memo if you don't supply one |
| Muxed (memoless) address | Bridge also provides a `memoless_address` (M-address) for wallets that can't attach memos |

---

## Destination address requirements

Bridge validates the Stellar destination address before creating a virtual account:

1. **Must exist on mainnet** — a freshly generated keypair that has never been funded will be rejected
2. **Must be funded with XLM** — the account needs to meet the base reserve (~1 XLM)
3. **Must have a USDC trust line** — the account must have explicitly opted in to receive USDC from the Circle issuer (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`)

**Use a real wallet**: Lobstr, Freighter, or any wallet that holds Stellar USDC will have all three. Random generated keys will not work.

You can verify an address on Stellar Expert:
```
https://stellar.expert/explorer/public/account/G...
```

---

## Real-world usage at scale

**Airtm (March 2024)**
- Integrated Bridge + Stellar for cross-border enterprise payroll
- Bridge converts incoming USD to USDC → delivers via Stellar → workers receive in Airtm wallet
- Result: ~20–25% cost savings vs PayPal/Wise; nearly half of Airtm's total payout volume now flows through this rail
- Airtm processed $1.2B in stablecoin volume in 2024

**MoneyGram MGUSD (June 2026)**
- MoneyGram launched MGUSD, their own dollar stablecoin, on Stellar — with Bridge as the regulated issuer
- Bridge handles minting and compliance; Stellar is the settlement chain
- Reaches 60M+ customers and 500K+ retail locations globally
- This makes Bridge the regulated issuer of a stablecoin specifically deployed on Stellar mainnet

These aren't experiments — Stellar is Bridge's preferred chain for emerging-market and high-volume remittance flows.

---

## Why Stellar over Base for TalkToStellar

| | Stellar | Base |
|---|---|---|
| Transaction fee | ~$0.00001 | ~$0.01–$0.10 |
| Settlement speed | 3–5 seconds | ~2 seconds |
| USDC support | Native via Circle | Native via Circle |
| Memo support | Built-in (required by Bridge) | Not applicable |
| Best for | Remittances, micropayments, emerging markets | DeFi, NFTs, Coinbase ecosystem |
| Bridge priority | MoneyGram rail, African corridors | US fintech / Coinbase apps |

For TalkToStellar — a Stellar-native app targeting cross-border payments — Stellar is the right chain. Base would require users to have a MetaMask/EVM wallet, pay gas in ETH, and have no connection to the Stellar ecosystem the app is built on.

---

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `"Blockchain memo must be set when payment_rail is stellar"` | Missing `blockchain_memo` | Backend auto-generates one; or pass it explicitly |
| `"Invalid destination address"` | Address doesn't exist on mainnet | Use a real Lobstr/Freighter/TalkToStellar address |
| `"Destination account not found"` | Account never funded | Fund with XLM first |
| `"Trust line not found"` | No USDC trust line on the account | Add USDC trust line in Lobstr/Freighter |
| `"Mainnet money movement is disabled"` | `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=false` | Set it to `true` on Railway |

---

## Sources

- [Stellar.org case study: Airtm × Bridge](https://stellar.org/case-studies/airtm-x-bridge-cross-border-payments)
- [Bridge.xyz case study: Airtm](https://www.bridge.xyz/case-study/airtm-case-study)
- [Bridge API docs: Virtual Accounts](https://apidocs.bridge.xyz/platform/orchestration/virtual_accounts/virtual-account)
- [CoinDesk: MoneyGram launches MGUSD on Stellar (June 2026)](https://www.coindesk.com/business/2026/06/02/moneygram-launches-stablecoin-on-stellar-joining-rush-toward-digital-dollar-payments)
- [Bridge API docs: Create a Virtual Account](https://apidocs.bridge.xyz/api-reference/virtual-accounts/create-a-virtual-account)
