# Instawards Evidence Framework

This framework starts the reviewer package before the final demo run. It creates
a repeatable folder structure for API transcripts, database exports, Stellar
settlement evidence, payout adapter evidence, screenshots, and logs.

Generated evidence runs are written to:

```text
insta-awards/evidence-runs/<run-id>/
```

That directory is ignored by git because it can contain logs, screenshots,
provider payloads, and environment metadata that must be reviewed before
submission.

## Create a Run Folder

```bash
npm run instawards:evidence -- --run-id week-1-framework
```

Optional IDs can be attached when known:

```bash
npm run instawards:evidence -- --run-id demo-001 --quote-id quote_123 --transfer-id transfer_123
```

The script creates:

| Path | Purpose |
| --- | --- |
| `manifest.json` | Evidence checklist, commit hash, redacted environment presence, and validation commands. |
| `api/transcript.json` | Placeholder request/response transcript for the full route. |
| `database/transfer.json` | Placeholder transfer row or transfer API response. |
| `database/reconciliation.json` | Placeholder reconciliation export. |
| `stellar/settlement.json` | Real testnet, sandbox, or mock settlement evidence. |
| `payout/instruction.json` | Payout adapter payload/response with sensitive fields redacted. |
| `logs/orchestration-log.json` | Redacted lifecycle log from the orchestration API when `--api-base` and `--transfer-id` are provided. |
| `screenshots/` | Screenshots from `/institution-settlement`. |
| `logs/` | Redacted backend/frontend logs with correlation IDs. |

## Capture From A Running API

After a transfer exists, the generator can hydrate evidence directly from the
API:

```bash
npm run instawards:evidence -- \
  --run-id week-1-transfer-001 \
  --api-base=http://localhost:3001 \
  --transfer-id=tr_brl_usd_123 \
  --correlation-id=instawards_demo_001
```

This writes redacted copies of:

- `GET /api/transfers/:id`
- `GET /api/transfers/:id/reconciliation`
- `GET /api/transfers/:id/orchestration-log`

## Status Rules

Use these statuses in `manifest.json`:

| Status | Meaning |
| --- | --- |
| `placeholder` | Framework-created file waiting for real evidence. |
| `captured` | Evidence was captured and manually checked for sensitive data. |
| `not_applicable` | Evidence is not part of this run and the reason is documented. |
| `blocked` | Evidence could not be captured; include the blocker and next action. |

## Redaction Rules

Before sharing an evidence run, remove or mask:

- Private keys, seed phrases, API keys, webhook secrets, session tokens, and PINs.
- Full bank account/routing numbers.
- Full phone numbers unless explicitly safe for demo.
- Personal email addresses unless they are controlled demo accounts.
- Raw provider payloads that contain customer identifiers.

## First Build Target

Use this framework for the Week 1 hardening work in
`insta-awards/30-day-execution-plan.md`:

1. Run backend tests and keep the output summary in the run folder.
2. Run one complete `/institution-settlement` sandbox route.
3. Save the API transcript and reconciliation JSON.
4. Mark whether the Stellar leg is real testnet, sandbox, or mock.
5. Keep any missing provider credentials listed as blockers, not hidden errors.
