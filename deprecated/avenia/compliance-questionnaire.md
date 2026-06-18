# TalkToStellar — Compliance Questionnaire

## Do you KYC your customers?

Yes. User identity is verified during onboarding through Stellar wallet association and platform KYC flows. Source and destination endpoint identities are recorded on every transfer with same-name matching enforced for payouts.

## Do you have an AML policy and procedures?

Yes. All transfers are logged immutably via append-only `transfer_events`. Every state transition records the actor, correlation ID, and full payload. Reconciliation compares BRL in vs USDC settled vs USD out. Suspicious patterns (amounts, frequency, geography) are flagged for review on the ops dashboard.

## Do you perform sanctions or PEP checking on your customers?

Sanctions screening is performed at onboarding and on each payout via Circle's built-in compliance layer. PEP checking is integrated into the KYC flow. Destination accounts are validated through the wire bank's KYC/KYB processes.

## Will you be transmitting funds on behalf of your customers?

Yes. TalkToStellar converts customer BRL (received via PIX) to USDC on Stellar and routes USD wire payouts to the customer's designated US bank account via Circle Mint.

## Do you anticipate having payment processors as customers?

No. Primary customers are individuals and businesses sending BRL to USD bank accounts. The platform does not serve payment processors or money transmitters as sub-customers.

## What primary countries do you plan on serving?

Brazil (sender-side, PIX intake) and United States (receiver-side, USD bank payout).
