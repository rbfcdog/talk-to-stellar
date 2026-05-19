# What still needs to be done for BRL -> Stellar USDC -> USD payout

Status: implementation roadmap
Scope: turn the mock lab into a regulated production pilot

## Phase 0 - Decisions before coding real money movement

1. Confirm the legal model.
   - Decide whether TalkToStellar is only a technology layer, an agent of a regulated partner, or a future regulated participant.
   - Get written legal treatment for IOF, FX purpose codes, refunds, limits and record retention.

2. Choose the first regulated partner path.
   - PIX and BRL account provider.
   - FX/liquidity provider for BRL -> USDC or BRL -> USD -> USDC.
   - USD off-ramp provider.
   - ACH/wire payout provider.

3. Define the first user segment.
   - Recommended MVP: closed B2B, Brazilian company sending to its own Wise, Mercury or international USD account.
   - Avoid open P2P until KYC, AML, fraud, chargeback handling and sanctions controls are mature.

## Phase 1 - Backend mock to real API boundary

Create backend endpoints while still using mocked providers:

```text
POST /api/global-transfers/quotes
POST /api/global-transfers
POST /api/global-transfers/pix-anchor-orders
POST /api/global-transfers/pix-anchor-orders/:id/simulate-paid
POST /api/global-transfers/:id/external-payout
GET  /api/global-transfers/:id
POST /api/global-transfers/:id/simulate-event
POST /webhooks/pix-provider
POST /webhooks/offramp-provider
```

Minimum database tables:

```text
global_transfer_quotes
global_transfer_transfers
global_transfer_events
global_transfer_provider_refs
global_transfer_fee_lines
pix_anchor_orders
external_payout_instructions
recipient_bank_accounts
compliance_reviews
```

Required backend guarantees:

- idempotency keys on every write;
- immutable event log;
- deterministic fee and FX snapshots;
- quote expiry;
- no transfer creation after quote expiry;
- no bank details stored without encryption or tokenization;
- no status transition without a valid previous state;
- no PIX order creation unless KYC/KYB state is valid for the selected pilot segment;
- no external payout submission until PIX is settled, USDC is allocated and screening passes.

## Phase 2 - Ledger and reconciliation

Implement a proper ledger before connecting real providers.

Minimum ledger accounts:

```text
customer_brl_pending
customer_brl_settled
platform_fee_revenue
liquidity_payable
stellar_usdc_treasury
offramp_usdc_receivable
offramp_usd_balance
bank_payout_pending
refund_payable
```

Daily reconciliation must compare:

- PIX partner settlement report;
- internal ledger;
- Stellar transaction hashes;
- off-ramp provider balances;
- bank payout report;
- failed and returned payments.

## Phase 3 - Partner sandboxes

Connect one provider at a time:

1. PIX sandbox.
   - Create PIX charge.
   - Receive webhook.
   - Validate signature.
   - Mark BRL as settled only after confirmed settlement.

2. Off-ramp sandbox.
   - Create recipient.
   - Create quote or payout intent.
   - Confirm supported rail and required compliance data.
   - Handle rejection, return and pending review statuses.

3. Stellar testnet.
   - Use testnet until production approval is complete.
   - Track transaction hash, memo and destination.
   - Do not reuse production custody keys in test environments.

## Phase 4 - Compliance controls

Before external users:

- KYC/KYB for payer and recipient when required;
- sanctions screening;
- transaction monitoring;
- velocity limits;
- manual review queue;
- source-of-funds capture for large transactions;
- refund workflow;
- audit export;
- support tooling for failed payouts.

## Phase 5 - Production pilot

Pilot constraints:

- approved companies only;
- approved recipients only;
- same-beneficial-owner transfers first;
- low daily and monthly limits;
- manual approval above threshold;
- prefunded liquidity only;
- no open consumer remittance.

Success criteria:

- transfer completes end-to-end with deterministic reconciliation;
- total operational cost remains inside the target range;
- failure handling is auditable;
- support team can explain every status and provider reference;
- compliance partner accepts the transaction narrative.
