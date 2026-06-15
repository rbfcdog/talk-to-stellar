# Project Brain — TalkToStellar

Central documentation hub. Everything a new engineer needs to understand the project, diagnose failures, and avoid known pitfalls.

## File Index

| File | Read when... |
|------|-------------|
| [OVERVIEW.md](./OVERVIEW.md) | You're new. Start here. |
| [MAINTAINER-GUIDE.md](./MAINTAINER-GUIDE.md) | You're an AI agent or developer updating docs after a bug/fix/change. |
| [DOCS-INDEX.md](./DOCS-INDEX.md) | You need to find which doc covers X. |
| [NON-PROJECT-BRAIN-DOCS-SUMMARY.md](./NON-PROJECT-BRAIN-DOCS-SUMMARY.md) | You need the entry point for Markdown docs outside project-brain. |
| [PAIN-POINTS.md](./PAIN-POINTS.md) | Something broke. Check if it's a known pattern. |
| [OPEN-ISSUES.md](./OPEN-ISSUES.md) | You want the actionable backlog (20 fixed, 22 open). |

### Distributed Repository Documentation Summaries
| File | Read when... |
|------|-------------|
| [../REPOSITORY-DOCS.md](../REPOSITORY-DOCS.md) | You need the root index for all Markdown outside project-brain. |
| [../../docs/agent/AGENT-DOCS-SUMMARY.md](../agent/AGENT-DOCS-SUMMARY.md) | You need repository AI-agent and Copilot instruction context. |
| [../ROOT-DOCS-SUMMARY.md](../ROOT-DOCS-SUMMARY.md) | You need the root README summary and freshness rule. |
| [../../backend/docs/DOCS-SUMMARY.md](../../backend/docs/DOCS-SUMMARY.md) | You need a map of backend-specific documentation. |
| [../../backend/docs/CIRCLE_INTEGRATION_SETUP.md](../../backend/docs/CIRCLE_INTEGRATION_SETUP.md) | You need to set up Circle Mint sandbox/API keys, linked bank destination IDs, payout env vars, webhooks, or production gates. |
| [../../deprecated/docs/DOCS-SUMMARY.md](../../deprecated/docs/DOCS-SUMMARY.md) | You are investigating historical Bridge, Twilio, or regional starter pack docs. |
| [../DOCS-SUMMARY.md](../DOCS-SUMMARY.md) | You need the grouped summary for categorized project-wide docs. |
| [../../evolution/docs/DOCS-SUMMARY.md](../../evolution/docs/DOCS-SUMMARY.md) | You need the Evolution/WhatsApp operations-doc summary. |
| [../../frontend/docs/DOCS-SUMMARY.md](../../frontend/docs/DOCS-SUMMARY.md) | You need frontend onboarding, architecture, review, or TDD doc context. |
| [../../docs/insta-awards/deliverables/DOCS-SUMMARY.md](../../docs/insta-awards/deliverables/DOCS-SUMMARY.md) | You need the active Instawards deliverables summary. |
| [../../docs/insta-awards/deliverables/deliverable-2/README.md](../../docs/insta-awards/deliverables/deliverable-2/README.md) | You need the D2 Circle/Bridge payout coordination foundation and evidence checklist. |
| [../../docs/insta-awards/deliverables/deliverable-3/README.md](../../docs/insta-awards/deliverables/deliverable-3/README.md) | You need the institutional settlement flow demo, technical walkthrough, setup, screenshot/video, or reviewer package foundation. |
| [../../insta-awards-old/docs/DOCS-SUMMARY.md](../../insta-awards-old/docs/DOCS-SUMMARY.md) | You need historical Instawards audit or evidence context. |
| [../../manual-tests/docs/DOCS-SUMMARY.md](../../manual-tests/docs/DOCS-SUMMARY.md) | You need the manual QA and benchmark-doc summary. |
| [../../notion/docs/DOCS-SUMMARY.md](../../notion/docs/DOCS-SUMMARY.md) | You need the Notion-export doc summary. |
| [../../telegram/docs/DOCS-SUMMARY.md](../../telegram/docs/DOCS-SUMMARY.md) | You need the Telegram implementation-doc summary. |

### Architecture
| File | Read when... |
|------|-------------|
| [architecture/SYSTEM-MAP.md](./architecture/SYSTEM-MAP.md) | You need the module map and component diagram. |
| [architecture/DATA-MODEL.md](./architecture/DATA-MODEL.md) | You're adding a table or querying the DB. |
| [architecture/MONEY-FLOWS.md](./architecture/MONEY-FLOWS.md) | You need to trace a transaction end-to-end. |
| [architecture/INTEGRATIONS.md](./architecture/INTEGRATIONS.md) | You're debugging Etherfuse/Stellar/NLU/auth. |
| [architecture/deep-dives/quote-engine.md](./architecture/deep-dives/quote-engine.md) | Quote drift / fee bugs appear. |
| [architecture/deep-dives/state-machines.md](./architecture/deep-dives/state-machines.md) | Flow state bugs (wrong status, stuck transitions). |

