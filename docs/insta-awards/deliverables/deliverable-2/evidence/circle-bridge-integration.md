# Evidence 3 — Circle / Bridge Integration

## Status

Circle sandbox integration is executed through the TTS application. The backend environment has a Circle sandbox API key, execution gate, source wallet, and linked wire bank destination configured. The API key and raw destination ID are not stored in Git or repeated in this evidence.

Bridge remains compatibility-only until provider access and payout endpoints are available.

Current execution status from `circle-readiness-redacted.json`:

- linked Circle wire destination: present
- destination type: `wire`
- destination ID evidence: hash/tail only
- linked destination status from Circle sandbox API: `complete`
- Circle API key available to backend process: yes
- `ENABLE_REAL_PAYOUT_EXECUTION`: true
- Circle sandbox API execution ready: yes
- compatibility evidence ready: yes
- non-mutating Circle API probe: balances HTTP 200, wires HTTP 200, configured wire destination found
- mutating Circle sandbox payout instruction: executed through TTS for transfer `tr_d2_circle_stellar_payment_2`
- persisted payout instruction: `circle_instruction_e0be3785-0b35-4690-9eb6-5f99b66167ab`
- execution mode: `sandbox_api`
- current provider status: `completed`

## Circle Linked Bank Evidence

The operator created a Circle sandbox wire bank account with:

| Field | Evidence |
|---|---|
| Provider | Circle Mint sandbox |
| Endpoint used | `POST https://api-sandbox.circle.com/v1/businessAccount/banks/wires` |
| Current status | `complete` |
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

Confirmed on 2026-06-16:

```text
circle_sandbox_api_execution: true
balances_http_status: 200
wires_http_status: 200
linked_destination_found: true
linked_destination_status: complete
```

No mutating Circle payout was created by this readiness probe. The mutating payout proof was executed separately through the TTS transfer payout endpoint for transfer `tr_d2_circle_stellar_payment_2`.

## USDC On/Off-Ramp Metadata

Circle payout creation now receives the USDC rail metadata from the settled transfer:

```json
{
  "route": "PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK",
  "settlement_asset_code": "USDC",
  "off_ramp_source_asset_code": "USDC",
  "payout_currency": "USD",
  "stellar_tx_hash": "<settlement hash>"
}
```

The adapter sends only the linked Circle bank destination ID to Circle. Raw routing and account numbers remain local redacted evidence for same-name and reviewer controls.

## Circle Sandbox Execution

Execution proof:

```text
transfer_id: tr_d2_circle_stellar_payment_2
payout_instruction_id: circle_instruction_e0be3785-0b35-4690-9eb6-5f99b66167ab
execution_mode: sandbox_api
payout_status: completed
provider_payout_reference_hash: d6a354577130d3e1
provider_payout_reference_tail: ef7481
```

The HTTP payout evidence endpoint was verified:

```text
GET /api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence
success: true
ready: true
ready_count: 4
required_count: 4
execution_mode: sandbox_api
instruction_status: completed
```

## Claim Boundary

Current claim:

```text
TalkToStellar executed a Circle Mint sandbox payout instruction for a database-backed Stellar USDC settlement record, stored the provider response in international_payout_instructions, refreshed provider status to completed, and exposes redacted payout evidence through /api/transfers/:id/payout-evidence.
```

Do not claim production bank delivery. The current claim is Circle sandbox payout completion observed by protected status polling; a signed webhook can be captured later if the reviewer requires webhook evidence.

## Bridge Boundary

Current Bridge claim:

```text
TalkToStellar has a Bridge-compatible payout adapter shape, but no live Bridge payout execution is claimed because provider credentials and payout endpoints are not configured.
```

Required before live Bridge evidence:

- `BRIDGE_API_KEY`
- `BRIDGE_PAYOUT_CREATE_URL`
- `BRIDGE_PAYOUT_STATUS_URL`
- `ENABLE_REAL_PAYOUT_EXECUTION=true`
- a settled transfer with real Stellar evidence
- a persisted provider payout ID or provider status reference
