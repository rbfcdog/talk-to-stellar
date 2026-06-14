# Backend Documentation Summary

Local summary for the actual `backend/` directory. Repository index: [`docs/REPOSITORY-DOCS.md`](../../docs/REPOSITORY-DOCS.md).

Source scope: `backend/docs/**/*.md`, excluding this summary (13 source files).

## Main Areas

| Area | Source docs | Consolidated information |
|------|-------------|--------------------------|
| Backend entry point | `backend/docs/README.md` | External onboarding endpoints, required env vars, migration source of truth, folder map, build/test commands |
| Agent onboarding | `backend/docs/AGENT_ONBOARDING_INSTRUCTIONS.md`, `backend/docs/ONBOARDING_AND_PIN_FLOW.md` | Conversation onboarding and PIN flow |
| Circle payout foundation | `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`, `backend/docs/CIRCLE_INTEGRATION_SETUP.md` | Circle Mint payout payload shape, setup steps, env vars, sandbox/live gating, status polling, webhook intake, troubleshooting, and evidence rules |
| PIN reset | `backend/docs/PIN_RESET_ANALYSIS.md`, `backend/docs/PIN_RESET_SYSTEM.md`, `backend/docs/PIN_RESET_TOOL_FIX.md` | PIN reset design, diagnosis, and historical fix notes |
| Stellar payments | `backend/docs/PATH-PAYMENT.md` | Stellar path-payment behavior |
| Tests | `backend/docs/TEST_QUICK_REFERENCE.md`, `backend/docs/tests/README.md` | Test-suite orientation and commands |
| Migrations | `backend/docs/README.md`, `backend/docs/migrations/README_20260512_financial_assistant.md`, `backend/migrations/20260613_00_full_schema.sql` | Single complete database bootstrap and historical financial-assistant migration notes |
| Agent backlog | `backend/docs/src/api/agent/TODO.md` | Agent-specific implementation backlog |

## Freshness Guidance

`backend/docs/README.md` reflects the current folder organization. `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md` reflects the current Circle payout foundation. `backend/docs/CIRCLE_INTEGRATION_SETUP.md` reflects the current Circle operator setup path. `backend/migrations/20260613_00_full_schema.sql` is the only SQL schema source of truth. Older dated documents, including `backend/docs/migrations/README_20260512_financial_assistant.md`, can describe retired migration files or commands; verify them against `backend/package.json` and the consolidated bootstrap.

Move stable architecture and flow conclusions into `docs/project-brain/architecture/`; keep operational migration guidance in `docs/project-brain/operations/ENVIRONMENTS.md`.
