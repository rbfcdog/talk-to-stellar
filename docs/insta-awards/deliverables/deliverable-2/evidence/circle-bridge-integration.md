# Evidence 3 — Circle / Bridge Integration

## Status

Circle sandbox foundation is ready for a settled transfer. The Circle sandbox API key and linked wire bank destination were created outside the repo. The API key is not stored in Git or repeated in this evidence.

Bridge remains compatibility-only until provider access and payout endpoints are available.

## Circle Linked Bank Evidence

The operator created a Circle sandbox wire bank account with:

| Field | Evidence |
|---|---|
| Provider | Circle Mint sandbox |
| Endpoint used | `POST https://api-sandbox.circle.com/v1/businessAccount/banks/wires` |
| Returned status | `pending` |
| Bank description | `WELLS FARGO BANK, NA ****0010` |
| Destination ID | Stored only in backend secret/env; evidence should show a hash or last-four tail only |
| Tracking ref | Redact in screenshots unless needed for Circle support |

Use the returned Circle bank `id` as:

```bash
CIRCLE_PAYOUT_DESTINATION_ID=<linked-circle-wire-bank-id>
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
```

Do not put the raw Circle API key, raw account number, routing number, or bank destination ID in committed docs.

## Required Backend Environment

Compatibility evidence:

```bash
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=false
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_KEY=<sandbox key in backend secret storage>
CIRCLE_PAYOUT_DESTINATION_ID=<linked Circle bank id>
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
```

Circle sandbox API execution:

```bash
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=true
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_KEY=<sandbox key in backend secret storage>
CIRCLE_PAYOUT_DESTINATION_ID=<linked Circle bank id>
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
```

## Readiness Check

Run:

```bash
npm --prefix backend run circle:payout-readiness
```

The command prints redacted readiness:

- API key present or missing
- linked destination present or missing
- destination ID hash and tail only
- derived Circle payout endpoints
- whether sandbox API execution is ready

## Claim Boundary

Current claim:

```text
TalkToStellar has a Circle Mint sandbox payout foundation with linked-bank destination support, redacted evidence, status polling, webhook normalization, and execution gated by backend secrets.
```

Do not claim Circle sandbox payout execution until a settled transfer creates a Circle payout and Circle returns a provider payout ID stored in `international_payout_instructions`.
