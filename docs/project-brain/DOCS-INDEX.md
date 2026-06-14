# DOCS-INDEX.md — Documentation Inventory

> **Living document.** Updated when docs are found, moved, created, or become stale.

Generated 2026-06-12. Updated 2026-06-13 after documentation consolidation.

Current scan: **250 non-project-brain Markdown files**: 201 source documents, 13 distributed summary/index files, and 36 redirect stubs. Legend: ✅ current ⚠️ stale ❌ superseded ⚡ contradicts-code

Primary index: `docs/REPOSITORY-DOCS.md`.

## Consolidation Notes

The former top-level documentation folders were removed:

- `artifacts/`
- `new/`
- `sow/`
- `presentation-scripts/`

Their source documents now live under categorized root `docs/` folders:

- Business artifacts: `docs/business/`
- SOWs: `docs/funding/sow/`
- Presentation scripts: `docs/presentations/`
- Miscellaneous staged guides: `docs/operations/`, `docs/security/`, `docs/product/`, `docs/integrations/`, `docs/compliance/`, and `docs/architecture/`

## Distributed Repository-Doc Summaries

| Source family | Summary |
|---------------|---------|
| Primary index | `docs/REPOSITORY-DOCS.md` |
| Agent and Copilot instructions | `docs/agent/AGENT-DOCS-SUMMARY.md` |
| Root README | `docs/ROOT-DOCS-SUMMARY.md` |
| Backend | `backend/docs/DOCS-SUMMARY.md` |
| Deprecated providers and sandboxes | `deprecated/docs/DOCS-SUMMARY.md` |
| Project-wide `docs/` directory | `docs/DOCS-SUMMARY.md` |
| Evolution | `evolution/docs/DOCS-SUMMARY.md` |
| Frontend | `frontend/docs/DOCS-SUMMARY.md` |
| Active Instawards | `docs/insta-awards/docs/DOCS-SUMMARY.md` |
| Historical Instawards | `insta-awards-old/docs/DOCS-SUMMARY.md` |
| Manual tests | `manual-tests/docs/DOCS-SUMMARY.md` |
| Notion exports | `notion/docs/DOCS-SUMMARY.md` |
| Telegram | `telegram/docs/DOCS-SUMMARY.md` |

## Root And Agent Setup

| File | Description | Freshness |
|------|-------------|-----------|
| `README.md` | Product overview, business thesis, architecture summary, local run commands | ✅ Current positioning; verify feature claims in code |
| `AGENTS.md` | Repo-local AI agent rules and project-brain workflow | ✅ Current |
| `.github/COPILOT_SETUP.md` | Copilot setup and writing/backend guidance | ✅ Current for assistant setup |
| `.github/copilot-instructions.md` | Copilot project instructions | ✅ Current for assistant setup |

## Project-Wide Docs Categories

| Folder | Description | Freshness |
|--------|-------------|-----------|
| `docs/agent/` | Agent evals, structured tools, real fees, and prompt context | ✅ Current; verify dated eval claims |
| `docs/architecture/` | Architecture, technical stack, conversion matrix, and historical PIX/ACH design | ⚠️ Some files predate current orchestration |
| `docs/business/` | Executive summary, GTM, market economics, fee model, and business strategy | ✅ Current business context; verify feature claims in code |
| `docs/compliance/` | Yield APY and compliance guidance | ✅ Current as policy notes; not legal advice |
| `docs/funding/` | Active Instawards SOW and SOW archive under `docs/funding/sow/` | ✅ Current scope reference |
| `docs/integrations/` | Etherfuse, regional starter pack, and Defindex notes | ⚠️ Regional starter pack is historical |
| `docs/operations/` | Env, migrations, Railway, Evolution, Telegram, balance, and operator guides | ✅ Current where dated; verify env names in code |
| `docs/planning/` | TODO and planning notes | ⚠️ Check against current code before using as backlog |
| `docs/presentations/` | Pitch deck, user demo, and presentation script | ⚠️ Presentation material may lag implementation |
| `docs/product/` | UX audits, no-mocks plan, invisible wallet, and upgrade roadmap | ✅ Product guidance; dated audits remain snapshots |
| `docs/qa-session-logs/` | QA session logs and user-flow smoke tests | ⚠️ Historical runs should be rerun before claiming pass |
| `docs/reference/` | Current feature documentation index | ✅ Current index; verify links after moves |
| `docs/research/` | Dated scans, mock inventory, feature-state review, refactor scans, folder-reorg notes | ⚠️ Historical snapshots |
| `docs/security/` | Security audits, hardening, custody, passkeys, email confirmation, OpenZeppelin notes | ✅ Security context; verify fixed findings in code |
| `docs/settlement/` | BRL/USD rail, institutional settlement, operator runbook, Wise-era plans | ⚠️ Wise-era docs are historical |
| `docs/stellar/` | Stellar mainnet, user wallet console, and BRL-like asset strategy | ✅ Current as infrastructure context |

