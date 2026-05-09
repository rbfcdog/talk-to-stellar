# Backend

## Onboarding flow

The backend exposes two public endpoints for external providers such as Telegram:

```text
POST /api/external/check-account
POST /api/external/finalize
```

`/api/external/check-account` receives `{ provider, provider_user_id }` and returns:
- `exists: true` with the linked `sessionId`, or
- `exists: false` with a dynamic `creationUrl` and a 24-hour JWT `token`.

`/api/external/finalize` consumes that `token` and creates the `agent_sessions` row, optionally creates a `wallets` row, and links `external_accounts`.

## Required env vars

```bash
JWT_SECRET=change-me
CREATE_ACCOUNT_BASE=http://localhost:3000
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
```

## Database migration

Run the SQL from [src/migrations/agent.migration.ts](src/migrations/agent.migration.ts) in Supabase to create:
- `agent_sessions`
- `wallets`
- `operations`
- `agent_states`
- `agent_messages`
- `external_accounts`

The migration also adds Vault helper functions:
- `public.store_private_key(...)`
- `public.get_private_key(secret_id)`

## Development

```bash
npm install
npm run dev
```

## Build and test

```bash
npm run build
npm test
```
