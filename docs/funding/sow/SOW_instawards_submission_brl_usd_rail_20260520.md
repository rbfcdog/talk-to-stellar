# Instawards Statement of Work (SOW)

30-Day Scoped Engagement

## 1. Project & Team Information

| Field | Answer |
|---|---|
| Project Name | TalkToStellar - PIX-to-USD Transfer Routing on Stellar |
| Builder / Team Name | TalkToStellar |
| Primary Contact (Name + Email) (Responsible for KYC) | Rodrigo Banin Ferraz de Camargo - rodrigobfcdog@gmail.com |
| Ambassador Chapter | Brazil |
| Ambassador Chapter Lead | Caio Mattos |
| Date Submitted | 20/05/2026 |
| Suggested Sprint Start Date | 01/06/2026 |

## 2. Instawards Overview & Intent

### 2.1 Instawards Purpose

Instawards are designed to support short, clearly scoped, execution-focused work that helps a project make tangible progress toward building on Stellar. Instawards should fund specific, achievable outcomes that can be completed and demonstrated within 30 days or less.

This SOW represents a shared commitment between the Builder and the Ambassador Chapter Lead on what will be delivered, why it matters, and how success will be verified.

This represents a focused 30-day infrastructure sprint for TalkToStellar.

TalkToStellar already has:

- Conversational WhatsApp/Telegram settlement interfaces.
- Stellar wallet orchestration.
- Pix integration on Etherfuse.
- Stellar pathfinding and conversion logic.
- BRL-to-USDC settlement flows.
- Quote generation.
- On/off-ramp abstractions.

The next milestone is building the settlement infrastructure layer that enables programmable institution-to-institution transfers using Stellar as the settlement rail.

This sprint focuses on this user flow:

1. User sends BRL through its bank of preference via Pix.
2. TalkToStellar receives BRL.
3. Value moves through Stellar as USDC.
4. USDC is redeemed or exchanged into bank USD.
5. USD is deposited into a Wise-compatible USD account or another international bank account.

The project does not attempt to replace global banking providers.

Instead, it aims to execute a strategic wedge strategy: operating as a high-efficiency conversion rail before those accounts. This enables BRL-to-USD settlement into existing international accounts such as Wise, Revolut, or other USD banking destinations at a fraction of traditional costs. By capturing users through savings on their existing accounts, TalkToStellar can establish trust and volume, creating a later funnel for native financial services inside its own ecosystem.

This sprint is intentionally limited to:

- Creating BRL-to-USD transfer intents.
- Recording Pix funding events.
- Generating transfer quotes.
- Executing or simulating Stellar USDC settlement.
- Attaching Stellar transaction evidence to transfer records.
- Generating payout instructions through adapter interfaces.
- Tracking transfer lifecycle states.
- Exposing orchestration logs and reconciliation metadata for review.

## 3. Problem Statement & Objective

### Problem Being Addressed

Brazil already has fast domestic payments through Pix, but cross-border BRL-to-USD settlement is still expensive, fragmented, and operationally inefficient.

Users and companies can already open international USD accounts through providers such as Wise or other global banking platforms. However, converting BRL into usable USD and delivering those funds internationally still depends on high FX spreads, correspondent banking networks, and expensive operational infrastructure.

Most existing crypto applications focus on retail onboarding, wallets, trading, or speculative use cases. The real infrastructure gap exists between financial institutions and banking endpoints: BRL source institution -> FX conversion -> settlement rail -> USD payout institution. Traditional global accounts can also flag or reject inward transfers coming from third-party corporate crypto pools rather than from the user's own identity, so identity continuity and same-name alignment must be tracked by the routing layer.

TalkToStellar already solved much of the consumer interaction layer: WhatsApp/Telegram interfaces, Stellar wallet orchestration, Pix handling, pathfinding, quote generation, and BRL-to-USDC settlement logic. The next technical milestone is creating programmable settlement infrastructure capable of orchestrating transfers between existing compliant financial accounts while preserving identity tracking across the rail.

### Objective of This Instaward

At the end of 30 days, TalkToStellar will have delivered a demo-ready institutional settlement product that creates BRL-to-USD quotes, accepts simulated Pix-funded transfer intents, records Stellar USDC settlement evidence, orchestrates transfer lifecycle states, creates USD payout instructions through provider-adapter interfaces, and simulates delivery to international bank accounts.

This sprint is not intended to bypass regulation, licensing, compliance, or taxes. Instead, the infrastructure aims to reduce unnecessary banking intermediaries, correspondent settlement complexity, hidden FX spreads, and settlement inefficiencies.

## 4. Scope of Work (30-Day Deliverables)

### 4.1 In-Scope Deliverables (Only 3 Main Deliverables)