### Operations
| File | Read when... |
|------|-------------|
| [operations/ENVIRONMENTS.md](./operations/ENVIRONMENTS.md) | You need to set up local/testnet/prod. |
| [operations/RUNBOOK.md](./operations/RUNBOOK.md) | Production is down or a specific error appears. |
| [operations/ADMIN.md](./operations/ADMIN.md) | You need the ops dashboard, admin wallet, or receipts. |
| [operations/incidents/rota-2-4-stall.md](./operations/incidents/rota-2-4-stall.md) | "rota calculada 2/4 — operação parou". |
| [operations/incidents/duplicate-receipts.md](./operations/incidents/duplicate-receipts.md) | 2 comprovantes for 1 on-ramp. |
| [operations/forensics/orchestration-logs.md](./operations/forensics/orchestration-logs.md) | You need orchestration event log reference/schema. |
| [operations/forensics/transfer-record-example.md](./operations/forensics/transfer-record-example.md) | You need a full transfer record template to copy. |

### Product
| File | Read when... |
|------|-------------|
| [product/UX-PRINCIPLES.md](./product/UX-PRINCIPLES.md) | You're designing a new screen or flow. |
| [product/COPY-GUIDE.md](./product/COPY-GUIDE.md) | You're writing user-facing text. |
| [product/I18N.md](./product/I18N.md) | Language is wrong or you're adding a new surface. |
| [product/surfaces/landing-page.md](./product/surfaces/landing-page.md) | Landing page or early-access email list issues. |
| [product/surfaces/whatsapp-bot.md](./product/surfaces/whatsapp-bot.md) | WhatsApp bot issues. |
| [product/surfaces/web-conversion-screen.md](./product/surfaces/web-conversion-screen.md) | Conversion/send UI issues. |
| [product/surfaces/investments-page.md](./product/surfaces/investments-page.md) | Investment/vault page issues. |
| [product/surfaces/ops-dashboard.md](./product/surfaces/ops-dashboard.md) | Backend `/ops` ledger and transfer forensic detail issues. |
| [product/surfaces/ops-dashboard-components.md](./product/surfaces/ops-dashboard-components.md) | Backend `/ops` component primitives, status system, and extension rules. |
| [product/surfaces/admin-transactions-dashboard.md](./product/surfaces/admin-transactions-dashboard.md) | Frontend admin transfer lifecycle dashboard issues. |

### History
| File | Read when... |
|------|-------------|
| [history/TIMELINE.md](./history/TIMELINE.md) | You need context on project evolution. |
| [history/LESSONS.md](./history/LESSONS.md) | You want the distilled engineering rules (A–H). |
| [history/decisions/001-etherfuse-pix.md](./history/decisions/001-etherfuse-pix.md) | Why Etherfuse for PIX on-ramp. |
| [history/decisions/002-whatsapp-first.md](./history/decisions/002-whatsapp-first.md) | Why WhatsApp was the first surface. |

### Funding
| File | Read when... |
|------|-------------|
| [funding/GRANTS.md](./funding/GRANTS.md) | You need grant status, deliverables, deadlines. |
| [funding/instaward-1.md](./funding/instaward-1.md) | Instaward #1 detail. |
| [funding/scf-build.md](./funding/scf-build.md) | Stellar Community Fund build detail. |

## How to keep this updated

This is a **living document system**. See [MAINTAINER-GUIDE.md](./MAINTAINER-GUIDE.md) for the full workflow.

Quick rules:
1. After any significant code change, update the relevant file(s).
2. After fixing a bug from PAIN-POINTS.md, mark it as fixed with the commit hash.
3. After adding a new surface/flow, add it to OVERVIEW.md surfaces list.
4. After a new grant/deliverable, update funding/GRANTS.md.
5. Run `git log --oneline --since="1 week ago"` and scan for things that belong here.
6. **Every AI agent working on this project must follow MAINTAINER-GUIDE.md.**

## Quick links

- Repo: `https://github.com/anomalyco/talk-to-stellar`
- Stellar testnet explorer: `https://stellar.expert/explorer/testnet/`
- Supabase: `https://nvidjphdzkujrjncjcbz.supabase.co`
- Etherfuse sandbox: `https://api.sand.etherfuse.com`
