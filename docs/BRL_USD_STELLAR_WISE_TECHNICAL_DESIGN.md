# BRL to USD via PIX, Stellar USDC and Wise-compatible payout

Version: 0.1
Status: product and architecture proposal, not a regulated production flow

## Executive Thesis

The product converts a Brazilian PIX payment into USD delivery for a global recipient account:

```text
BRL payer bank account
-> PIX in
-> BRL ledger credit
-> BRL/USD quote
-> USDC acquisition
-> Stellar USDC settlement
-> USD off-ramp
-> ACH/Wire/SWIFT-local payout
-> Wise USD details or international bank account
```

The product should not position itself as a way to avoid IOF, FX registration or regulation. The defensible thesis is lower operational cost through better liquidity, faster settlement, fewer correspondent banking hops and stronger reconciliation.

The hard part is not Stellar settlement. The hard part is the regulated bridge from on-chain USDC to bank USD and onward payout.

## Reference Sources

- Banco Central do Brasil describes FX as the exchange of one country's currency for another and says remittances happen through the FX market with authorized institutions: https://www.bcb.gov.br/estabilidadefinanceira/oqueecambio
- Banco Central FAQ says FX operations require an authorized FX institution to prove consent and report minimum operation data such as party identity, dates, currencies, values, rate, delivery form and purpose: https://www.bcb.gov.br/meubc/faqs/p/o-que-e-operacao-de-cambio
- Stellar Anchor Platform supports SEP-1, SEP-6, SEP-10, SEP-12, SEP-24, SEP-31 and SEP-38 for anchor on/off-ramp services: https://developers.stellar.org/platforms/anchor-platform/admin-guide/overview
- Circle Mint documentation describes minting/redeeming USDC and EURC, with USDC redeemed 1:1 for USD for institutional customers: https://developers.circle.com/circle-mint
- Wise USD account details documentation says recipients can receive USD using account and routing details, with domestic US bank payments or SWIFT depending on the route: https://wise.com/help/articles/2827506/how-do-i-use-my-usd-account-details

## System Components

| Layer | Responsibility | MVP Implementation |
| --- | --- | --- |
| PIX in | Receive BRL and confirm settlement | Partner PIX API webhook, not direct Central Bank integration |
| Ledger | Track every money movement | Internal double-entry ledger or Postgres ledger tables for MVP |
| FX quote | Lock BRL/USD, fees, IOF estimate and expiry | Quote engine with partner quote source and deterministic fee breakdown |
| Liquidity | Buy or allocate USDC | Market maker, OTC desk, exchange or prefunded treasury |
| Stellar wallet | Send USDC on Stellar | Custody provider or HSM-backed signer |
| Off-ramp | Convert USDC to bank USD | Bridge, Circle Mint, Rail or equivalent regulated provider |
| Bank payout | Deliver USD to recipient details | ACH, wire or SWIFT-local payout through partner |
| Compliance | KYC/KYB, sanctions, AML, monitoring | Provider integrations plus internal risk rules |
| Operations | Exception handling and reconciliation | Ops console with status, provider IDs, hashes and refunds |

## Ledger Status Model

Minimum status machine:

```text
BRL_PENDING
BRL_RECEIVED
FX_QUOTED
USDC_PURCHASED
STELLAR_SENT
STELLAR_CONFIRMED
USDC_RECEIVED_OFFRAMP
USD_REDEEMED
USD_SENT_TO_BANK
COMPLETED
FAILED
REFUND_PENDING
REFUNDED
```

Each transition must have:

- immutable event ID;
- provider event ID;
- timestamp;
- actor or webhook source;
- amount and currency;
- before/after ledger balances;
- idempotency key;
- audit metadata.

## Data Model Draft

```json
{
  "transaction_id": "txn_123",
  "quote_id": "quote_123",
  "payer_id": "br_company_1",
  "recipient_id": "recipient_us_1",
  "source_currency": "BRL",
  "target_currency": "USD",
  "brl_amount": "10000.00",
  "fx_rate": "5.2400",
  "gross_usd": "1908.39",
  "usdc_amount": "1901.71",
  "estimated_usd_net": "1883.25",
  "iof_brl": "38.00",
  "platform_fee_usd": "15.27",
  "liquidity_fee_usd": "6.68",
  "offramp_fee_usd": "4.77",
  "bank_fee_usd": "1.25",
  "stellar_tx_hash": "hash_or_null",
  "offramp_provider": "bridge",
  "offramp_transfer_id": "provider_id_or_null",
  "bank_transfer_id": "ach_id_or_null",
  "status": "FX_QUOTED"
}
```

## Stellar Layer

