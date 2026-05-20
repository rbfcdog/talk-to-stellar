
1. Project & Team Information

Project Name: 
TalkToStellar
Builder / Team Name: 
TalkToStellar
Primary Contact (Name + Email): 
Rodrigo Camargo (rodrigobfcdog@gmail.com)
Ambassador Chapter: 
Brazil
Ambassador Chapter Lead:
Caio Mattos
Date Submitted: 
2026/03/31
Suggested Sprint Start Date:
2026/05/01



2. Instawards Overview & Intent

2.1 Instawards Purpose (for Builder Context)
Instawards are designed to support short, clearly scoped, execution-focused work that helps a project make tangible progress toward building on Stellar. Instawards are meant to fund specific, achievable outcomes that can be completed and demonstrated within 30 days or less.

This SOW represents a shared commitment between the Builder and the Ambassador Chapter Lead on what will be delivered, why it matters, and how success will be verified.

3. Problem Statement & Objective

Problem Being Addressed
What specific problem, gap, or blocker is this Instaward intended to solve?
Cryptocurrency adoption in Brazil is still limited by friction and complexity. Users often have to deal with confusing exchange interfaces full of charts and technical terms, slow onboarding processes with KYC and banking delays that can take several days, and unclear fees such as spreads, slippage, and withdrawal costs that make it hard to know the final amount received. On top of that, the ecosystem is fragmented, with no seamless integration between traditional payment systems like Pix and blockchain networks, forcing users to rely on either slow banks or complex crypto platforms.
This is a key challenge for Stellar. Although its mission is to provide fast, low-cost, and accessible financial services, the lack of simple and reliable fiat-to-crypto on/off-ramps prevents broader adoption among everyday users. TalkToStellar aims to solve this by simplifying Stellar transactions to the level of a messaging experience in Whatsapp, reducing friction and making crypto more accessible.
Objective of This Instaward
In one or two sentences, what will be true at the end of 30 days if this Instaward is successful?
At the end of the Insta Awards, TalkToStellar will deliver a production-ready WhatsApp-based conversational payment settlement system running on Stellar that enables users to convert fiat (Pix) to stablecoins, or between any Stellar-based assets, using natural language LLM commands. The system will include automated pathfinding for optimal exchange rates and gasless transaction settlement.


Example prompts for builders: What is currently preventing progress? What is unclear, missing, or unbuilt today? Why is this problem worth solving now?




4. Scope of Work (30-Day Deliverables)

Important guidance: This scope must be achievable within 30 calendar days. If the work feels larger, it should be reduced or split into more achievable phases.


4.1 In-Scope Deliverables

Deliverable
Description (What will be built or produced?)
Why this matters
Stellar Multi-Path Conversion Engine
Build a conversion engine on top of Stellar’s native pathfinding that automatically finds the best route to convert BRL → XLM → USDC (or other paths) using the existing SDK and AMMs/orderbooks in real time. It includes route caching, slippage protection, and clear price quotes before the transaction.



This removes all the complexity from the user and guarantees the best available rate, with low fees (~0.05%), much cheaper and simpler than traditional exchanges.
WhatsApp LLM Agent Integration
Integration of the TalkToStellar LLM-powered agent with Stellar conversion and payment logic. The agent parses natural language requests in plain Portuguese/English ("Send me 50 USDC for 150 BRL via Pix", "Convert 100 XLM to USDC", "How much USDC can I get for 500 BRL?"), validates user wallets, initiates Pix payments, and triggers on-chain settlement when payment is confirmed. The LLM understands flexible, conversational user intent without requiring specific command syntax
This removes the learning curve entirely. Users interact through WhatsApp—the most-used messaging app in Brazil—using natural language. No apps to download, no technical knowledge required, no crypto jargon. Lowering friction to near-zero.
Pix Anchor Integration (BRL On/Off Ramp)
Implementation of a Stellar Anchor that connects Pix payments to Stellar accounts. Handles BRL deposits via Pix, issues corresponding on-chain balances (e.g., BRL token or direct USDC conversion), and supports withdrawals back to Pix. Includes compliance-ready flows and webhook-based payment confirmation.
This directly solves the biggest bottleneck: fiat ↔ crypto access. Users can move money between Pix and Stellar instantly, without exchanges. This is critical for real adoption in Brazil.
Out-of-Scope (Explicitly Not Included)
List anything that might be assumed but is not included in this Instaward scope.


Full marketplace feature expansion (e.g., buyer/seller matching, listings, escrow systems)
Production-grade compliance/legal implementation (KYC/AML at scale)
Native mobile or web app interfaces beyond WhatsApp
Support for multiple countries or payment systems beyond Pix (initial version is Brazil-only)
Trading features (limit orders, charts, manual routing)




4.2 Deliverable-Aligned Budget Request

