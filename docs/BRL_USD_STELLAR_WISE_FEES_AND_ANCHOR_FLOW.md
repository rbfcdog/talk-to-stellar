# PIX anchor and external USD payout flow

Status: product/engineering specification
Last reviewed: 2026-05-19

## What the interface now represents

The `/global-transfer` lab models the complete operating flow:

```text
1. Customer and KYC/KYB are prepared with the PIX anchor.
2. Anchor creates a PIX order and returns a mock PIX copia e cola.
3. PIX is marked as paid by webhook or sandbox simulation.
4. BRL exposure is converted or allocated into Stellar USDC.
5. USDC is settled through Stellar.
6. Off-ramp provider converts USDC into bank USD.
7. Bank rail sends USD to Wise-compatible or international bank details.
```

The current implementation is still a deterministic mock. It is useful for testing product economics, operations wording, quote payloads and release gates before real money movement.

## What is needed to make it real

### 1. PIX anchor or PIX provider

You need one of these production paths:

| Path | What it does | Notes |
| --- | --- | --- |
| Anchor sandbox first | Simulates PIX received and testnet asset delivery | Good for challenge/demo evidence only |
| PIX PSP plus internal anchor | PSP receives BRL, backend performs Stellar settlement | Best path for controlled production pilot |
| Banking partner anchor | Partner owns PIX, FX and possibly payout responsibilities | Faster compliance acceptance, less control |

Minimum production requirements:

- production PIX account or PSP contract;
- webhook signature validation;
- idempotent PIX order creation;
- order expiry;
- refund path;
- payer identity capture;
- KYC/KYB status linked to the PIX order;
- immutable event log for every status change.

### 2. Ledger

Do not connect production providers without a ledger. Minimum accounts:

```text
customer_brl_pending
customer_brl_settled
pix_fee_payable
anchor_fee_payable
platform_fee_revenue
liquidity_fee_payable
stellar_usdc_treasury
offramp_usdc_receivable
offramp_usd_balance
bank_payout_pending
wise_receiving_fee_estimate
refund_payable
```

Every movement needs:

- amount;
- currency;
- source account;
- destination account;
- idempotency key;
- provider reference;
- timestamp;
- previous and next status;
- operator or webhook source.

### 3. External payout provider

You need a partner that can receive or redeem USDC and send USD to bank details.

Required capabilities:

- create or validate recipient;
- support ACH, wire or local/SWIFT-like USD payout;
- return payout status webhooks;
- expose returned/rejected payment reason codes;
- support compliance review holds;
- provide daily reconciliation files or API reports.

### 4. Compliance and release gates

The interface models four release gates:

| Gate | Why it exists |
| --- | --- |
| KYC/KYB | Do not collect or move funds for unknown users |
| PIX settled | Do not release treasury value before BRL is actually received |
| USDC ready | Do not instruct off-ramp without funded Stellar settlement |
| External screening | Do not send USD before sanctions/fraud/purpose checks clear |

## Fees paid in the flow

The lab separates fees because each fee is paid to a different party and happens at a different moment.

| Fee | Paid to | When paid | Notes |
| --- | --- | --- | --- |
| PIX PSP fee | PIX provider or banking partner | When BRL is received | For businesses, PIX fees depend on the user's institution and commercial contract. |
| Anchor/on-ramp fee | Anchor or internal ramp desk | When the PIX order settles | Covers customer/order/quote orchestration and provider margin. |
| IOF/tax estimate | Tax authority via regulated FX flow | At FX classification/settlement | Must be confirmed by counsel and regulated FX partner for each purpose code. |
| FX/liquidity spread | Market maker, OTC desk, exchange or treasury | When BRL exposure becomes USDC/USD | Main controllable market cost. |
| Platform fee | TalkToStellar | At quote acceptance or settlement | Product revenue. |
| Stellar network fee | Stellar network fee pool | When transaction is submitted | Classic Stellar payments use a very small XLM fee per operation; exact fee is network-dependent. |
| Off-ramp fee | Bridge/Circle/Rail-style provider | When USDC becomes bank USD | Provider fee or embedded spread. |
| Bank payout fee | ACH/wire/SWIFT provider | When USD leaves provider balance | Usually low/fixed for ACH and higher/fixed for wire. |
| Wise receiving fee | Wise, if Wise account details are used | When Wise receives funds | Current Wise pricing says domestic non-wire receiving is free and USD wire/SWIFT receiving has a fixed fee. |
| KYC/AML vendor cost | Compliance vendor | User onboarding or review | Often fixed per check, not always charged directly to user. |

## Fee defaults used in the mock UI

These are test assumptions, not production pricing:

| Parameter | Default |
| --- | --- |
| PIX PSP fee | 10 bps plus BRL 0.49 |
| Anchor fee | 20 bps |
| Platform fee | 80 bps |
| Liquidity spread | 35 bps |
| Off-ramp fee | 25 bps |
| IOF estimate | 38 bps |
| Stellar network estimate | USD 0.0002 |
| ACH payout provider fee | USD 1.25 |
| Wire payout provider fee | USD 25.00 |
| SWIFT/local payout provider fee | USD 14.00 |
| Wise domestic USD receiving fee | USD 0.00 |
| Wise USD wire/SWIFT receiving fee | USD 6.11 |

## Backend endpoints still needed

```text
POST /api/global-transfers/quotes
POST /api/global-transfers/pix-anchor-orders
POST /api/global-transfers/pix-anchor-orders/:id/simulate-paid
POST /api/global-transfers/:id/external-payout
GET  /api/global-transfers/:id
POST /webhooks/pix-provider
POST /webhooks/offramp-provider
```

The first production version should keep these operations server-side:

- PIX order creation;
- provider API keys;
- KYC/KYB writes;
- Stellar signing;
- off-ramp recipient creation;
- payout submission;
- webhook verification.

## Sources

- Banco Central do Brasil PIX FAQ: companies may be charged by their institution for PIX sending/receiving depending on the use case: https://www.bcb.gov.br/meubc/faqs/p/quais-as-tarifas-relacionadas-ao-pix
- Banco Central do Brasil PIX FAQ for legal entities: https://www.bcb.gov.br/meubc/faqs/p/quanto-a-pessoa-juridica-paga-para-usar-o-pix
- Banco Central do Brasil FX overview: FX and remittances require the FX market and authorized institutions: https://www.bcb.gov.br/estabilidadefinanceira/oqueecambio
- Stellar fee documentation: classic transaction inclusion fee is based on operation count and effective base fee, with a minimum of 100 stroops per operation: https://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering
- Wise pricing: domestic non-wire receiving is listed as free, while receiving USD wire/SWIFT has a fixed fee in the current pricing table: https://wise.com/us/pricing/
