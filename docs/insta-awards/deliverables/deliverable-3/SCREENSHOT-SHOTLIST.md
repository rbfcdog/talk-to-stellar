# Screenshot Shot List

All final screenshots must reference the same transfer. Use `evidence/screenshots/` for final image files.

## Required Screenshots

| File | Screen | What reviewers should see |
|------|--------|---------------------------|
| `01-institution-settlement-overview.png` | `/institution-settlement` overview | BRL -> USDC -> USD flow, selected transfer, evidence cards. |
| `02-quote-and-transfer.png` | Quote/transfer panel | BRL input, USD estimate, fee breakdown, transfer ID. |
| `03-pix-funding.png` | PIX funding step | PIX order or mock label, funding state, no exposed secrets. |
| `04-stellar-settlement.png` | Stellar settlement step | settlement mode, `stellar_tx_hash` when real/testnet exists, amount and asset. |
| `05-payout-coordination.png` | Payout tab/panel | provider, execution mode, payout instruction ID, status history. |
| `06-reviewer-evidence.png` | Reviewer evidence/export area | evidence checklist and export button or JSON preview. |
| `07-ops-dashboard-list.png` | `/ops?source=transfers` | normalized transfer row, public reference, current state. |
| `08-ops-dashboard-detail.png` | `/ops` transfer detail | lifecycle timeline, reconciliation panel, raw transfer record. |
| `09-admin-transactions.png` | `/admin/transactions` | operational admin view for the same transfer. |
| `10-json-evidence-folder.png` | local evidence folder or terminal | captured JSON files for workflow, reviewer evidence, payout evidence, orchestration log, reconciliation. |

## Optional Screenshots

| File | Screen | Use when |
|------|--------|----------|
| `11-circle-provider-capabilities.png` | API response or terminal output for `/api/transfers/payout-providers` | Showing Circle compatibility/sandbox readiness. |
| `12-stellar-explorer.png` | Stellar explorer transaction page | A real Stellar testnet hash exists. |
| `13-circle-dashboard.png` | Circle sandbox console or API response | Circle sandbox payout execution exists and sensitive values are redacted. |

## Capture Rules

- Do not show API keys, tokens, private keys, PINs, full account numbers, or full routing numbers.
- If the run is mock or compatibility mode, keep the label visible in the screenshot.
- Keep browser zoom at 100 percent unless text does not fit.
- Use a desktop viewport around `1440x1000` for overview and dashboard screenshots.
- Use one mobile viewport only if reviewers need mobile evidence.
- Name files with the numeric prefix so the narrative order is obvious.

## Screenshot Review Checklist

Before adding screenshots to the final package:

- Same transfer ID appears across the set.
- Stellar screenshot either shows a real hash or visible mock/compatibility labeling.
- Payout screenshot either shows Circle sandbox/provider evidence or visible compatibility labeling.
- No secrets are visible in URL query strings, headers, terminal history, or JSON payloads.
- Evidence JSON paths in screenshots match `REVIEWER-PACKAGE.md`.
