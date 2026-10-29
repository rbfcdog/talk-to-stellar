# TalkToStellar — Compliance Questionnaire

Original draft: **2026-06-22**. Documentation reconciliation: **2026-10-28**.

> **Working questionnaire, not a compliance attestation.** The June draft mixed
> business projections, proposed operating policies, and implementation claims.
> Repository code establishes capabilities, not current revenue, customer activity,
> provider approval, legal status, or an adopted AML program. The responsible
> owner and legal/compliance advisers must confirm current answers before this
> document is sent to a provider, funder, or regulator.

## Entity, Ownership, and Operating Status

The owner confirmed on 2026-10-28 that the software is personally co-owned by
Rodrigo (`rbfcdog`), André, and João Pedro, not by a company or other entity,
and that other people actively work on the repository. The owner also reported
no employer, client, university, NDA, or confidentiality claims restricting
sharing. These are owner-provided statements, not an independent legal audit.
They establish neither a licensed financial operator nor regulatory approval.

Likewise, “sandbox” is an environment configuration, not a blanket description of
all code paths. The repository includes a public-key Mainnet wallet view, separate
custodial Mainnet signing paths, and configurable provider payout execution.
Actual deployment settings and settled-funds evidence require operator review.
See [README — Current Mainnet Position](../README.md#current-mainnet-position).

## Source of Funds

### Primary source of funds

**Proposed customer flow:** customer-originated BRL deposits through fiat-ramp
partners, followed by user-authorized conversion, Stellar settlement, and
USD/BRL payout. Partner regulation, customer-funds arrangements, source-of-funds
checks, and the responsible operating entity must be confirmed for each rail.

**Historical funding statement:** the June 2026 draft described founder/grant
development funding rather than customer deposits as operating funds. This is
not a current, independently verified funding statement. Confirm funding sources,
grant receipts/restrictions, customer deposits, and any other operating funds
against owner/accounting records.

### Source of funds description

The proposed business model charges a disclosed platform spread, modeled in the
June draft at **30 bps (0.30%)**, with provider fees disclosed separately.
The intended policy is to use customer funds only for their authorized flow,
not as operating capital. The repository's custody/signing capability does not
prove legal segregation, safeguarding, beneficial ownership, or adherence to that
policy; account structures and agreements need owner/legal confirmation.

### Estimated annual revenue (USD)

- **Historical statement (2026-06-22):** the draft reported **$0 production
  revenue** and described the project as pre-production/sandbox. Do not reuse
  that figure or status as current without accounting/operator confirmation.
- **Dated projection, not achieved revenue:** $25,000,000 in annual transfer
  volume × 0.003 spread = **$75,000/year**, before expenses and provider fees.
- **Current revenue/volume:** not established by this repository review; obtain
  dated financial records and distinguish production, sandbox, and synthetic data.

## Will You Transmit Funds on Behalf of Customers, and Conduct KYC/KYB/AML Screening?

**Capability/intended activity: yes. Current operating/legal answer requires
confirmation.** Implemented flows include BRL intake, Stellar settlement,
custodial wallet signing, and provider payout requests. A transfer or payout
record alone does not prove that a bank payment was executed.

Code supports provider KYC links, identity-name comparison, conditional same-name
payout blocking, address fraud-screening integration, and payout/reconciliation
records. These are implementation controls, not proof that every execution
surface is screened or that an approved compliance program is operating.

The primary Testnet runtime guard, Bridge route-specific movement/password
controls, and international-transfer payout execution flag are separate. Bridge
wallet investment/redemption paths are not covered by the transfer movement
middleware. Confirm each deployed route, provider permissions, limits, approval
procedures, and screening responsibilities rather than claiming a global
live-funds block.

## Do You KYC Your Customers?

**Implemented provider capability; current coverage unverified.** Bridge supports
hosted KYC links/status queries, and other flows may use sandbox or mock identity
behavior when configured. Name matching compares recorded names; it is not
independent identity verification. In the international-transfer flow, a payout
requiring a same-name match is blocked unless the recorded status is `MATCHED`.

Owner/compliance confirmation is required for the providers, jurisdictions,
customer types, verification coverage, evidence retention, exception handling,
and deployed enforcement. Do not answer an unqualified “yes for production”
based only on these code paths.

## Do You Have an AML Policy and Procedures?

**An adopted, approved AML policy is not established by this review.** The June
draft's “yes as a production requirement” described intended controls, not
evidence of a formally adopted policy. Audit events, reconciliation records,
provider integrations, and technical gates do not themselves constitute an AML
program.

The responsible entity/owner and legal/compliance advisers must confirm the
policy document, approval date, accountable officer, risk assessment, monitoring
and escalation procedures, reporting obligations, training, and provider
responsibility agreements. Do not certify compliance from implementation alone.

## Do You Perform Sanctions or PEP Checking on Customers?

**Current operating coverage unverified.** Provider KYC paths and Stellar address
fraud-screening code do not establish comprehensive sanctions/PEP screening.
Confirm who screens which parties, when screening runs, data sources, review and
blocking behavior, monitoring, and evidence of actual operation with the relevant
providers and compliance owner.

The address-screening implementation returns an unflagged result on upstream
errors/timeouts (fail-open). It must not be described as a fail-closed sanctions
gate or a substitute for customer sanctions/PEP checks.

## Will You Transmit Funds on Behalf of Customers?

The intended service and implemented capabilities can move value on customers'
behalf, including through backend-controlled signing keys. USD payout adapters
include Circle, Bridge, Etherfuse, and mock/compatibility modes. Do not describe
every transfer as a Circle Mint bank wire or a completed payout: inspect the
selected adapter, execution mode, provider response, and settlement evidence.
Legal classification and authorization must be confirmed by counsel/providers.

## Do You Anticipate Having Payment Processors as Customers?

The June draft targeted individuals and businesses, not payment processors or
money transmitters as sub-customers. This is a historical market assumption,
not a verified current customer roster or binding exclusion. The owner must
confirm present customers, permitted use, and onboarding policy.

## What Primary Countries Do You Plan on Serving?

The June draft's target corridor was **Brazil** (BRL/PIX intake) to the
**United States** (USD bank payout). Planned countries do not establish legal
authorization, provider coverage, or actual customer activity in either country.
Confirm the current service/country matrix before submission.

## Evidence and Confirmation Boundaries

Implementation sources:

- [Mainnet runtime guard](../backend/src/config/stellar.ts#L11).
- [External public-key wallet view](../backend/src/api/services/mainnet-wallet.service.ts#L122)
  and [payment preview](../backend/src/api/services/mainnet-wallet.service.ts#L341).
- [Bridge configuration/defaults](../backend/src/integrations/bridge/config.ts#L54),
  [route coverage](../backend/src/api/routes/bridge.router.ts#L11), and
  [middleware](../backend/src/api/middlewares/bridge-mainnet.middleware.ts#L18).
- [Custodial wallet/key creation](../backend/src/api/controllers/bridge.controller.ts#L580)
  and [separate investment execution](../backend/src/api/controllers/bridge.controller.ts#L3461).
- [Provider KYC links](../backend/src/integrations/bridge/service.ts#L111).
- [Name comparison](../backend/src/api/services/identity-alignment.service.ts#L19)
  and [conditional payout block](../backend/src/api/services/international-transfer.service.ts#L464).
- [Mock payout evidence](../backend/src/api/services/usd-payout-adapters.ts#L296)
  and [compatibility versus API execution](../backend/src/api/services/usd-payout-adapters.ts#L404).
- [Address screening and fail-open behavior](../backend/src/integrations/fraud-screening/service.ts#L29).

Historical business/operational references, not independent attestations:

- `docs/business/MARKET_ECONOMICS.md`, `docs/business/FEE_STRUCTURE.md`.
- `docs/project-brain/funding/scf-build.md`, `docs/project-brain/funding/GRANTS.md`.
- `docs/project-brain/architecture/MONEY-FLOWS.md`,
  `docs/project-brain/architecture/INTEGRATIONS.md`.
- `docs/settlement/BRL_USD_RAIL_OPERATOR_RUNBOOK.md`.

Current financials, company/ownership records, contributor rights, adopted
policies, provider approvals, and customer-funds activity require dated
owner/legal/accounting/provider evidence. Historical references to Stellar
funding programs do not by themselves establish funding received, endorsement,
or a formal partnership.
