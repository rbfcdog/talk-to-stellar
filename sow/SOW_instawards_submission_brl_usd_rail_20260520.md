# Instawards Statement of Work (SOW)

30-Day Scoped Engagement

## 1. Project & Team Information

| Field | Answer |
|---|---|
| Project Name | TalkToStellar - Pix to Stellar USDC and USD Global Account Rail |
| Builder / Team Name | TalkToStellar |
| Primary Contact (Name + Email) (Responsible for KYC) | Rodrigo Camargo - rodrigobfcdog@gmail.com |
| Ambassador Chapter | Brazil |
| Ambassador Chapter Lead | Caio Mattos |
| Date Submitted | 20/05/2026 |
| Suggested Sprint Start Date | 20/05/2026 |

## 2. Instawards Overview & Intent

### 2.1 Instawards Purpose

Instawards are designed to support short, clearly scoped, execution-focused work that helps a project make tangible progress toward building on Stellar. Instawards should fund specific, achievable outcomes that can be completed and demonstrated within 30 days or less.

This SOW represents a focused 30-day work package for TalkToStellar. The project already has a Stellar testnet wallet assistant, WhatsApp/Evolution integration, Pix sandbox work, conversion flows, frontend ramp screens, and recent security hardening. This sprint will package those pieces into a clear, reviewable prototype for the core idea: Pix in Brazil -> Stellar USDC settlement -> simulated USD payout to a Wise-compatible or global bank account.

This is not the full startup roadmap. The sprint is limited to a testnet/sandbox prototype, documentation, and evidence that the Stellar-based rail is technically coherent.

## 3. Problem Statement & Objective

### Problem Being Addressed

- Brazilian users and companies can open global accounts, but moving BRL into usable USD is still expensive, fragmented, and hard to understand.
- The product is not trying to replace Wise or compete with global accounts. The gap is the rail before the account: convert BRL paid by Pix into USD that can be delivered to a global bank account.
- The technically important path is: user pays Pix -> backend records BRL intent -> value is represented and settled through Stellar USDC -> USD bank payout is created through an off-ramp provider adapter.
- Builders and reviewers need a short, verifiable implementation that shows how Pix sandbox events, Stellar testnet settlement, and USD bank payout instructions can fit together without using real funds or claiming production compliance.

### Objective of This Instaward

At the end of 30 days, TalkToStellar will deliver a demo-ready Phase 1 prototype that creates a BRL-to-USD quote, simulates a Pix-funded transfer, links the transfer to Stellar testnet USDC settlement evidence, and creates a simulated USD payout instruction for a Wise-compatible/global bank account.

The MVP will be documented and verifiable through a public repository, demo video, screenshots, backend call examples, logs, and Stellar testnet transaction hashes or explorer links.

## 4. Scope of Work (30-Day Deliverables)

### 4.1 In-Scope Deliverables (Only 3 Main Deliverables)

| Deliverable | Description (What will be built or produced?) | Why this matters |
|---|---|---|
| BRL to USD Quote and Recipient Prototype | A backend and frontend testing flow where a user enters a BRL amount and Wise-compatible/global USD bank details. The system returns a quote with FX rate, estimated USDC amount, estimated USD delivered, platform fee, off-ramp/bank fee placeholder, and quote expiry. | This validates the product thesis without overbuilding: TalkToStellar is the conversion and delivery rail, not a replacement for Wise or a card product. |
| Stellar USDC Settlement and Payout Simulation | A sandbox/testnet flow that connects a Pix payment simulation to a transfer state machine, records Stellar USDC settlement evidence, and creates a simulated USD bank payout instruction through a provider-adapter interface. | It demonstrates where Stellar fits in the architecture and makes the bridge from Pix to bank USD understandable and reviewable. |
| Evidence Package and Technical Walkthrough | A concise demo package including API calls, screenshots, demo script, backend logs, transfer statuses, testnet transaction evidence, setup notes, and known limitations. | It gives the Ambassador Chapter clear proof of execution without requiring them to infer the integration from a UI-only demo. |

### Out-of-Scope (Explicitly Not Included)

