# Documentation Summary: project-brain/architecture

Generated summary for `docs/project-brain/architecture`. Last generated: 2026-06-14.

## Markdown Files

| File | Title | Words | Summary | Language note |
|------|-------|-------|---------|---------------|
| [`DATA-MODEL.md`](./DATA-MODEL.md) | DATA-MODEL.md — Database Schema | 1040 | Supabase PostgreSQL schema map including D1 lifecycle tables, payout instruction/event tables, the ops transaction read model, and `ops_admin_users` for DB-backed dashboard login. | English or mostly English. |
| [`INTEGRATIONS.md`](./INTEGRATIONS.md) | INTEGRATIONS.md — External Service Integrations | 606 | **Endpoint**: `https://api.sand.etherfuse.com` (sandbox) **Auth**: API key format `api_<env>:<key>:<org_id>` via `ETHERFUSE_API_KEY` env | English or mostly English. |
| [`MONEY-FLOWS.md`](./MONEY-FLOWS.md) | MONEY-FLOWS.md — End-to-End Transaction Lifecycles | 564 | **Sequence files**: `pix-funding.service.ts:16-102`, `anchor.service.ts:4479-4670`, `etherfuse-webhook.controller.ts:32-54`, `stellar-settlement.service.ts:56-140` **Sequence files**: `financial.controller.ts:conversion-preview`, `brl-reference-rate.service.ts... | English or mostly English. |
| [`SYSTEM-MAP.md`](./SYSTEM-MAP.md) | SYSTEM-MAP.md — Architecture Component Diagram | 748 | WhatsApp: `backend/src/api/controllers/evolution.controller.ts`, `backend/src/api/services/notifications/evolution.service.ts` Telegram: `telegram/` directory, `backend/src/api/services/notifications/` | English or mostly English. |

## Child Folders

| Folder | Markdown files | Summary |
|--------|----------------|---------|
| [`deep-dives/`](./deep-dives/) | 2 | [`DOCS-SUMMARY.md`](./deep-dives/DOCS-SUMMARY.md) |

## Notes

- This file is an English index summary for the folder. It does not replace the source documents.
- Source files that still contain Portuguese are marked in the language note column for follow-up translation.
- Generated summaries intentionally skip `DOCS-SUMMARY.md` to avoid recursive noise.