Use USDC on Stellar as the settlement asset. For anchor interoperability, the relevant SEPs are:

| SEP | Use |
| --- | --- |
| SEP-1 | `stellar.toml` service discovery |
| SEP-10 | Wallet/account authentication |
| SEP-12 | KYC/AML customer data |
| SEP-24 | Hosted deposit/withdraw UX |
| SEP-31 | Cross-border payment receive flow |
| SEP-38 | RFQ and exchange quote |

Conceptual `stellar.toml`:

```toml
ACCOUNTS = ["G..."]
SIGNING_KEY = "G..."
NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015"

[DOCUMENTATION]
ORG_NAME = "TalkToStellar"
ORG_URL = "https://talktostellar.com"
ORG_DESCRIPTION = "BRL to USD settlement infrastructure"

[[CURRENCIES]]
code = "USDC"
issuer = "G..."
status = "live"
is_asset_anchored = true
anchor_asset_type = "fiat"
anchor_asset = "USD"

WEB_AUTH_ENDPOINT = "https://api.talktostellar.com/sep10/auth"
TRANSFER_SERVER_SEP0024 = "https://api.talktostellar.com/sep24"
DIRECT_PAYMENT_SERVER = "https://api.talktostellar.com/sep31"
ANCHOR_QUOTE_SERVER = "https://api.talktostellar.com/sep38"
```

## Detailed Flow

1. Quote request
   - User enters BRL amount, recipient country and payout rail.
   - System calculates FX, spread, platform fee, off-ramp fee, bank fee and estimated IOF.
   - Quote expires quickly, for example 5 to 10 minutes.

2. Transfer creation
   - User accepts quote and provides recipient bank details.
   - Compliance checks run before PIX collection if possible.
   - Ledger creates `BRL_PENDING`.

3. PIX collection
   - PIX partner creates charge or receives deposit.
   - Webhook confirms settled BRL.
   - Ledger moves to `BRL_RECEIVED`.

4. USDC acquisition
   - Quote source or treasury allocates USDC.
   - Ledger records BRL debit and USDC credit.
   - Status becomes `USDC_PURCHASED`.

5. Stellar settlement
   - Wallet signs Stellar USDC payment to off-ramp address.
   - Memo or provider reference links the transaction.
   - Status becomes `STELLAR_SENT`, then `STELLAR_CONFIRMED`.

6. USD off-ramp
   - Off-ramp provider receives Stellar USDC.
   - Provider redeems or exchanges to bank USD.
   - Status becomes `USD_REDEEMED`.

7. Bank payout
   - Provider sends ACH/wire/SWIFT-local transfer to the recipient's USD details.
   - Status becomes `USD_SENT_TO_BANK`, then `COMPLETED`.

8. Exceptions
   - If bank payout fails after USD redemption, hold USD with provider and request corrected details.
   - If PIX succeeds but compliance fails, refund BRL.
   - If Stellar succeeds but off-ramp fails, reconcile provider balance and retry or unwind.

## Provider Options

| Provider path | Good for | Main risk |
| --- | --- | --- |
| Circle Mint | Institutional mint/redeem and treasury | Eligibility and limited third-party payout coverage |
| Bridge-style stablecoin orchestration | API-first B2B stablecoin movement and payouts | Onboarding, jurisdiction and use-case approval |
| Rail-style USDC/USD accounts | Explicit USDC account -> USD account -> withdrawal model | Coverage and banking partner acceptance |
| Own anchor stack | Long-term control and Stellar-native interoperability | Licensing, compliance and banking relationships |

MVP recommendation: use a regulated off-ramp partner first, then implement more anchor capability after the model proves demand.

## Risk Positioning

This product must treat the flow as regulated international value transfer. The safe product statement is:

> We reduce operational cost and settlement time by using PIX, stablecoin liquidity, Stellar settlement and regulated off-ramp partners. We do not bypass tax, FX reporting, KYC, AML or sanctions obligations.

## MVP Scope

The first production-like pilot should be closed B2B:

- Brazilian company sends to its own Wise/Mercury/global USD account;
- approved users and recipients only;
- hard ticket limits;
- manual compliance review available;
- no open P2P;
- provider IDs and ledger events reconciled daily.

## Target Cost Envelope

| Layer | Initial target |
| --- | --- |
| PIX in | 0.00% to 0.05% |
| BRL to USDC liquidity | 0.10% to 0.50% |
| Stellar network | near-zero network fee |
| USDC to USD off-ramp | 0.10% to 0.50% |
| ACH | low fixed fee |
| Wire | higher fixed fee |
| Platform fee | 0.20% to 0.80% |

Target total: 0.90% to 1.50% plus applicable taxes/IOF and fixed rail fees.
