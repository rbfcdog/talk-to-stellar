# Bridge.xyz Webhooks

## What are they for?

Without webhooks, your app has no idea when something happens. You'd have to poll Bridge every few seconds asking "did the deposit arrive yet?". Webhooks let Bridge call YOUR server the moment an event occurs.

**In plain terms:**
- Customer wires $100 → Bridge tells you instantly → you can update their balance, notify them, trigger the next step
- KYC gets approved → Bridge tells you → you unlock that user in your app
- Transfer fails → Bridge tells you → you can alert the user and retry

---

## Do you need them?

**For testing:** No. You can poll `/transfers/:id` and `/virtual-accounts` manually.

**For production:** Yes, for anything that needs to react to money movement in real time:

| Scenario | Without webhooks | With webhooks |
|---|---|---|
| User deposits via wire | You never know it arrived | You get notified instantly |
| On-ramp completes | User has to refresh manually | You push notification to user |
| Transfer fails | User is left waiting | You can retry or refund immediately |
| KYC approved | User has to log out and back in | You unlock their account automatically |
| PIX → ACH atomic flow | Broken — can't chain the steps | Works — webhook triggers ACH on PIX deposit |

---

## Events Bridge sends

| Event | When it fires | What to do |
|---|---|---|
| `virtual_account.deposit_received` | Fiat landed in the virtual account (wire/ACH/PIX/SEPA) | Notify user their deposit was received |
| `virtual_account.activated` | Virtual account is ready to receive | Confirm to user it's live |
| `virtual_account.deactivated` | Virtual account closed | Alert user |
| `transfer.awaiting_funds` | Transfer created, waiting for deposit | Show "waiting for your payment" |
| `transfer.pending` | Deposit received, conversion in progress | Show progress |
| `transfer.completed` | Funds delivered to destination | Notify user, unlock next step |
| `transfer.failed` | Transfer could not complete | Alert user, offer retry |
| `transfer.cancelled` | Transfer was cancelled | Confirm cancellation |
| `liquidation_address.deposit_received` | Crypto landed in a liquidation address | Trigger fiat payout |
| `liquidation_address.drain_completed` | Crypto converted and fiat sent | Notify user |
| `static_memo.deposit_received` | Deposit matched a static memo | Trigger next step |
| `customer.created` | New Bridge customer record created | — |
| `customer.tos_approved` | Customer accepted terms of service | Proceed to KYC |
| `customer.kyc_approved` | Customer passed KYC | Unlock fiat features in your app |
| `customer.kyc_rejected` | Customer failed KYC | Show rejection reason, prompt re-submission |
| `external_account.created` | New bank account added | — |

---

## How the flow works for wire on-ramp

```
User sends wire to Lead Bank
        ↓
Bridge receives it (minutes to hours depending on bank)
        ↓
Bridge fires: virtual_account.deposit_received
        ↓  (your server receives POST to your webhook URL)
Bridge converts USD → USDC
        ↓
Bridge fires: transfer.completed
        ↓  (your server receives POST)
USDC arrives in user's Stellar wallet
```

The webhook is what closes the loop. Without it, your app never knows step 3 or step 5 happened.

---

## Setup: 3 steps

### Step 1 — Register your webhook endpoint with Bridge

Use the bridge-test page (Webhooks section) or call the API directly:

```bash
curl -X POST https://api.bridge.xyz/v0/webhooks \
  -H "Api-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-backend.up.railway.app/api/bridge/webhooks/incoming",
    "event_types": [
      "virtual_account.deposit_received",
      "transfer.completed",
      "transfer.failed",
      "customer.kyc_approved",
      "customer.kyc_rejected",
      "liquidation_address.drain_completed"
    ]
  }'
```

Bridge returns a webhook `id` and a `secret`. **Save the secret immediately** — it's shown only once.

### Step 2 — Set env vars on Railway

```env
BRIDGE_WEBHOOK_SECRET=whsec_...          # from step 1
BRIDGE_WEBHOOK_ID=wh_...                 # from step 1
APP_PUBLIC_WEBHOOK_URL=https://your-backend.up.railway.app/api/bridge/webhooks/incoming
```

### Step 3 — Done

The backend already has a working webhook handler at `POST /api/bridge/webhooks/incoming` (`bridge-webhook.controller.ts`). It:
- Verifies the `x-bridge-signature` header using HMAC-SHA256
- Parses the event
- Routes to the right handler per event type
- For `virtual_account.deposit_received` → triggers the PIX→ACH chain
- For `transfer.completed/failed` → logs + updates the PIX→ACH order

---

## Webhook URL

Your Railway backend exposes:

```
POST https://your-backend.up.railway.app/api/bridge/webhooks/incoming
```

This is NOT proxied through Next.js — it must point directly to the Railway backend because Bridge calls it server-to-server.

---

## Verifying signatures

Bridge signs every webhook with HMAC-SHA256 using your `BRIDGE_WEBHOOK_SECRET`. The signature is in the `x-bridge-signature` header.

The backend already does this in `bridge-webhook.controller.ts`:
```typescript
const valid = bridge.verifyWebhookSignature(rawBody, signature);
if (!valid) return res.status(401).json({ error: 'Invalid signature' });
```

If `BRIDGE_WEBHOOK_SECRET` is not set, signatures are skipped (useful for local testing with ngrok).

---

## Testing locally

Bridge can't reach `localhost`. Options:

**ngrok (easiest):**
```bash
ngrok http 3001
# Bridge webhook URL → https://abc123.ngrok.io/api/bridge/webhooks/incoming
```

**Or just skip webhooks locally** — manually poll transfer status in the bridge-test UI while developing.

---

## What events to subscribe to (recommended minimum)

```json
[
  "virtual_account.deposit_received",
  "transfer.completed",
  "transfer.failed",
  "customer.kyc_approved",
  "customer.kyc_rejected"
]
```

Add `liquidation_address.drain_completed` if you use liquidation addresses for automated off-ramp.

---

## Summary

| Need webhooks? | Situation |
|---|---|
| **No** | Testing manually in the bridge-test page |
| **Yes** | Any production feature that reacts to deposits or transfer status |
| **Yes** | Automated PIX → ACH / on-ramp → notify flows |
| **Yes** | Showing real-time status to users without polling |
