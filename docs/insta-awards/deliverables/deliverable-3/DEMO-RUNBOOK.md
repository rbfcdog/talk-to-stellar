# Demo Runbook

Use this runbook to execute the institutional settlement walkthrough and produce final artifacts for reviewers.

## Before You Start

Read:

- `SETUP.md`
- `TECHNICAL-WALKTHROUGH.md`
- `backend/docs/CIRCLE_INTEGRATION_SETUP.md`

Decide the execution mode before recording:

| Mode | PIX | Stellar | Payout | Reviewer language |
|------|-----|---------|--------|-------------------|
| Full testnet + Circle compatibility | Etherfuse or sandbox PIX | Real Stellar testnet | Circle compatibility | "Real Stellar settlement with Circle payout payload evidence." |
| Full testnet + Circle sandbox | Etherfuse or sandbox PIX | Real Stellar testnet | Circle sandbox API | "Real Stellar settlement with Circle sandbox payout execution." |
| Local rehearsal | Mock PIX | Mock Stellar | Mock or Circle compatibility | "Local mock rehearsal. No real money or provider payout." |

## 1. Start Backend

```bash
LOG_FILE=/tmp/talktostellar-institution-settlement.jsonl \
OPS_DASHBOARD_TOKEN=<review-token> \
OPS_ADMIN_LOGIN=admin@example.com \
TRANSFER_API_TOKEN=<review-token> \
INTERNATIONAL_TRANSFER_OPS_SECRET=<ops-secret> \
npm --prefix backend run dev
```

## 2. Start Frontend

```bash
BACKEND_URL=http://localhost:3001 \
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001 \
npm --prefix frontend run dev
```

## 3. Confirm Provider Capabilities

```bash
BACKEND_URL=http://localhost:3001

curl -s "${BACKEND_URL}/api/transfers/payout-providers" | jq
```

Save the output in the final run report. The Circle provider should be either `compatibility`, `sandbox_api`, or `live_api`. For this deliverable, do not use `live_api` unless production approval and treasury authorization are explicitly available.

## 4. Run The Transfer

Use the frontend at:

```text
http://localhost:3000/institution-settlement
```

Or run the API sequence manually:

```bash
OPS_TOKEN="<ops-secret>"
OPS_DASHBOARD_TOKEN="<review-token>"

curl -s -X POST "${BACKEND_URL}/api/quotes/brl-usd" \
  -H "Content-Type: application/json" \
  -d '{"brl_amount":"1000","user_id":"demo-user","institution_id":"demo-institution"}' | jq
```

Create the transfer with the returned `quote_id`:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers" \
  -H "Content-Type: application/json" \
  -d '{
    "quote_id": "QUOTE_ID",
    "user_id": "demo-user",
    "institution_id": "demo-institution",
    "sender_identity": {
      "legal_name": "Demo Sender",
      "country": "BR",
      "type": "individual"
    },
    "recipient_identity": {
      "legal_name": "Demo Sender",
      "country": "US",
      "type": "individual"
    },
    "payout_destination": {
      "accountHolderName": "Demo Sender",
      "accountHolderType": "individual",
      "bankName": "Demo USD Bank",
      "routingNumber": "021000021",
      "accountNumber": "123456789",
      "accountType": "checking",
      "country": "US",
      "providerDestinationId": "OPTIONAL_CIRCLE_LINKED_BANK_ID",
      "providerDestinationType": "wire",
      "providerLabel": "other"
    },
    "same_name_payout_required": true
  }' | jq
```

Save:

```text
quote_id:
legacy transfer_id:
```

Create PIX intent:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/pix-intent" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mock_pix_intent":true}' | jq
```

Confirm sandbox/mock funding only if the PIX intent is a mock intent:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/funding-confirmation" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status":"completed","event":"pix.received"}' | jq
```

Settle Stellar:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/settle-stellar" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq
```

Create payout instruction:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-instruction" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"provider":"circle"}' | jq
```

Refresh payout status:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-status-refresh" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq
```

## 5. Export Evidence JSON

```bash
mkdir -p docs/insta-awards/deliverables/deliverable-3/evidence/json

curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/workflow" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  | jq > docs/insta-awards/deliverables/deliverable-3/evidence/json/workflow.json

curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/reviewer-evidence" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  | jq > docs/insta-awards/deliverables/deliverable-3/evidence/json/reviewer-evidence.json

curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-evidence" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  | jq > docs/insta-awards/deliverables/deliverable-3/evidence/json/payout-evidence.json

curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/orchestration-log" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  | jq > docs/insta-awards/deliverables/deliverable-3/evidence/json/orchestration-log.json

curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/reconciliation" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  | jq > docs/insta-awards/deliverables/deliverable-3/evidence/json/reconciliation.json
```

Review the JSON files before sharing. Remove secrets, full bank numbers, tokens, private keys, PINs, and unredacted personal data.

## 6. Capture Screenshots

Follow `SCREENSHOT-SHOTLIST.md`. All screenshots should show the same transfer ID or public reference.

Suggested Playwright commands:

```bash
mkdir -p docs/insta-awards/deliverables/deliverable-3/evidence/screenshots

npx --prefix frontend playwright screenshot \
  --viewport-size=1440,1000 \
  "http://localhost:3000/institution-settlement?transfer_id=${TRANSFER_ID}" \
  docs/insta-awards/deliverables/deliverable-3/evidence/screenshots/01-institution-settlement-overview.png

# For the ops dashboard, first open http://localhost:3001/ops/login in the
# same browser context, sign in with OPS_ADMIN_LOGIN, then capture:
# http://localhost:3001/ops?source=transfers
```

## 7. Record Video

Use `VIDEO-STORYBOARD.md`. Keep the video to 5-8 minutes unless reviewers require a shorter cut.

## 8. Finalize Run Report

Create:

```text
docs/insta-awards/deliverables/deliverable-3/runs/<timestamp>.md
```

Include:

- environment mode.
- transfer IDs.
- command transcript.
- links to screenshots/video/JSON files.
- any blocked steps.
- explicit "real", "sandbox", "compatibility", or "mock" labels.
