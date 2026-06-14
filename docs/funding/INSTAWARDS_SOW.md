# Instawards Statement of Work (SOW)
## TalkToStellar: Stellar-Powered Conversational Payment Assistant

---

## 1. Project & Team Information

| Field | Value |
|-------|-------|
| **Project Name** | TalkToStellar |
| **Builder / Team Name** | TalkToStellar Team |
| **Primary Contact (Name + Email)** | Rodrigo Camargo |
| **Ambassador Chapter** | Brazil |
| **Ambassador Chapter Lead** | Caio Mattos |
| **Date Submitted** | 2026/03/31 |
| **Suggested Sprint Start Date** | 2026/04/07 |

---

## 2. Instawards Overview & Intent

### 2.1 Instawards Purpose (for Builder Context)

Instawards are designed to support short, clearly scoped, execution-focused work that helps a project make tangible progress toward building on Stellar. Instawards are meant to fund specific, achievable outcomes that can be completed and demonstrated within 30 days or less.

This SOW represents a shared commitment between the Builder and the Ambassador Chapter Lead on what will be delivered, why it matters, and how success will be verified.

---

## 3. Problem Statement & Objective

### 3.1 Problem Being Addressed

**Current State of Cryptocurrency Adoption for Everyday Users:**

Cryptocurrency adoption remains hamstrung by friction and complexity. Today, purchasing, converting, and sending cryptocurrency requires:

1. **Complex Interfaces**: Users must navigate exchanges filled with trading charts, order books, and technical jargon designed for professional traders, not everyday people wanting to send money.

2. **Slow Onboarding & Delays**: Manual KYC processes, document verification, and banking delays mean 3-7 days before first transactions are possible—too long for users with immediate payment needs.

3. **Hidden Fees & Unpredictability**: Users face spreads (~5% from traditional banks, ~1.2% from DeFi bridges), exchange slippage, and surprise withdrawal fees, with no way to know the final amount received until the transaction completes.

4. **Ecosystem Fragmentation**: No seamless bridge exists between traditional fiat payment methods (Pix in Brazil) and blockchain settlement. Users must choose between slow banks or complex crypto exchanges.

**Why This Matters for Stellar:**

Stellar's mission is to enable low-cost, fast, and inclusive financial services globally. However, this mission remains unrealized for Web2 users because the on/off-ramp from fiat to stablecoins is fragmented, expensive, and complex. TalkToStellar addresses this gap by making Stellar-based transactions as simple as messaging.

### 3.2 Objective of This Instaward

**In 30 days, TalkToStellar will deliver a production-ready WhatsApp-based conversational payment settlement system running on Stellar Testnet that enables users to convert fiat (Pix) to stablecoins, or between any Stellar-based assets, using natural language LLM commands. The system will include automated pathfinding for optimal exchange rates and gasless transaction settlement for seamless Web2-to-Web3 onboarding.**

---

## 4. Scope of Work (30-Day Deliverables)

### 4.1 In-Scope Deliverables

| Deliverable | Description | Why This Matters |
|---|---|---|
| **Deliverable 1: Stellar Multi-Path Conversion Engine** | Implementation of a pathfinding algorithm that scans Stellar's AMM liquidity pools and partner exchange offers in real-time to calculate the optimal conversion route from BRL → XLM → USDC (or alternative paths). Includes route caching, slippage protection, and price quote generation. | Users get the lowest possible conversion rates automatically. This removes the guesswork and pricing friction that makes existing exchanges painful. A 0.05% fee on a $100 transfer saves users compared to 1.2%+ alternatives. |
| **Deliverable 2: WhatsApp LLM Agent Integration** | Integration of the TalkToStellar LLM-powered agent with Stellar conversion and payment logic. The agent parses natural language requests in plain Portuguese/English ("Send me 50 USDC for 150 BRL via Pix", "Convert 100 XLM to USDC", "How much USDC can I get for 500 BRL?"), validates user wallets, initiates Pix payments, and triggers on-chain settlement when payment is confirmed. The LLM understands flexible, conversational user intent without requiring specific command syntax. | This removes the learning curve entirely. Users interact through WhatsApp—the most-used messaging app in Brazil—using natural language. No apps to download, no technical knowledge required, no crypto jargon. Lowering friction to near-zero. |
| **Deliverable 3: Gasless FeeBump Settlement Module** | Implementation of Stellar FeeBump sponsored transactions that allow creators/recipients to receive USDC payouts without requiring XLM for transaction fees. Automated fee abstraction so end-users never see "insufficient XLM balance" errors. | Web2 users shouldn't be confused by gas tokens. FeeBump sponsorship abstracts away blockchain complexity and enables true Web2 UX for crypto transactions. |
| **Deliverable 4: WhatsApp Testnet Demo & Documentation** | Complete end-to-end demonstration running on Stellar Testnet with WhatsApp as the primary interface, including: (a) LLM agent accepting flexible natural language payment requests via WhatsApp, (b) Multi-path conversion quote calculation for any Stellar asset pair, (c) Simulated Pix payment confirmation, (d) On-chain settlement with FeeBump gasless execution, (e) Technical architecture documentation with setup instructions for third-party builders to replicate for other currencies and payment methods. | Allows reviewers, ecosystem partners, and future builders to validate the full WhatsApp→LLM→Stellar payment flow. Clear documentation enables ecosystem builders to fork and adapt TalkToStellar for other countries, currencies, and payment methods via their preferred messaging apps. |

