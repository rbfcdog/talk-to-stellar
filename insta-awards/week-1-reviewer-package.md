# Week 1 Reviewer Package

Submission:

```text
PIX-to-Stellar Transfer Lifecycle Engine
Week 1
```

The reviewer package is generated from a persisted transfer through:

```text
GET /api/transfers/:id/reviewer-evidence
```

The response contains exactly the four award-card artifacts:

1. Repository link.
2. Dashboard screenshot target.
3. Redacted orchestration logs.
4. Redacted transfer record.

The console also loads:

```text
GET /api/transfers/:id/workflow
```

This contract prevents the frontend from inventing lifecycle progress or next
actions independently from the backend state machine.

Generate the local package:

```bash
npm run instawards:evidence -- \
  --run-id week-1-reviewer \
  --api-base=http://localhost:3001 \
  --dashboard-url=http://localhost:3000 \
  --transfer-id=<persisted-transfer-id>
```

Output:

```text
insta-awards/evidence-runs/week-1-reviewer/
  manifest.json
  repository/link.json
  screenshots/dashboard-week-1.png
  logs/orchestration-log.json
  logs/workflow.json
  database/transfer.json
  database/reviewer-evidence.json
```

Financial amounts, rates, and fees remain visible so reviewers can validate the
route math. Names, emails, user and institution identifiers, provider
references, bank details, credentials, tokens, and PINs are redacted or hashed.

The dashboard accepts a reviewer-safe deep link:

```text
/institution-settlement?transfer_id=<persisted-transfer-id>
```

This deep link loads only the sanitized reviewer-evidence contract.
