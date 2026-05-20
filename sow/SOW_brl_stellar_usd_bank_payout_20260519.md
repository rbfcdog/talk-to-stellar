# Statement of Work - BRL to USD Global Bank Payout Rail

## 1. Project & Team Information

**Project Name:** TalkToStellar  
**Builder / Team Name:** TalkToStellar  
**Primary Contact:** Rodrigo Camargo, rodrigobfcdog@gmail.com  
**Ambassador Chapter:** Brazil  
**Ambassador Chapter Lead:** Caio Mattos  
**Date Submitted:** 2026-05-19  
**Suggested Sprint Start Date:** 2026-05-20  
**Sprint Length:** 30 days

## 2. Program Context

This SOW uses the Instawards template style because it is practical and evaluator-friendly, but the budget request is for a larger product sprint: USD 12,000. If this must be submitted strictly as an Instaward, the scope should be split because Instawards are capped at USD 5,000.

The current TalkToStellar project already has Stellar testnet wallet flows, WhatsApp/Evolution integration, Pix sandbox work, conversion flows, frontend ramp screens, and security hardening. The next insight is not to compete with Wise or card products. The opportunity is to become the rail before the global account:

```text
Brazilian payer pays Pix
-> TalkToStellar receives BRL
-> value moves through Stellar as USDC
-> USDC is redeemed or exchanged into bank USD
-> USD is deposited into a Wise-compatible USD account or another international bank account
```

The product promise is: "Convert with us and send USD to your preferred global bank account."

## 3. Problem Statement & Objective

### Problem Being Addressed

Brazilian users and companies can already open global accounts, but moving BRL into usable USD is still expensive and operationally painful. Banks and traditional remittance providers often charge hidden spread, intermediary fees, and slow settlement. The expensive part is usually not the final global account itself, but the BRL-to-USD conversion and delivery path.

TalkToStellar can fit between Pix and the recipient's global bank details. Instead of asking users to understand crypto, the system can accept Pix, settle through Stellar USDC, and deliver bank USD through a regulated off-ramp provider.

### Objective of This Sprint

At the end of 30 days, TalkToStellar will deliver a production-shaped prototype for BRL -> Stellar USDC -> USD bank payout, including quote engine, transfer state machine, ledger events, Wise-compatible recipient details, off-ramp provider adapter layer, sandbox/demo flow, and clear cost comparison targeting less than 1.5% operational cost before taxes and fixed rail fees.

This sprint does not make TalkToStellar a regulated remittance provider by itself. The goal is to build the technical rail and partner-ready integration layer, with compliance and provider approval clearly separated from the software implementation.

## 4. Current Project State

Already built or substantially available:

- WhatsApp/Evolution message ingestion connected to the backend agent.
- Stellar wallet creation, payment, balance, conversion, and transaction infrastructure.
- Pix/Etherfuse sandbox ramp screens and backend endpoints.
- Frontend flows for onboarding, login, payment confirmation, Pix ramp, wallet profile, and global transfer testing.
- Supabase/Postgres persistence for sessions, wallets, operations, external accounts, passkeys, idempotency, and financial events.
- Mainnet preparation scripts and documentation.
- Security hardening: HttpOnly session cookies, passkey enrollment authorization, versioned PIN hashing, Redis-backed rate limits, and RLS hardening SQL.

The new work is focused on the missing "USDC -> bank USD -> global account" leg and on making the full money movement model coherent.

## 5. Scope of Work

### 5.1 In-Scope Deliverables

| Deliverable | Description | Why this matters |
|---|---|---|
| BRL to USD Quote Engine | Build a quote flow that takes BRL amount, payout country, payout rail, and recipient type, then returns FX rate, USDC amount, off-ramp fee, bank fee, platform fee, estimated USD net, expiry, and target cost percentage. | Users need to know exactly how much USD will arrive before paying Pix. This is where TalkToStellar can show the savings versus bank spread. |
| USD Bank Payout Adapter Layer | Create a provider abstraction for off-ramp partners such as Circle-style redeem, Bridge-style stablecoin orchestration, Rail-style USDC/USD accounts, or a future licensed partner. Initial version can use mocks or sandbox APIs behind the same interface. | The key technical unknown is turning Stellar USDC into bank USD. A clean adapter lets the project test providers without rewriting the product. |
| Wise-Compatible Recipient Model | Implement recipient bank detail capture for USD account/routing details, account holder name, account type, bank name, country, and compliance metadata. | The product is not a Wise competitor. It needs to deliver USD into Wise-compatible or global bank details. |
| Transfer State Machine and Ledger Events | Implement the state model for Pix received, quote locked, USDC allocated, Stellar sent, off-ramp received, USD redeemed, bank payout sent, completed, failed, or refunded. | A real money product needs auditability, retries, and reconciliation. This turns the product from a demo into an operations-ready rail. |
| Stellar USDC Settlement Proof | Connect the transfer lifecycle to Stellar USDC movement, with transaction hash, memo/reference, source wallet, destination/off-ramp address, and explorer evidence. | Stellar is the settlement layer. The reviewer must see where it fits and how it reduces settlement complexity. |
| Cost and Business Case Dashboard | Add a simple internal/testing UI showing spread saved, estimated traditional cost, TalkToStellar cost, provider fees, and final USD delivered. | The thesis only works if the cost can plausibly stay under about 1.5% plus required taxes and fixed rails. |
| Partner and Compliance Readiness Document | Produce a short document listing required partner approvals, KYC/KYB checks, sanctions screening, IOF/FX treatment, refund handling, and production blockers. | This keeps the sprint realistic and avoids pretending that regulated live remittance is solved only by code. |