| Deliverable | Description (What will be built or produced?) | Why this matters |
|---|---|---|
| PIX-to-Stellar Transfer Lifecycle Engine | Expansion of the existing TalkToStellar infrastructure into an orchestration engine capable of coordinating PIX intake, BRL-to-USDC conversion flows, Stellar settlement tracking, payout routing, reconciliation metadata, and transfer lifecycle management between financial endpoints. Includes integration of existing conversational settlement infrastructure with programmable payout coordination systems. | This extends the existing conversational wallet infrastructure into a programmable transfer-routing layer capable of coordinating and monitoring BRL-to-USDC transfer flows with clear operational visibility and settlement traceability. |
| USD Delivery & Payout Coordination Layer | TalkToStellar will build a provider-agnostic payout adapter interface that converts completed Stellar USDC settlement events into payout instructions compatible with USD account destinations and payout-provider workflows. The payout adapter layer will support payout destination metadata, same-name account alignment checks, payout reference IDs, payout status tracking, settlement evidence attachment, and mocked or sandbox payout-provider responses for demonstration and compatibility validation purposes. Where sandbox or developer access is available, the sprint may validate compatibility with APIs and payout flows associated with providers such as Circle, Bridge, or Wise-compatible payout systems. | The purpose is not to launch production banking operations, but to demonstrate that Stellar-based settlement can coordinate efficiently with future compliant payout providers while minimizing routing overhead, settlement friction, and user-facing transfer fees. |
| End-to-End Transfer Routing Demonstration | TalkToStellar will prepare a reviewer-ready demonstration environment showing the complete transfer-routing flow from PIX-funded transfer intake through quote generation, Stellar settlement execution or simulation, payout instruction generation, settlement evidence attachment, lifecycle tracking, and orchestration logging. The final demonstration package will include architecture diagrams, API walkthroughs, screenshots, transaction hashes where available, transfer records, technical documentation, setup instructions, and a demo video showing the complete operational flow. | This provides verifiable evidence that the transfer-routing architecture is technically coherent, integration-ready, operationally reviewable, and capable of supporting lower-cost BRL-to-USD settlement coordination using Stellar as the settlement rail. |

### Out-of-Scope (Explicitly Not Included)

| Deliverable | Description (What will not be built or produced?) | Why this matters |
|---|---|---|
| Production Remittance Operations | This sprint will not launch a public remittance platform, operate production-scale customer fund flows, or function as a regulated banking or money transmission service. Selective low-value Stellar mainnet validation transactions may be executed only to verify settlement behavior, transaction evidence attachment, and lifecycle coordination inside the orchestration layer. | The sprint validates the settlement architecture and orchestration layer without introducing the operational, regulatory, or banking complexity of a full production launch within a 30-day scope. |
| Regulated Financial Operations & Licensing | This sprint does not include production money transmission licensing, regulated FX operations, or production-scale compliance infrastructure. The focus is infrastructure orchestration and settlement coordination designed to support future compliant integrations with regulated partners. | These require separate legal, operational, and banking infrastructure outside the scope of this 30-day sprint. |
| Consumer Wallet Expansion & Retail UX Expansion | No additional retail onboarding systems, wallet UX expansion, or consumer-facing conversational flows will be developed during this sprint. Existing TalkToStellar conversational infrastructure will instead be extended into institutional settlement and payout coordination systems. | TalkToStellar already has a working conversational settlement platform; the focus is now institutional settlement infrastructure. |
| Full Production Off-Ramp Integration | The sprint will not depend on production integrations with Wise, ACH systems, wire infrastructure, or regulated banking partners. Instead, it will focus on provider-agnostic payout adapter interfaces capable of generating payout instructions, attaching settlement evidence, tracking payout states, and validating compatibility with sandbox or developer-access APIs where available. | This allows the architecture to be validated and integration-ready while avoiding dependencies on external banking approval cycles during the Instaward period. |
| Multi-Currency & Multi-Corridor Expansion | The MVP will focus specifically on the Brazil PIX -> Stellar USDC -> USD payout-routing corridor rather than supporting multiple payout currencies, geographic corridors, or treasury settlement paths. | Narrowing the initial corridor allows the sprint to validate institutional settlement orchestration, payout coordination, and BRL-to-USD infrastructure flows before expanding into broader multi-currency settlement operations. |

### 4.2 Deliverable-Aligned Budget Request

| Field | Answer |
|---|---|
| Requested Budget Amount | USD 5,000 |
| Rationale for Budget Request | The budget supports 30 days of focused development for the institutional settlement prototype: transfer orchestration infrastructure, payout-adapter systems, Stellar settlement evidence integration, payout simulation flows, reconciliation infrastructure, documentation, and final demo preparation. The amount is directly tied to the three scoped deliverables above and respects the Instawards cap. |

