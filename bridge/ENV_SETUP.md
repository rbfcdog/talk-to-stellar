# Bridge.xyz — Environment Variables Reference

## Required Variables

| Variable | Where to Get It | Example |
|---|---|---|
| `BRIDGE_API_KEY` | [Bridge Dashboard](https://dashboard.bridge.xyz) → Settings → API Keys | `bridge_live_abc123...` |

## Optional Variables

| Variable | Default | Where to Set | Description |
|---|---|---|---|
| `BRIDGE_ENABLED` | `true` (non-prod), `false` (prod) | Railway / `.env` | Feature flag |
| `BRIDGE_API_URL` | `https://api.bridge.xyz/v0` | Railway / `.env` | Base API URL |
| `BRIDGE_DEVELOPER_FEE` | `0.30` | Railway / `.env` | Developer fee % per transaction |
| `BRIDGE_SANDBOX` | `true` (non-prod), `false` (prod) | Railway / `.env` | Sandbox mode |
| `BRIDGE_WEBHOOK_SECRET` | (optional) | Railway / `.env` | HMAC secret for webhook verification |

## How to Get `BRIDGE_API_KEY`

1. **Request access** — Email `sales@bridge.xyz` to request PIX and ACH access for your account
2. **Create account** — If you already have access, log in at https://dashboard.bridge.xyz
3. **Generate API key** — Navigate to Settings → API Keys → Create Key
4. **Copy the key** — Store it securely; it's only shown once

## Railway Configuration

Add these to the **backend service** in Railway:

```bash
BRIDGE_API_KEY=bridge_live_your_key_here
BRIDGE_ENABLED=true
BRIDGE_API_URL=https://api.bridge.xyz/v0
BRIDGE_DEVELOPER_FEE=0.30
BRIDGE_SANDBOX=false
BRIDGE_WEBHOOK_SECRET=your_webhook_secret_here
```

## Local Development

```bash
# backend/.env
BRIDGE_API_KEY=bridge_test_your_key_here
BRIDGE_ENABLED=true
BRIDGE_SANDBOX=true
BRIDGE_DEVELOPER_FEE=0.30
```

## Backend `.env.example` Entry

```bash
# Bridge.xyz (Stripe-owned) — PIX on/off-ramp + USD ACH
# Get API key: https://dashboard.bridge.xyz → Settings → API Keys
# Request access: sales@bridge.xyz
BRIDGE_API_KEY=
BRIDGE_API_URL=https://api.bridge.xyz/v0
BRIDGE_WEBHOOK_SECRET=
BRIDGE_ENABLED=false
BRIDGE_DEVELOPER_FEE=0.30
BRIDGE_SANDBOX=true
```

## Webhook URL (for Bridge Dashboard)

When configuring webhooks in the Bridge dashboard, point to:

```
https://YOUR-BACKEND.up.railway.app/webhook/bridge
```

Bridge will send events like `transfer.completed`, `transfer.failed`, `virtual_account.deposit_received`, and `customer.kyc_approved` to this endpoint.
