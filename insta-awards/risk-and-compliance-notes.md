# Risk and Compliance Notes

This document exists to keep the Instawards sprint scoped correctly.

## Core Boundary

TalkToStellar can demonstrate programmable settlement coordination:

```text
Pix event -> BRL/USD quote -> Stellar USDC settlement evidence -> payout instruction -> reconciliation
```

This is not the same as operating a production remittance, banking, or money
transmission business.

## What the Current Code Should Not Claim

Do not claim:

- Production remittance operations.
- Production regulated FX service.
- Production money transmission.
- Production Wise payout.
- Production ACH/wire payout.
- Production compliance approval.
- Tax avoidance.
- Guaranteed cheaper pricing.
- Guaranteed settlement delivery.
- Guaranteed provider acceptance.

Use language such as:

- "sandbox";
- "testnet";
- "provider-compatible instruction";
- "payout adapter";
- "settlement evidence";
- "demo route";
- "reviewer environment";
- "low-value validation transaction where configured".

## Mock and Sandbox Surfaces

The codebase contains controlled mock/sandbox paths. These are useful for
review but must be labeled.

### Pix Funding

Relevant controls:

```text
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX
ALLOW_OPS_MOCKS
ETHERFUSE_SANDBOX_PIX_FALLBACK
ETHERFUSE_API_KEY
ETHERFUSE_BASE_URL
```

Risk:

- A mock Pix event proves lifecycle orchestration, not receipt of production
  funds.

Required reviewer wording:

```text
Pix funding was simulated or processed through the configured Etherfuse sandbox
environment for demo purposes.
```

### Stellar Settlement

Relevant controls:

```text
STELLAR_NETWORK
STELLAR_SECRET_KEY
STELLAR_PUBLIC_KEY
USD_OFFRAMP_STELLAR_DESTINATION
PAYOUT_STELLAR_DESTINATION_PUBLIC_KEY
ENABLE_MAINNET_SETTLEMENT_VALIDATION
MAX_MAINNET_VALIDATION_AMOUNT_USD
```

Risk:

- If settlement credentials are absent, the system may create mock evidence if
  enabled. That cannot be presented as an actual Stellar transfer.

Required reviewer wording:

```text
This run used real testnet Stellar settlement evidence.
```

or:

```text
This run used sandbox/mock Stellar evidence because settlement credentials were
not configured.
```

### Payout Providers

Relevant controls:

```text
PAYOUT_PROVIDER
ENABLE_REAL_PAYOUT_EXECUTION
CIRCLE_API_KEY
CIRCLE_PAYOUT_CREATE_URL
BRIDGE_API_KEY
BRIDGE_PAYOUT_CREATE_URL
MOCK_USD_PAYOUT_AUTO_COMPLETE
```

Risk:

- Circle and Bridge adapters may only produce provider-shaped payloads unless
  sandbox URLs and API keys are configured.
- Etherfuse off-ramp proof is not a production USD bank payout.
- Wise-compatible account metadata is not a Wise integration.

Required reviewer wording:

```text
The adapter created a payout instruction compatible with provider-style payout
workflows. Production bank payout execution is outside this Instawards scope.
```

## Same-Name Account Alignment

The SOW notes that global accounts may reject inward transfers from unrelated
third-party corporate crypto pools. The code includes same-name alignment
tracking through:

```text
backend/src/api/services/identity-alignment.service.ts
```

Current statuses:

```text
MATCHED
MISMATCHED
UNKNOWN
```

Risk:

- This is identity metadata and routing risk handling. It is not a full KYC,
  KYB, sanctions, or AML program.

Required reviewer wording:

```text
The prototype records same-name alignment metadata for payout routing review.
Production compliance checks require regulated provider integrations and are
outside this sprint.
```

## Mainnet Guardrails

The code includes explicit mainnet controls. Mainnet validation should be
small-value, deliberate, and documented.

Recommended operating rule:

- Default to testnet.
- Use mainnet only for selective low-value validation.
- Keep `MAX_MAINNET_VALIDATION_AMOUNT_USD` conservative.
- Record the exact environment, hash, amount, and reviewer purpose.

## Data Handling

Reviewer materials should redact:

- PINs.
- Session tokens.
- Secret keys.
- API keys.
- Full bank account numbers.
- Full personal identifiers where not necessary.

The reviewer UI already redacts fields matching sensitive key names in request
logs. Final exports should be checked manually before submission.

## Final Compliance Position

The safest positioning is:

```text
TalkToStellar is demonstrating settlement orchestration infrastructure that can
coordinate Pix-funded BRL value, Stellar USDC settlement evidence, payout
instructions, and reconciliation metadata. The Instawards sprint validates the
technical rail and integration readiness. It does not launch production
remittance, regulated FX, licensed money transmission, or live bank payout
operations.
```