## 5. 30-Day Execution Plan & Timeline

### 5.1 Weekly Breakdown

| Week | Planned Work | Expected Output |
|---|---|---|
| Week 1 | Expand the existing TalkToStellar infrastructure into an institutional transfer orchestration layer. Implement transfer lifecycle states, quote orchestration, reconciliation metadata structures, settlement references, and backend coordination flows integrated with existing PIX and Stellar infrastructure. | A functioning orchestration environment capable of coordinating BRL transfer intents, PIX settlement events, quote generation, Stellar settlement references, and institution-style transfer lifecycle tracking. |
| Week 2 | Implement payout-provider abstraction infrastructure and integrate sandbox-compatible payout coordination flows for international USD account destinations. Add payout routing objects, transfer references, payout status tracking, and reconciliation handling compatible with ACH/wire-style payout systems. Validate compatibility with at least one real-world stablecoin settlement or payout provider API such as Circle or Bridge where sandbox/API access is available. | A provider-agnostic payout coordination layer capable of linking Stellar settlement flows with simulated international USD payout instructions and payout lifecycle monitoring. |
| Week 3 | Connect the complete end-to-end transfer-routing flow and validate operational coordination between PIX funding events, Stellar settlement flows, payout instruction generation, and transfer lifecycle tracking. The system will attach settlement evidence, payout references, timestamps, reconciliation metadata, and orchestration logs directly to transfer records while refining observability and operational traceability. Selective low-value Stellar mainnet validation transactions may be executed to verify settlement behavior and transaction evidence coordination within the routing layer. | A complete institutional settlement flow where a PIX-funded transfer generates Stellar settlement evidence and coordinates a simulated USD payout flow tied to an international account destination. |
| Week 4 | Run end-to-end orchestration testing, improve transfer visibility and operational logs, refine reconciliation flows, finalize architecture documentation, prepare API walkthroughs, screenshots, demo environments, and reviewer evidence packages. | A polished institutional settlement prototype demonstrating PIX intake, Stellar settlement coordination, payout orchestration flows, transfer lifecycle monitoring, and integration-ready infrastructure documentation for technical review. |

## 6. Evidence of Completion (Required)

### 6.1 Planned Evidence to Be Submitted

| Deliverable | Evidence Type (link, repo, demo, screenshot, doc, tx hash, etc.) | Description |
|---|---|---|
| Cross-Border Settlement Orchestration Engine | GitHub repository, orchestration logs, transfer lifecycle records, API request/response examples, reconciliation metadata samples, operational dashboard screenshots | Reviewers can verify the orchestration architecture, transfer lifecycle logic, quote flow, and payout object handling. |
| Stellar USDC Settlement + Payout Adapter Infrastructure | Stellar mainnet/testnet transaction hashes, payout adapter source code, settlement logs, provider integration examples, payout orchestration records, Etherfuse and Circle integration evidence, transfer reference mapping samples | Reviewers can verify that PIX-funded transfers map to Stellar settlement evidence and simulated USD payout instructions. |
| Institutional Settlement Flow Demonstration + Technical Walkthrough | Demo video, screenshots, architecture diagrams, technical walkthrough, setup documentation | Reviewers can understand the full settlement flow from PIX to Stellar settlement to international USD payout orchestration. |

## 7. Next-Step Alignment

### 7.1 Anticipated Next Step After Completion

- [x] Apply to SCF Build Award
- [ ] Continue development independently
- [ ] Apply for a follow-on Instaward (if eligible)
- [ ] Seek other ecosystem support
- [ ] Other: __________________________

The likely next step after this sprint is a larger infrastructure-focused funding path centered on:

- Phase 1 - Compliance: regulated provider integrations, production payout orchestration, treasury infrastructure, ACH/wire integrations, institutional pilots, and compliant settlement operations.
- Phase 2 - Retention: introducing a Stellar USDC yield vault using Soroban smart contracts, allowing users to park and yield funds natively on-chain before executing bank payouts.
- Phase 3 - Expansion: transitioning from an intermediary rail into native account controls inside TalkToStellar, converting utility users into full-stack platform clients.

## 8. Instawards Constraints Acknowledgement

- [x] This scope will be completed within 30 days or less.
- [x] Instawards support execution, not open-ended exploration.
- [x] A project may receive no more than two follow-on Instawards.
- [x] Each Instaward is capped at USD 5,000.
- [x] Total Instawards funding may not exceed USD 15,000.

## 9. Submission Confirmation

Once finalized, this Statement of Work should be submitted by the Ambassador Chapter Lead through the appropriate Instawards submission process for review and approval.
