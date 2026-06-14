# Repository Documentation Index

Generated: 2026-06-13. Updated after documentation consolidation.

Repository documentation belongs in a `docs/` directory. Project-wide material lives under `docs/`; module-specific material lives under `<module>/docs/`. Tool-discovered instruction files (`AGENTS.md` and `.github/*.md`) are the only exceptions.

The former top-level `artifacts/`, `new/`, `sow/`, and `presentation-scripts/` documentation folders were removed. Their source documents now live in categorized root `docs/` folders.

## Local Summaries

| Summary | Source scope | Source docs |
|---------|--------------|------------:|
| [Agent instructions](./agent/AGENT-DOCS-SUMMARY.md) | `AGENTS.md`, `.github/*.md` | 3 |
| [Root README](./ROOT-DOCS-SUMMARY.md) | `docs/README.md` | 1 |
| [Backend](../backend/docs/DOCS-SUMMARY.md) | `backend/docs/**/*.md` | 13 |
| [Deprecated providers and sandboxes](../deprecated/docs/DOCS-SUMMARY.md) | `deprecated/docs/**/*.md` | 23 |
| [Project-wide docs](./DOCS-SUMMARY.md) | `docs/**/*.md`, excluding project-brain and repository summary/index files | 91 |
| [Evolution](../evolution/docs/DOCS-SUMMARY.md) | `evolution/docs/README.md` | 1 |
| [Frontend](../frontend/docs/DOCS-SUMMARY.md) | `frontend/docs/**/*.md` | 5 |
| [Active Instawards](../docs/insta-awards/docs/DOCS-SUMMARY.md) | `docs/insta-awards/docs/**/*.md` | 27 |
| [Historical Instawards](../insta-awards-old/docs/DOCS-SUMMARY.md) | `insta-awards-old/docs/**/*.md` | 30 |
| [Manual tests](../manual-tests/docs/DOCS-SUMMARY.md) | `manual-tests/docs/*.md` | 3 |
| [Notion exports](../notion/docs/DOCS-SUMMARY.md) | `notion/docs/*.md` | 2 |
| [Telegram](../telegram/docs/DOCS-SUMMARY.md) | `telegram/docs/README.md` | 1 |
| Legacy final presentation | `final/docs/*.md` | 1 |
| **Total source docs summarized** | | **201** |

The current non-project-brain scan contains **250 Markdown files**: 201 source documents, 13 distributed summary/index files, and 36 redirect stubs at old Markdown paths. Redirect stubs contain no source documentation; they only point to the matching `docs/` location.

## Root Docs Categories

| Folder | Content |
|--------|---------|
| `docs/agent/` | Agent evals, structured tools, prompt context, and agent docs summary |
| `docs/architecture/` | Architecture, technical stack, conversion matrix, and historical PIX/ACH design |
| `docs/business/` | Executive summary, GTM, market economics, fees, business description, and strategy |
| `docs/compliance/` | Yield APY and yield compliance guidance |
| `docs/funding/` | Active Instawards SOW and consolidated SOW archive under `docs/funding/sow/` |
| `docs/integrations/` | Etherfuse, regional starter pack, and Defindex integration notes |
| `docs/operations/` | Env, migrations, Railway, Evolution, Telegram, balance, and runbook-style guides |
| `docs/planning/` | Project TODO and planning notes |
| `docs/presentations/` | Pitch, demo, and presentation scripts |
| `docs/product/` | UX, invisible wallet, no-mocks plan, and product upgrade notes |
| `docs/qa-session-logs/` | QA session logs and user-flow smoke tests |
| `docs/reference/` | Current feature documentation index |
| `docs/research/` | Dated scans, feature-state audits, refactor scans, and research evidence |
| `docs/security/` | Security scans, hardening, custody, passkeys, email confirmation, and OpenZeppelin notes |
| `docs/settlement/` | BRL/USD rail, Wise-era settlement plans, and institutional settlement docs |
| `docs/stellar/` | Stellar mainnet, wallet console, and BRL-like asset documentation |

## Freshness Order

1. Live code and migrations.
2. Current project-brain documents.
3. Active module docs, especially `docs/insta-awards/docs/deliverable-1/`, `docs/insta-awards/docs/deliverable-2/`, and `docs/insta-awards/docs/deliverable-3/`.
4. Categorized root `docs/` source documents.
5. Dated scans, historical grant packages, `insta-awards-old/`, and `deprecated/` material.

## Confirmed Conflicts

- `docs/funding/sow/SOW_inital.md` is superseded by the active Instawards SOW documents.
- `docs/operations/session-env-and-migrations.md` overlaps with `docs/operations/SESSION_ENV_AND_MIGRATIONS_20260525.md`; prefer the dated `SESSION_ENV_AND_MIGRATIONS_20260525.md` version unless code proves otherwise.
- `insta-awards-old/docs/` is superseded by `docs/insta-awards/docs/deliverable-1/`, `docs/insta-awards/docs/deliverable-2/`, and `docs/insta-awards/docs/deliverable-3/` for current reviewer evidence and implementation status.
- Deprecated Bridge, Twilio, and regional starter pack docs do not describe current runtime behavior.
