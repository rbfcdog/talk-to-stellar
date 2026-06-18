# Avenia Integration

> Avenia is a Brazilian payment infrastructure provider.  
> This folder contains the sandbox API integration for TalkToStellar.

## Files

| File | Purpose |
|------|---------|
| `auth-flow.md` | Auth flow documentation with curl examples |
| `avenia-client.ts` | TypeScript API client (Node.js / Edge) |
| `STATUS.md` | Current integration status |

## Quick Start

```bash
# Run the auth flow
npx tsx avenia/avenia-client.ts

# Validate login with email token
npx tsx avenia/avenia-client.ts validate <email-token>

# Refresh tokens
npx tsx avenia/avenia-client.ts refresh <refresh-token>
```

## Environment

```bash
export AVENIA_EMAIL="team.talktostellar@gmail.com"
export AVENIA_PASSWORD="Avenia@2026Strong!"
```

## Credentials

- **Email**: team.talktostellar@gmail.com
- **Sandbox**: `https://api.sandbox.avenia.io:10952`
- **Account type**: INDIVIDUAL

## Current State

See `STATUS.md` for current status.