### 5.2 Out of Scope

- Becoming a licensed FX/remittance institution during this 30-day sprint.
- Live production Pix-to-USD remittance for the public.
- Open P2P launch without compliance provider approval.
- Guaranteeing final provider pricing before commercial approval.
- Building a card product or debit flow.
- Competing with Wise's wallet/account UX.
- Limit orders, exchange charts, or consumer trading features.
- Making mainnet integration itself the main deliverable. Mainnet readiness may exist, but the novel sprint deliverable is the USD bank payout rail.

## 6. Budget Request

**Requested Budget Amount:** USD 12,000

**Rationale:** The budget funds a focused build sprint around the novel part of the business: Pix/BRL value entering Stellar, converting to USDC, and reaching bank USD through an off-ramp abstraction. The project already has wallet, agent, Pix sandbox, frontend, and Stellar infrastructure, so this budget is not for starting from zero. It covers the quote engine, payout adapter layer, recipient model, ledger/state machine, demo UI, provider-readiness documentation, and end-to-end evidence package.

Budget allocation:

| Area | Allocation |
|---|---:|
| Quote engine and fee model | USD 2,000 |
| Off-ramp/payout adapter layer | USD 3,000 |
| Transfer state machine and ledger events | USD 2,500 |
| Wise-compatible recipient and testing UI | USD 1,500 |
| Stellar settlement evidence and reconciliation docs | USD 1,500 |
| Compliance/partner readiness and demo package | USD 1,500 |

## 7. 30-Day Execution Plan

| Week | Planned Work | Expected Output |
|---|---|---|
| Week 1 | Define the BRL -> USDC -> USD -> bank transfer model, implement quote API, fee breakdown, quote expiry, and recipient bank detail schema. | Working quote endpoint and frontend testing panel showing BRL input, estimated USD delivered, fees, and expiry. |
| Week 2 | Build the off-ramp provider adapter interface and first mock/sandbox connector. Implement payout instruction creation and provider reference tracking. | Backend can create a simulated or sandbox USD payout intent from a transfer and store provider IDs/status. |
| Week 3 | Connect Pix sandbox payment confirmation, Stellar USDC settlement evidence, transfer state transitions, and immutable event logs. | End-to-end sandbox path with states from Pix received to Stellar sent to USD payout submitted. |
| Week 4 | Add cost comparison UI, reconciliation export, partner/compliance readiness document, demo script, and evidence package. | Reviewer can understand the business case, inspect backend calls, and see where production partners plug in. |

## 8. Evidence of Completion

| Deliverable | Evidence Type | Description |
|---|---|---|
| Quote Engine | API examples, frontend screenshot, code link | Shows BRL input, USD estimate, fee breakdown, quote ID, and expiry. |
| Payout Adapter | Code, mock/sandbox logs, provider reference examples | Shows the interface for turning USDC/USD balance into a bank payout instruction. |
| Recipient Model | UI screenshot, API payload, database schema | Shows Wise-compatible USD account/routing detail support and metadata capture. |
| Transfer State Machine | Backend logs, database event rows, status screenshot | Shows each transfer status and why the state changed. |
| Stellar Settlement | Testnet transaction hash or explorer link | Shows USDC movement on Stellar tied to the transfer reference. |
| Cost Case | Dashboard screenshot, sample transfer report | Shows whether total estimated cost is below the target envelope. |
| Readiness Document | Markdown document | Lists what is solved by software and what requires regulated partners. |

## 9. Success Criteria

This sprint is successful if:

- a user can create a BRL-to-USD quote and see estimated USD delivered;
- the system can model a Pix-funded transfer into Stellar USDC and a USD bank payout intent;
- the USD payout leg is abstracted cleanly enough to swap between providers;
- recipient details can represent Wise-compatible USD accounts and other global bank accounts;
- the transfer has auditable statuses, provider references, and Stellar transaction evidence;
- the demo clearly explains that TalkToStellar is the conversion and delivery rail, not a Wise replacement;
- the projected cost model shows a credible path toward less than 1.5% before taxes and fixed rail fees.

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Off-ramp provider does not approve the use case quickly | Build against an adapter with mock/sandbox mode first; document provider requirements. |
| Regulatory treatment is more complex than expected | Keep live public remittance out of scope and require partner/legal approval before production. |
| Cost target is not reachable with first provider | Make provider fees explicit and compare multiple adapter candidates. |
| Bank payout returns or rejects | Include failed, returned, review, and corrected-details statuses in the state machine. |
| Users misunderstand the Wise relationship | Position product as "send USD to your global account", not "replace Wise". |

## 11. Next-Step Alignment

After this sprint, the next step is:

- [x] Apply to SCF Build Award or equivalent larger ecosystem funding
- [x] Start partner conversations for Pix, FX/liquidity, and USD off-ramp
- [ ] Launch open P2P product
- [ ] Replace Wise or global banks

The follow-on build should focus on regulated partner integration, production ledger/reconciliation, sanctions/KYC/KYB provider integration, controlled B2B pilot, and mainnet operational controls.

## 12. Submission Confirmation

This SOW should be submitted as a larger product-build proposal. If it must be submitted through an Instawards-only path, reduce it to a USD 5,000 phase focused only on quote engine, adapter design, and sandbox evidence.
