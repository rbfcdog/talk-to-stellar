# Statement of Work - TalkToStellar Current Project State

## 1. Project & Team Information

**Project Name:** TalkToStellar  
**Builder / Team Name:** TalkToStellar  
**Primary Contact:** Rodrigo Camargo, rodrigobfcdog@gmail.com  
**Ambassador Chapter:** Brazil  
**Ambassador Chapter Lead:** Caio Mattos  
**Date Submitted:** 2026-05-19  
**Suggested Sprint Start Date:** 2026-05-20  
**Sprint Length:** 30 days

## 2. Instawards Overview & Intent

Instawards should support short, execution-focused work that can be completed and demonstrated within 30 days. This SOW is written from the current state of the project, not from zero.

TalkToStellar already has a working Stellar testnet wallet assistant, browser onboarding, passkey flows, WhatsApp/Evolution integration, Telegram-style agent routing, Etherfuse sandbox PIX ramp work, Stellar conversion/payment code, and recent security hardening. The purpose of this Instaward is to turn that existing foundation into a clear, reproducible, reviewable Stellar testnet anchor-style pilot with technical evidence.

## 3. Problem Statement & Objective

### Problem Being Addressed

Brazilian users still face a large gap between familiar payment behavior, such as PIX and WhatsApp, and on-chain Stellar usage. The project has already built most of the components needed to reduce that friction, but the current gap is operational clarity and reviewability: the flow must be stable, documented, demonstrable on testnet, and easy for an evaluator to verify through backend calls, webhook evidence, anchors, and Stellar transaction hashes.

### Objective of This Instaward

At the end of 30 days, TalkToStellar will provide a deployed and documented testnet pilot showing a WhatsApp/Evolution message triggering the backend agent, creating or using a user session, producing a PIX sandbox ramp flow, and settling or demonstrating the corresponding Stellar testnet movement with clear logs, status transitions, and transaction evidence.

This is not a request to build a full regulated production remittance company in 30 days. The goal is a realistic Stellar testnet pilot that proves the technical flow and leaves a clean path toward production partners, compliance, and mainnet.

## 4. Current Project State

Already implemented or substantially built:

- Next.js frontend with onboarding, login, passkey registration, payment confirmation, wallet profile, PIX ramp screens, and chat UI.
- Express backend with agent routes, wallet/session storage, Stellar testnet wallet operations, payments, conversions, contacts, pay links, and financial assistant features.
- Supabase/Postgres schema and migrations for sessions, wallets, operations, passkeys, external accounts, payment confirmations, PIX ramp state, and financial modules.
- WhatsApp integration through Evolution API, including webhook handling and connection to the backend agent query flow.
- Etherfuse sandbox PIX ramp integration work for test flows.
- Stellar testnet infrastructure, BRL/USDC quote support, trustline/liquidity scripts, and mainnet preparation docs.
- Security upgrades including HttpOnly session cookies, removal of frontend session-token localStorage usage, passkey enrollment hardening, versioned PIN hashing with per-PIN salt, backend rate limiting, and Supabase RLS hardening SQL.

The remaining work for this SOW is focused on stabilization, deploy configuration, evidence, and evaluator-facing documentation.

## 5. Scope of Work

### 5.1 In-Scope Deliverables

| Deliverable | Description | Why this matters |
|---|---|---|
| Testnet WhatsApp to Stellar Pilot | Stabilize the deployed flow where a WhatsApp/Evolution message reaches the backend agent, maps to a valid session, and triggers quote/payment/ramp actions on Stellar testnet or sandbox infrastructure. | Proves the product's core thesis in the user channel Brazilians already use, without requiring a separate crypto interface. |
| PIX Sandbox Anchor Flow Evidence | Provide a reproducible sandbox flow for PIX ramp behavior, including backend endpoint calls, webhook/state transitions, simulated payment confirmation, and user-facing status screens. | Shows how the project connects Brazilian fiat rails to Stellar-style settlement while staying safely in sandbox/testnet. |
| Stellar Testnet Transaction Evidence | Produce clear testnet evidence for wallet creation, asset balance changes, payment/conversion operations, and relevant transaction hashes or explorer links. | Makes the work verifiable by the Ambassador Chapter without relying only on a product demo video. |
| Security and Deployment Hardening | Finalize environment guidance, backend rate-limit setup, HttpOnly cookie deployment checks, PIN migration notes, and Supabase RLS apply/verify instructions. | Reduces operational risk and shows the pilot is built with realistic production concerns in mind. |
| Technical Demo Package | Create a short evaluator-facing package: script, timestamps, backend calls to show, expected logs, architecture diagram, setup guide, and known limitations. | Prevents the demo from looking like only a UI prototype and makes the integration flow easy to review. |

### 5.2 Out of Scope

- Mainnet money movement.
- Real regulated PIX production processing.
- Open consumer remittance.
- Full KYC/AML operations at production scale.
- Legal/compliance licensing work.
- Native mobile app.
- Multi-country payout support.
- Limit orders, trading charts, or exchange-style trading UI.
- Production liquidity commitments or market-maker agreements.

