# Telegram Documentation Summary

Local summary for the actual `telegram/` directory. Repository index: [`docs/REPOSITORY-DOCS.md`](../../docs/REPOSITORY-DOCS.md).

Source scope: `telegram/docs/README.md`.

The Telegram README documents:

- Polling and webhook bot modes.
- Forwarding messages to the existing agent API.
- In-memory per-chat sessions and pre-flight account checks.
- Dynamic onboarding links for users without accounts.
- Health checks, startup profile configuration, environment variables, and tests.
- Diagnosis of `TelegramError: 401: Unauthorized` as a rejected bot token.

Use webhook mode in production to avoid concurrent polling conflicts. Verify token, endpoint, and environment names against the deployed service.

The dedicated 401 diagnosis also appears in `new/docs/telegram-401-runbook.md`; durable channel failures should move into `docs/project-brain/operations/RUNBOOK.md`.
