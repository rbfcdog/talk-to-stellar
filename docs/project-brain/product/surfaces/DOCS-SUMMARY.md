# Documentation Summary: project-brain/product/surfaces

Generated summary for `docs/project-brain/product/surfaces`. Last generated: 2026-06-22.

## Markdown Files

| File | Title | Words | Summary | Language note |
|------|-------|-------|---------|---------------|
| [`admin-transactions-dashboard.md`](./admin-transactions-dashboard.md) | Admin Transactions Dashboard — Surface Audit | 383 | Read-only operational console for the D1 normalized transfer lifecycle. Covers every state in `TransferStateMachine.STATES`; backend `/ops` details now live in the dedicated ops dashboard docs. | English or mostly English. |
| [`bridge-test.md`](./bridge-test.md) | Bridge Test Page — Surface Audit | 445 | Operator-only Bridge mainnet test console for onboarding, wallets, virtual accounts, activity, balances, liquidation addresses, and transfers. Documents the `/api/bridge` proxy, `x-bridge-path` routing, fixed #58 VA wire-balance visibility, fixed #59 Bridge `/history` provider-path drift, and the VA balance endpoint. | English or mostly English. |
| [`investments-page.md`](./investments-page.md) | Investments Page — Surface Audit | 172 | **Performance math wrong** (#11): ✅ Fixed by `dcec791` — `analyzePortfolioPeriod` subtracts `cashflowChange` from raw change (deposits/withdrawals excluded) **Charts need work** (#12): ✅ Fixed by `d4b1d98` — weekly/monthly toggle added, `ChartWindow` type with... | English or mostly English. |
| [`key-integrations.md`](./key-integrations.md) | Key Integrations Page — Surface Audit | 853 | Compact end-to-end test panel for the current SCF key integrations: Freighter, Blend v2, and Soroswap. Documents the same-origin `/api/[...path]` proxy path, fixed #53 watcher/proxy failure, fixed #54 Soroswap quote fallback, fixed #56 Freighter sign/submit flow, fixed #57 stream-rate-limit handling, fixed #60 executable path-payment fallback, and the scoped removal of older panels. | English or mostly English. |
| [`landing-page.md`](./landing-page.md) | Landing Page — Surface Audit | 204 | The active homepage is `frontend/app/page.tsx`, which uses `frontend/components/landing-reluca/`. The email form is embedded in the CTA via `frontend/components/landing-reluca/EarlyAccessSignup.tsx`. | English or mostly English. |
| [`ops-dashboard.md`](./ops-dashboard.md) | Ops Dashboard - Surface Audit | 1007 | Backend `/ops` now uses centralized dashboard tokens, quiet top actions, compact positive metric cards, a clean filter strip, printable ledger styling, in-place refresh, responsive rows, and transfer forensic detail rendering. Live list screenshots were captured; final same-transfer detail screenshots remain pending. | English or mostly English. |
| [`ops-dashboard-components.md`](./ops-dashboard-components.md) | Ops Dashboard Components | 344 | Component inventory for the backend ops dashboard: cards, badges, StatusPill, table, buttons, top-nav tabs, tooltips, empty state, refresh loading state, toast, CopyButton, modal/drawer foundation, and JSON block rules. | English or mostly English. |
| [`web-conversion-screen.md`](./web-conversion-screen.md) | Web Conversion Screen — Surface Audit | 305 | Conversion surface audit covering fixed screen close, visual consistency, and asset-specific insufficient-balance copy, plus open quote drift, mobile length, Continue-button, language-toggle, empty-balance, and back-navigation issues. | English or mostly English. |
| [`whatsapp-bot.md`](./whatsapp-bot.md) | WhatsApp Bot — Surface Audit | 168 | **"Summary:" banned** (#2): ✅ Fixed by `f24d6f1` — `stripUserFacingSummaryLabels()` strips "Summary:"/"Resumo:" from all messages **Send blocked by contacts** (#6): ✅ Fixed by `9106c6a` — resolves recipients from wallets table before contacts | English or mostly English. |

## Notes

- This file is an English index summary for the folder. It does not replace the source documents.
- Source files that still contain Portuguese are marked in the language note column for follow-up translation.
- Generated summaries intentionally skip `DOCS-SUMMARY.md` to avoid recursive noise.