### 4.2 Out-of-Scope (Explicitly Not Included)

- Full marketplace or creator campaign features (Bounties-style functionality)
- Production KYC/AML compliance (Testnet demo uses simulated user validation)
- Multi-currency fiat on/off-ramps beyond Pix (e.g., bank transfers, credit cards)
- Token creation or custom asset issuance
- Mobile app development (messaging integration only)
- 24/7 production monitoring or incident response procedures

---

## 4.3 Deliverable-Aligned Budget Request

| Item | Requested Budget | Rationale |
|---|---|---|
| **30-Day Engineering Sprint** | USD 10,000 | This funding supports focused development to implement Stellar-based conversion pathfinding, agent integration, and gasless transaction settlement on Testnet. Budget allocation: (40%) Pathfinding algorithm & Stellar integration, (30%) Agent natural language processing & payment flow, (20%) FeeBump sponsored transaction implementation, (10%) Documentation and demo. |

---

## 5. 30-Day Execution Plan & Timeline

### 5.1 Weekly Breakdown

| Week | Planned Work | Expected Output |
|---|---|---|
| **Week 1** | Stella SDK integration and multi-path conversion algorithm development. Set up Stellar Testnet environment, implement liquidity pool scanning, and build route calculation engine with slippage protection. | Working pathfinding engine returning optimal conversion paths for BRL→XLM→USDC on Stellar Testnet. |
| **Week 2** | WhatsApp LLM agent integration and payment validation logic. Integrate LLM (GPT-4/Claude) with conversion engine, implement WhatsApp API connectivity, Pix payment initiation, and build user wallet validation flow. LLM-powered intent parsing enables flexible, conversational requests. | LLM agent accepting flexible natural language payment requests via WhatsApp and generating accurate conversion quotes validated against on-chain Stellar liquidity. |
| **Week 3** | FeeBump sponsored transaction implementation and gasless settlement. Integrate Stellar FeeBump transactions, implement fee sponsorship automation, and validate end-to-end gasless payout flow. | Successful FeeBump-sponsored USDC transfer to recipient wallet without requiring XLM balance. Testnet transaction hashes demonstrating gasless settlement. |
| **Week 4** | Documentation, demo video recording, API hardening, and submission preparation. Create technical architecture diagrams, settlement flow documentation, setup guides, and record demo showing full end-to-end payment flow. | Demo video, technical documentation, architecture diagrams, and GitHub repository ready for external review and future ecosystem builders. |

---

## 6. Evidence of Completion (Required)

### 6.1 Planned Evidence to Be Submitted

| Deliverable | Evidence Type | Description |
|---|---|---|
| **Deliverable 1** | GitHub commits, code repository, Testnet transaction hashes | Source code for pathfinding algorithm with unit tests. Testnet transaction hashes demonstrating multi-path conversion execution. Screenshots of route calculation engine functioning with real Stellar liquidity data. |
| **Deliverable 2** | GitHub commits, WhatsApp chat logs, LLM prompt engineering docs, demo screenshots | Source code for LLM-powered agent with prompt engineering. Screenshots or logs showing real WhatsApp conversations where users send natural language requests ("Enviar 50 USDC", "Converter XLM para USDC", etc.) and agent responds with quotes. Demo output showing LLM understanding flexible user intent and WhatsApp-to-Stellar integration working end-to-end. |
| **Deliverable 3** | FeeBump transaction hashes, transaction logs, screenshots | Testnet transaction hashes proving FeeBump-sponsored transactions executed without recipient needing XLM. Screenshots of USDC received in recipient wallet. Logs showing fee sponsorship mechanics working correctly. |
| **Deliverable 4** | Technical documentation, architecture diagrams, demo video, setup guide | Markdown technical documentation explaining Stellar integration, multi-path algorithm, agent architecture, and FeeBump flow. Architecture diagrams (Mermaid or similar). Demo video (5-10 min) showing: user sends "Send 50 USDC for 150 BRL" → agent calculates path → Pix payment simulated → USDC received in wallet. GitHub README with setup instructions for third-party builders. |

### 6.2 Evidence Verification Checklist (For Ambassador Use)