Requested Budget Amount 
Rationale for Budget Request
USD 12,000
The budget is allocated across three core components: (1) development of an optimized conversion engine leveraging Stellar’s pathfinding across AMMs and orderbooks, (2) integration of a WhatsApp-based LLM agent capable of interpreting user intent and orchestrating payments end-to-end, and (3) implementation of a Pix-compatible Stellar Anchor system that enables seamless BRL deposits and withdrawals, including developer-facing APIs, webhook infrastructure, and clear documentation.
The allocation also covers the engineering effort required to design, build, test, and integrate these components, ensuring a reliable end-to-end system while providing a foundation that other developers can easily reuse and extend.
This investment enables the creation of a fully functional prototype that demonstrates how everyday users in Brazil can move from Pix to on-chain assets in a simple, fast, and low-cost way—without needing to understand crypto infrastructure. The outcome is not just a proof of concept, but a reusable foundation for fiat-to-crypto onboarding on Stellar in emerging markets.















5. 30-Day Execution Plan & Timeline

5.1 Weekly Breakdown
Week
Planned Work
Expected Output
Week 1
Stellar SDK integration and multi-path conversion algorithm development. Set up the Stellar environment, implement liquidity pool and orderbook scanning, build a route calculation engine with slippage protection, and handle wallet creation and storage on DB.
Working pathfinding engine returning optimal conversion paths between asset pairs on Stellar, integrated with user wallet creation and a database layer for storing wallet data, transaction history, and route caching.
Week 2
WhatsApp LLM agent integration and payment validation logic. Integrate LLM (OpenAI API) with the conversion engine via tools (agent-like behaviour), implement WhatsApp API connectivity, and build user wallet validation flow.
LLM agent accepting natural language payment requests via WhatsApp and generating accurate conversion quotes based on Stellar liquidity.
Week 3
Pix Anchor implementation (BRL on/off-ramp). Develop anchor services to handle Pix deposits, map payments to user wallets, trigger on-chain transactions, and implement webhook-based confirmation flow.
Functional Pix → Stellar flow: user initiates payment via Pix and receives corresponding on-chain assets on wallet.
Week 4
End-to-end integration, documentation, and demo. Connect LLM agent, conversion engine, and Pix Anchor into a unified flow. Prepare technical documentation, architecture diagrams, and record demo.
Complete WhatsApp → Pix → Stellar flow demonstrated, with documentation and repository ready for review by developers. Also, the whatsapp bot should be ready for users.




6. Evidence of Completion (Required)

Important guidance: Evidence should be clear, verifiable, and easy to review by the Ambassador Chapter Lead with minimal technical expertise.

6.1 Planned Evidence to Be Submitted
Deliverable
Evidence Type 
(link, repo, demo, screenshot, doc, tx hash, etc.)
Description
Conversion Engine + Infrastructure
GitHub repository, code, Testnet transaction hashes
Complete source code for the multi-path conversion engine, including Stellar integration, wallet handling, and database layer. Testnet transaction hashes demonstrating successful pathfinding-based conversions between asset pairs.


WhatsApp LLM Agent Integration
GitHub repository, WhatsApp chat logs, backend logs, demo screenshots
Working WhatsApp-based LLM agent integrated with a Pix Anchor system. Includes chat logs and screenshots showing natural language interactions, quote generation, Pix payment handling, and backend logs demonstrating successful mapping from Pix payments to on-chain Stellar settlements.


End-to-End Flow + Documentation
Demo video, technical documentation, architecture diagrams, Testnet transactions
Fully integrated flow (WhatsApp → quote → Pix → Stellar settlement) demonstrated on a wallet created via the bot. Includes demo video, architecture diagrams, and setup documentation.




6.2 Evidence Verification Checklist (For Ambassador Use)

For each deliverable, the Ambassador Chapter Lead will assess whether evidence is present and sufficient.
Deliverable
Evidence Present
Evidence 
Partial
Evidence Missing
Comments
Deliverable 1
☐
☐
☐
 Core SDK code, package exports, and Testnet payment flow are visible and understandable.
Deliverable 2
☐
☐
☐
 Example app and documentation are sufficient for a third party to reproduce the basic flow.
Deliverable 3
☐
☐
☐
 Hardening work, CI evidence, and next-step technical direction are clearly documented.


7. Next-Step Alignment

7.1 Anticipated Next Step After Completion

After this Instaward, the most likely next step is:
x Apply to SCF Build Award
☐ Continue development independently
☐ Apply for a follow-on Instaward (if eligible)
☐ Seek other ecosystem support
☐ Other: 
8. Instawards Constraints Acknowledgement

By submitting this SOW, the Builder acknowledges:
x This scope will be completed within 30 days or less.
x Instawards support execution, not open-ended exploration.
x A project may receive no more than two follow-on Instawards.
x Each Instaward is capped at $5,000.
x Total Instawards funding may not exceed $15,000.

9. Submission Confirmation
Once finalized, this Statement of Work will be submitted by the Ambassador Chapter Lead via the Instawards Airtable submission form for review and approval.