## Active Instawards

| File | Description | Freshness |
|------|-------------|-----------|
| `docs/insta-awards/docs/deliverable-1/` | D1 implementation plan, migrations, status, runs, and evidence | ⚠️ Active; final same-transfer real testnet evidence still pending |
| `docs/insta-awards/docs/deliverable-2/README.md` | D2 USD payout coordination scope, Circle foundation status, and evidence checklist | ⚠️ Active; Circle sandbox/evidence still pending |
| `docs/insta-awards/docs/deliverable-3/` | D3 institutional settlement demo foundation, walkthrough, setup, screenshot/video plans, and reviewer package | ⚠️ Active; final video/screenshots/same-transfer evidence pending |

## Backend Docs

| File | Description | Freshness |
|------|-------------|-----------|
| `backend/docs/CIRCLE_INTEGRATION_SETUP.md` | Circle Mint sandbox/API key setup, linked bank destination ID setup, backend env, sandbox execution, webhook intake, production gate, troubleshooting | ✅ Current |
| `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md` | Circle Mint payout adapter foundation, env vars, routes, evidence rules, official API references | ✅ Current |
| `backend/docs/README.md` | Backend entry point, env, migration, and folder-map guide | ✅ Current |
| `backend/docs/**/*.md` | Onboarding, PIN, path payment, tests, migration notes, agent backlog | ✅ See `backend/docs/DOCS-SUMMARY.md` |

## Other Module Docs

| Folder | Description | Freshness |
|--------|-------------|-----------|
| `frontend/docs/` | Frontend onboarding, architecture, review, and TDD references | ✅ Current |
| `telegram/docs/` | Telegram bot implementation and setup | ✅ Current |
| `evolution/docs/` | Evolution/WhatsApp operations | ✅ Current |
| `manual-tests/docs/` | Manual QA and benchmark guides | ✅ Current checklist; rerun historical results |
| `notion/docs/` | Notion-export guides | ✅ Current |
| `deprecated/docs/` | Historical Bridge, Twilio, and sandbox docs | ❌ Historical/provider experiments |
| `insta-awards-old/docs/` | Historical Instawards prep package | ❌ Superseded by active Instawards docs |
| `final/docs/` | Historical final presentation copy | ⚠️ Historical |

## Key Current SOW Files

| File | Description | Freshness |
|------|-------------|-----------|
| `docs/funding/INSTAWARDS_SOW.md` | Instawards Statement of Work | ✅ Current active grant scope |
| `docs/funding/sow/SOW_brl_stellar_usd_bank_payout_20260519.md` | BRL→Stellar→USD bank payout SOW | ✅ Current scope reference |
| `docs/funding/sow/SOW_instawards_submission_brl_usd_rail_20260520.md` | Instawards BRL/USD rail submission | ✅ Current active submission |
| `docs/funding/sow/SOW_current_project_state_20260519.md` | Project-state snapshot at SOW time | ⚠️ Historical |
| `docs/funding/sow/SOW_inital.md` | Original SOW | ❌ Superseded |

## Contradictions Found

1. **`docs/funding/sow/SOW_inital.md` vs `docs/funding/INSTAWARDS_SOW.md` vs `docs/funding/sow/SOW_instawards_submission_brl_usd_rail_20260520.md`**: The initial SOW has a different scope from the Instawards submission. The code follows the Instawards SOW: orchestration engine, payout routing, reconciliation.
2. **`docs/operations/session-env-and-migrations.md` vs `docs/operations/SESSION_ENV_AND_MIGRATIONS_20260525.md`**: Both cover session env and migrations. Prefer the dated `SESSION_ENV_AND_MIGRATIONS_20260525.md` version unless code proves otherwise.
3. **`insta-awards-old/` vs `docs/insta-awards/`**: The old folder was a pre-deliverable preparation. Current work is under `docs/insta-awards/docs/deliverable-1/`, `deliverable-2/`, and `deliverable-3/`.
4. **Historical migration references vs current schema source**: Historical audits and run reports can name retired migration files. The current bootstrap source is `backend/migrations/20260613_00_full_schema.sql`; `backend/migrations/20260614_00_ops_admin_auth.sql` is the current incremental ops-login migration and the runner applies required SQL files in sorted order.

## Stats

- **Total non-project-brain Markdown files scanned**: 250
- **Source documents summarized**: 201
- **Distributed summary/index files**: 13
- **Old-path redirect stubs**: 36
- **Primary current summary index**: `docs/REPOSITORY-DOCS.md`
- **Compatibility entry point**: `docs/project-brain/NON-PROJECT-BRAIN-DOCS-SUMMARY.md`
