# TalkToStellar — Compliance Questionnaire

Last updated: 2026-06-22

## Source of Funds

### Primary source of funds

Customer-originated payment/conversion funds received through regulated fiat-ramp partners. During the current pre-production/sandbox phase, company operating funds come from founder/grant development funding rather than live customer deposits.

### Source of funds description

TalkToStellar lets users initiate BRL deposits via PIX from their own bank accounts for user-authorized conversion, Stellar settlement, and USD/BRL payout flows. The company earns a disclosed platform spread, currently modeled at 30 bps (0.30%), while provider rail fees are passed through transparently. Customer funds are used to fulfill the customer's requested transfer and are not treated as company operating capital.

Current live-funds execution remains gated. Local/test environments use testnet, sandbox, auto-approved/mock KYC, and mock/sandbox payout behavior until production KYC/KYB, sanctions/AML screening, transaction monitoring, and regulated partner responsibilities are approved.

### Estimated annual revenue (USD)

Current production revenue: **$0**. The product is still pre-production/sandbox for live money movement.

Year 1 model: **approximately $75,000/year** if TalkToStellar reaches $25M annual transfer volume at a 0.30% platform spread.

### Will you be transmitting funds on behalf of your customers -- if so, does your business conduct compliance screening, including KYC, KYB or AML?

**Answer: Yes (explain below).**

TalkToStellar is designed to move value on behalf of customers: customer BRL enters through PIX, value settles as USDC on Stellar, and payouts route through configured partners such as Circle, Bridge, or Etherfuse.

Compliance screening is partner-led plus internally controlled. Production flows should require provider KYC/KYB where applicable, same-name payout controls, manual review for identity mismatches, sanctions/AML screening, transaction monitoring, and reconciliation across PIX intake, Stellar settlement, and payout evidence. Current repository support includes provider KYC/KYB integrations, same-name payout fields and blocking, fraud-screening integration, gated real payout execution, and reconciliation records; sanctions/transaction-monitoring ownership remains a pre-live production decision.

## Do you KYC your customers?

Yes for production, through regulated ramp/payout partner flows where applicable. Current development/sandbox flows use provider sandbox KYC, auto-approved/mock KYC, or hosted KYC links depending on the provider. Source and destination endpoint identities are recorded on transfer records, and same-name payout requirements can block payout creation when the match status is not `MATCHED`.

## Do you have an AML policy and procedures?

Yes as a production requirement and operating control set. Transfer lifecycles are logged through `transfer_events`, payout instructions/events are stored separately, and reconciliation compares PIX intake, Stellar settlement, and payout evidence. Before live funds, sanctions screening, transaction monitoring, review thresholds, and regulated partner responsibilities must be finalized with counsel/compliance.

## Do you perform sanctions or PEP checking on your customers?

Production sanctions, PEP, and AML checks should be performed through regulated ramp/payout partners and internal review controls before external payouts. Current code includes provider KYC/KYB paths, same-name payout blocking, and Stellar address fraud-screening support, but the project-brain runbook still lists sanctions screening and transaction monitoring as pre-live requirements.

## Will you be transmitting funds on behalf of your customers?

Yes. TalkToStellar converts customer BRL (received via PIX) to USDC on Stellar and routes USD wire payouts to the customer's designated US bank account via Circle Mint.

## Do you anticipate having payment processors as customers?

No. Primary customers are individuals and businesses sending BRL to USD bank accounts. The platform does not serve payment processors or money transmitters as sub-customers.

## What primary countries do you plan on serving?

Brazil (sender-side, PIX intake) and United States (receiver-side, USD bank payout).

## Evidence Paths

- Business model and revenue estimate: `docs/business/MARKET_ECONOMICS.md`, `docs/business/FEE_STRUCTURE.md`
- Funding context: `docs/project-brain/funding/scf-build.md`, `docs/project-brain/funding/GRANTS.md`
- Funds flow: `docs/project-brain/architecture/MONEY-FLOWS.md`
- Provider integrations: `docs/project-brain/architecture/INTEGRATIONS.md`
- Environment and live-funds gates: `docs/project-brain/operations/ENVIRONMENTS.md`
- Compliance production gaps: `docs/settlement/BRL_USD_RAIL_OPERATOR_RUNBOOK.md`
- KYC/KYB and payout controls: `backend/src/integrations/bridge/service.ts`, `backend/src/api/services/identity-alignment.service.ts`, `backend/src/api/services/international-transfer.service.ts`
- Fraud-screening implementation: `backend/src/integrations/fraud-screening/service.ts`
- Reconciliation and payout evidence tables: `backend/migrations/20260613_00_full_schema.sql`


## Final

TalkToStellar will let users initiate BRL deposits via PIX from their own bank accounts for user-authorized conversion, Stellar settlement, and USD/BRL payout flows. The company earns a disclosed platform spread, currently modeled at 30 bps (0.30%), while provider rail fees are passed through transparently. Customer funds are used to fulfill the customer's requested transfer and are not treated as company operating capital.

Current live-funds execution remains gated. Local/test environments use testnet, sandbox, payout behavior until the anchor responsibilities is approved.

For now, we are associated with Stellar and their funding programs. They are helping develop the product before revenue.

Compliance screening is partner-led plus internally controlled. Production flows should require provider KYC/KYB where applicable, same-name payout controls, manual review for identity mismatches, sanctions/AML screening, transaction monitoring, and reconciliation across PIX intake, Stellar settlement, and payout evidence.
