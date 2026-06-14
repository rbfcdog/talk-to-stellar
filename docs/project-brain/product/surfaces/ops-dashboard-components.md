# Ops Dashboard Components

> **Living component inventory.** Source is `backend/src/api/views/ops-dashboard.view.ts`.

## Primitives

| Primitive | Implementation |
|-----------|----------------|
| Card / panel | `.metric-card`, `.controls-shell`, `.table-shell`, `.panel`, `.detail-hero` |
| Badge | `renderBadge()` and `.ops-badge` tones |
| StatusPill | `renderStatusPill()` with dot + label + semantic tone |
| Table | `renderTable()` with sticky desktop header and stacked mobile rows |
| Button | `.button`, `.button-primary`, `.button-secondary`, `.button-disabled` |
| Tabs / segmented control | `.top-nav` ledger/forensics control |
| Tooltip | native `title` on timestamps, hashes, stage rail, and copy controls |
| EmptyState | `renderEmptyState()` |
| Skeleton / loading | `.table-shell.is-loading` refresh overlay |
| Toast | `.toast-region` and `toast()` in the page script |
| CopyButton | `renderCopyButton()` with clipboard API and toast confirmation |
| Drawer / modal foundation | `.ops-modal`, `.ops-drawer` classes reserved for future forensic drawers |
| JSON block | `renderJsonBlock()` with syntax-highlighted, copyable JSON |

## Rules

- Use `renderStatusPill()` everywhere a transfer or ledger state is displayed.
- Use `mono` for public refs, IDs, hashes, amounts, timestamps, and JSON.
- Use the CSS variables in the `:root` token block only. Do not hardcode colors in component rules.
- Use 8px radius or less for dashboard UI.
- Keep list interactions keyboard accessible: table rows use `tabindex="0"` only when a detail route exists.
- Keep raw payloads collapsed unless the operator explicitly expands them.
- Preserve API-masked PII exactly as returned by the backend.

## Status Tones

| Tone | Meaning |
|------|---------|
| `status-neutral` | Created, quoted, passive |
| `status-info` | PIX charge issued |
| `status-active` | Money is moving or pending |
| `status-success` | Settled, instructed, reconciled, completed |
| `status-attention` | Failed, expired, refund, discrepancy, stuck |

## Extension Checklist

1. Add data as read-only normalization in `ops-history.repository.ts` if it comes from the ledger.
2. Add filtering/sorting/pagination behavior in `ops.controller.ts`.
3. Render with primitives in `ops-dashboard.view.ts`.
4. Update `ops-dashboard.md`, this component inventory, and the relevant run log.
5. Add or update focused tests in `backend/tests/ops.routes.test.ts` or `backend/tests/ops-history.repository.test.ts`.