| Deliverable | Description (What is not included?) | Why this matters |
|---|---|---|
| Production Mainnet Launch | No live public remittance, no real customer funds, no production Pix-to-USD payout. | The sprint is focused on a sandbox/testnet MVP that can be reviewed safely within 30 days. |
| Licensing, Compliance Approval, or Regulated Financial Operations | No legal opinion, license application, KYC/AML operation, or regulated money transmission launch. | These require regulated partners and legal work beyond a 30-day software Instaward. |
| Wise Replacement or Consumer Bank Account Product | No attempt to build a Wise competitor, wallet account, debit card, or bank-like product. | The product is a rail that can deliver USD to a user's preferred global account. |
| Full Off-Ramp Provider Production Integration | No guarantee of live Circle, Bridge, Rail, bank, or ACH/wire provider approval. | The sprint will create the adapter and simulated/sandbox path so providers can be plugged in later. |
| Multi-Country Payout Expansion | No support for many countries, many payout currencies, or multiple local payment systems. | The MVP focuses on the Brazil Pix -> Stellar USDC -> USD bank account path. |

### 4.2 Deliverable-Aligned Budget Request

| Field | Answer |
|---|---|
| Requested Budget Amount | USD 5,000 |
| Rationale for Budget Request | The budget supports 30 days of focused development and packaging for the BRL-to-USD rail prototype: quote and recipient flow, Pix sandbox transfer state, Stellar USDC settlement evidence, USD payout simulation, documentation, and final demo preparation. The amount is tied directly to the three deliverables above and respects the Instawards cap. |

## 5. 30-Day Execution Plan & Timeline

### 5.1 Weekly Breakdown

| Week | Planned Work | Expected Output |
|---|---|---|
| Week 1 | Finalize the BRL-to-USD quote model, recipient bank-detail payload, frontend testing form, and backend quote endpoint. | A deployed test environment where a reviewer can request a BRL-to-USD quote and see estimated USD delivered with fee breakdown and expiry. |
| Week 2 | Connect the quote to a Pix sandbox transfer state and implement the provider-adapter interface for simulated USD payout creation. | A working sandbox transfer object with statuses such as quoted, Pix pending, Pix received, Stellar settlement pending, and payout instruction created. |
| Week 3 | Attach Stellar testnet settlement evidence to the transfer, including transaction hash, memo/reference, and balance/status logs. | A complete demo flow showing how the Pix-funded transfer maps to Stellar USDC settlement evidence and then to a simulated USD payout. |
| Week 4 | Run end-to-end testing, fix integration issues, prepare demo video script, screenshots, API examples, setup notes, and final evidence package. | A polished Phase 1 MVP with repository links, documentation, screenshots, backend call examples, and Stellar testnet evidence ready for review. |

## 6. Evidence of Completion (Required)

### 6.1 Planned Evidence to Be Submitted

| Deliverable | Evidence Type (link, repo, demo, screenshot, doc, tx hash, etc.) | Description |
|---|---|---|
| BRL to USD Quote and Recipient Prototype | Demo link, screenshots, GitHub repository, API request/response examples | The reviewer can see the quote form, bank-detail payload, fee breakdown, quote expiry, and estimated USD delivered. |
| Stellar USDC Settlement and Payout Simulation | Backend logs, transfer status records, Stellar testnet transaction hash or explorer link, provider-adapter code | The reviewer can verify that the sandbox Pix flow leads to Stellar settlement evidence and a simulated USD bank payout instruction. |
| Evidence Package and Technical Walkthrough | Demo video, walkthrough script, setup guide, screenshots, architecture notes | The reviewer can understand the full path from Pix to Stellar USDC to USD bank payout simulation without needing deep codebase knowledge. |

## 7. Next-Step Alignment

### 7.1 Anticipated Next Step After Completion

- [x] Apply to SCF Build Award
- [ ] Continue development independently
- [ ] Apply for a follow-on Instaward (if eligible)
- [ ] Seek other ecosystem support
- [ ] Other: __________________________

The likely next step is a larger SCF Build Award or equivalent funding path focused on regulated provider integration, production ledger/reconciliation, partner onboarding, and a controlled B2B pilot.

## 8. Instawards Constraints Acknowledgement

- [x] This scope will be completed within 30 days or less.
- [x] Instawards support execution, not open-ended exploration.
- [x] A project may receive no more than two follow-on Instawards.
- [x] Each Instaward is capped at USD 5,000.
- [x] Total Instawards funding may not exceed USD 15,000.

## 9. Submission Confirmation

Once finalized, this Statement of Work should be submitted by the Ambassador Chapter Lead through the appropriate Instawards submission process for review and approval.

Before submission, confirm the demo links, repository links, screenshots, and testnet transaction evidence that will be attached after completion.