## 6. Budget Request

**Requested Budget Amount:** USD 5,000

**Rationale:** The budget funds a focused 30-day completion sprint around stabilization, deployment, documentation, and evidence for an already-built Stellar testnet pilot. The work is not a full rebuild. It covers engineering time for integration cleanup, sandbox/testnet verification, deployment configuration, security migration guidance, and demo material that makes the project reviewable by the Brazil Ambassador Chapter and useful for a later SCF Build Award application.

## 7. 30-Day Execution Plan

| Week | Planned Work | Expected Output |
|---|---|---|
| Week 1 | Lock deployment configuration for backend, frontend, Evolution API, Supabase, and Stellar testnet. Verify that frontend session flows use HttpOnly cookies and that WhatsApp requests reach `/api/agent/query` reliably. | Deployed staging/testnet environment with documented env values, health checks, and working WhatsApp-to-agent message flow. |
| Week 2 | Stabilize PIX sandbox anchor flow and frontend PIX ramp screens. Confirm quote creation, sandbox payment status, webhook simulation, and Stellar testnet balance/transaction evidence. | Reproducible PIX sandbox flow with API examples, screenshots, logs, and testnet transaction references. |
| Week 3 | Run security/deployment hardening checklist: rate limits, PIN hash migration behavior, passkey registration check, Supabase RLS migration instructions, and verification SQL. | Security checklist completed with evidence, commands, and remaining production-only requirements clearly separated. |
| Week 4 | Package evaluator demo: final walkthrough script, timestamps, backend calls, anchor explanations, deployment guide, architecture diagram, and repository cleanup. | Complete submission package including demo video plan, docs, endpoint list, testnet hashes, and clear known limitations. |

## 8. Evidence of Completion

| Deliverable | Evidence Type | Description |
|---|---|---|
| WhatsApp to Agent Flow | Demo video, WhatsApp screenshots, backend logs | Show a real WhatsApp/Evolution message reaching the backend agent and returning a response based on session/wallet context. |
| PIX Sandbox Anchor Flow | API call examples, screenshots, logs, docs | Show quote/order creation, sandbox payment confirmation, state transition, and frontend status. |
| Stellar Testnet Settlement | Testnet transaction hashes, Stellar explorer links, backend logs | Show wallet creation and at least one payment/conversion/ramp-related testnet transaction or balance change. |
| Security Hardening | Commit links, env guide, verification SQL output | Show HttpOnly cookies, backend rate-limit config, PIN hash migration behavior, and Supabase RLS verification procedure. |
| Technical Documentation | GitHub docs, architecture diagram, demo script | Provide enough detail for a reviewer to reproduce the backend integration flow and understand each system component. |

## 9. Evidence Verification Checklist

| Deliverable | Evidence Present | Partial | Missing | Comments |
|---|---|---|---|---|
| WhatsApp to Agent Flow | ☐ | ☐ | ☐ | Evaluator can see message, webhook/backend handling, and agent response. |
| PIX Sandbox Anchor Flow | ☐ | ☐ | ☐ | Evaluator can see the sandbox PIX lifecycle and status changes. |
| Stellar Testnet Evidence | ☐ | ☐ | ☐ | Transaction hashes or explorer links are provided. |
| Security/Deployment Hardening | ☐ | ☐ | ☐ | Env, migrations, and verification steps are documented. |
| Final Demo Package | ☐ | ☐ | ☐ | Video/script/docs are clear enough for non-maintainers to review. |

## 10. Success Criteria

This Instaward is successful if:

- the deployed testnet environment can receive a WhatsApp/Evolution message and route it into the TalkToStellar backend agent;
- the project demonstrates a PIX sandbox anchor-style flow with clear backend calls and state transitions;
- Stellar testnet wallet/transaction evidence is available and linked;
- security and deployment docs are complete enough for a third party to reproduce the setup;
- limitations are explicit, especially that real production PIX, mainnet settlement, and regulated remittance are out of scope.

## 11. Next-Step Alignment

After this Instaward, the most likely next step is:

- [x] Apply to SCF Build Award
- [ ] Continue development independently
- [ ] Apply for a follow-on Instaward
- [ ] Seek other ecosystem support
- [ ] Other

The SCF Build Award scope would be larger and should focus on production partner integration, compliance architecture, mainnet readiness, stronger ledger/reconciliation, and a controlled B2B pilot.

## 12. Instawards Constraints Acknowledgement

By submitting this SOW, the Builder acknowledges:

- [x] This scope will be completed within 30 days or less.
- [x] Instawards support execution, not open-ended exploration.
- [x] A project may receive no more than two follow-on Instawards.
- [x] Each Instaward is capped at USD 5,000.
- [x] Total Instawards funding may not exceed USD 15,000.

## 13. Submission Confirmation

Once finalized, this Statement of Work will be submitted by the Ambassador Chapter Lead through the Instawards Airtable submission form for review and approval.
