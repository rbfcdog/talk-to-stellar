# Evolution Documentation Summary

Local summary for the actual `evolution/` directory. Repository index: [`docs/REPOSITORY-DOCS.md`](../../docs/REPOSITORY-DOCS.md).

Source scope: `evolution/docs/README.md`.

The Evolution README is the local and Railway operations guide for the WhatsApp automation stack. It documents:

- Local Evolution API, Manager UI, Postgres, Redis, and persistent session storage.
- Railway service configuration and environment setup.
- The browser URL versus backend webhook URL distinction.
- Instance creation, QR connection, message sending, webhook setup, logs, and common failures.

Use it with `docs/EVOLUTION_RAILWAY_DEPLOYMENT.md` and `docs/WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md`. Verify secrets, ports, and public URLs against the target environment before use.

Durable failure diagnosis belongs in `docs/project-brain/operations/RUNBOOK.md`; current integration boundaries belong in `docs/project-brain/architecture/INTEGRATIONS.md`.