| Deliverable | Evidence Present | Evidence Partial | Evidence Missing | Comments |
|---|---|---|---|---|
| **Deliverable 1: Pathfinding Engine** | ☐ | ☐ | ☐ | Source code is readable and testable. Testnet transactions demonstrate multi-path routing working. Route calculation logic is optimized for lowest fees. |
| **Deliverable 2: WhatsApp LLM Integration** | ☐ | ☐ | ☐ | LLM-powered agent successfully parses flexible natural language requests via WhatsApp (e.g., "Quero mandar 50 USDC", "Converte 100 XLM em USDC"). Agent successfully connects to Stellar conversion engine. WhatsApp API integration tested end-to-end on Testnet. |
| **Deliverable 3: Gasless Settlement** | ☐ | ☐ | ☐ | FeeBump transactions are valid and execute on Testnet. Recipients receive funds without needing XLM. Fee sponsorship flow is automated and reliable. |
| **Deliverable 4: Demo & Documentation** | ☐ | ☐ | ☐ | Documentation is clear and sufficient for third-party builders to understand the architecture. Demo video clearly shows full payment flow end-to-end. GitHub setup instructions are tested and reproducible. |

---

## 7. Next-Step Alignment

### 7.1 Anticipated Next Step After Completion

After this Instaward is completed, the most likely next steps are:

- **☑ Apply to SCF Build Award** – Leverage the Testnet demo and documentation to secure larger funding for production hardening, mainnet deployment, and regulatory compliance.
- **☑ Continue development independently** – Use Instaward momentum to attract early users, validate product-market fit, and bootstrap next phase of development.
- **☐ Apply for a follow-on Instaward (if eligible)** – Not planned; SCF Build Award is the preferred next funding vehicle.
- **☐ Seek other ecosystem support** – Potential partnership discussions with Stellar ecosystem projects and Pix-native fintech companies.
- **☐ Other:**

---

## 8. Instawards Constraints Acknowledgement

By submitting this SOW, the Builder acknowledges:

- ✓ **This scope will be completed within 30 days or less.** The weekly breakdown is realistic and achieves all four deliverables by end of sprint.
- ✓ **Instawards support execution, not open-ended exploration.** This SOW is tightly scoped to Testnet demo and intentionally excludes production compliance, mainnet deployment, and multi-currency expansion.
- ✓ **A project may receive no more than two follow-on Instawards.** This is the first Instaward for TalkToStellar.
- ✓ **Each Instaward is capped at $5,000.** *Note: Budget request is USD 10,000. If this exceeds current Instaward caps, we request approval exception or alternative funding structure due to technical scope complexity. If capped at $5,000, scope will be reduced to Deliverables 1 & 2 only (Pathfinding + Agent Integration).*
- ✓ **Total Instawards funding may not exceed $15,000.** This is the first Instaward; total will not exceed cap.

---

## 9. Project Context: TalkToStellar Vision

### Why This Instaward Matters

**TalkToStellar** is building the invisible bridge between fiat money (Pix in Brazil, and expanding globally) and Stellar-based cryptocurrency. The product is an LLM-powered conversational payment assistant exclusively on WhatsApp that enables any user to:

- Send and convert money between any Stellar assets (XLM, USDC, or custom assets)
- Pay using Pix (BRL) or hold stablecoins
- Transact in seconds with the lowest fees possible
- All without needing crypto knowledge, exchange accounts, or new apps

The core innovation is using LLM (Large Language Model) to understand flexible, conversational user intent—"Send me 50 USDC", "Convert 100 XLM", "How much can I get for 500 reais?"—without requiring users to learn command syntax or technical terminology.

**Competitive Advantage (Why Stellar?):**
1. **LLM-Powered UX**: Natural language commands via WhatsApp require zero crypto knowledge. Just chat.
2. **Lowest Fees**: Our pathfinding AI finds the cheapest route (0.05% vs 1.2%+ alternatives) in milliseconds.
3. **Speed**: Settlement in ~3 seconds, not 15 minutes or days.
4. **Non-Custodial**: Secure key management in enclaves—users maintain control.
5. **Stellar's Infrastructure**: Nearly-free transaction fees and instant finality make this business model viable.
6. **WhatsApp as Gateway**: 1B+ users already on WhatsApp in target markets. No app friction.

**This Instaward** validates the core technology on Testnet and creates a replicable blueprint for other countries and payment methods, positioning TalkToStellar as the template for Web2-to-Web3 fiat on/off-ramps built on Stellar.

---

## 10. Submission Confirmation

Once finalized, this Statement of Work will be submitted by the Ambassador Chapter Lead (Caio Mattos) via the Instawards Airtable submission form for review and approval.

**Document Status**: Ready for submission  
**Prepared By**: Rodrigo Camargo, TalkToStellar  
**Date**: March 30, 2026  
**Version**: 1.0
