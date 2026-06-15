# Screenshot Shot List — Deliverable 3

Each screenshot maps to a specific URL and shows specific evidence of the transfer routing demonstration.

---

## Shot 1: Ops Dashboard with Metrics and Table

**URL**: `http://localhost:3333/ops` (or deployed `/ops`)

**What it must show**:
- [x] 5 metric cards with actual values (not zeros): Transfers today, BRL to USDC today, In flight, Needs attention, Admin fees
- [x] Source filter set to "D1 lifecycle" (`source=transfers`)
- [x] Table with at least 3 rows, sorted by Created descending
- [x] At least one row with a status pill showing "Reconciled" (green) or "Stellar settled" (green)
- [x] At least one row with an active status (amber) — e.g., "Converting" or "Routing"
- [x] Amount chain visible (R$ XXX.XX → USDC XXX.XX)
- [x] Status legend visible at the bottom of the filter section
- [x] Environment badge showing "TESTNET" in the topbar

**How to capture**:
1. Navigate to `/ops?source=transfers` in your browser
2. Ensure the browser viewport is 1440×900 or wider
3. Wait for the "Updated" indicator to show a relative time (confirms data loaded)
4. Take a full-page screenshot showing metrics + table (at least 3 rows)

**Alternative via Playwright** (from `instawards-evidence.mjs`):
```bash
npm run instawards:evidence -- \
  --dashboard-url=http://localhost:3000 \
  --transfer-id=<uuid>
```
The Playwright script captures `insta-awards/evidence-runs/<run-id>/screenshots/dashboard-week-1.png`.

---

## Shot 2: Transfer Detail — Full Lifecycle

**URL**: `http://localhost:3333/ops/transfers/<transfer-uuid>`

**What it must show**:
- [x] Hero section with public_ref, status pill (preferably "Reconciled"), TESTNET badge
- [x] Amount summary: BRL in → USDC settled → USD out
- [x] Transfer metadata: ID, Created, Updated, State version
- [x] 9-stage rail with GREEN circles for completed stages (CREATED through RECONCILED)
- [x] Lifecycle timeline with 9 `<li>` events:
  - Each showing: from_state → to_state, event_type, actor badge, correlation_id, timestamp
  - At least one event expanded showing the payload JSON
- [x] Right sidebar: Reconciliation panel (green "Amounts matched" banner)
- [x] Right sidebar: Evidence & links panel with stellar.expert link, PIX e2e id, PIX charge id, Payout reference

**How to capture**:
1. From the dashboard table, click a reference link for a RECONCILED transfer
2. Scroll down to show the full timeline (from CREATED to RECONCILED)
3. Expand one event payload (click `<details>` → shows JSON)
4. Scroll to position the reconciliation panel in view alongside the timeline
5. Take a screenshot showing timeline + reconciliation panel together

**Alternative**: Direct URL access with token:
```
http://localhost:3333/ops/transfers/<uuid>?token=dev-ops-token
```

---

## Shot 3: Stellar Expert Transaction Page

**URL**: `https://stellar.expert/explorer/testnet/tx/<transaction-hash>`

**What it must show**:
- [x] Transaction hash (matching the one shown in the transfer detail evidence panel)
- [x] "Successful" status
- [x] Operation count and ledger number
- [x] Source account (masked in our system, visible on explorer)
- [x] Payment operation(s) showing asset code (USDC or BRL)
- [x] "Testnet" indicator in the explorer header

**How to capture**:
1. From the transfer detail page, click the stellar.expert link in the Evidence & links panel
2. Wait for the page to load the transaction details
3. Take a screenshot of the transaction overview (first fold)

---

## Shot 4: Reconciliation Panel (Close-Up)

**URL**: Same as Shot 2 — scroll to the reconciliation section

**What it must show**:
- [x] "Amounts matched" green banner with "No discrepancies recorded"
- [x] Amounts match: Yes
- [x] Reconciled by: system
- [x] Reconciled at: ISO timestamp
- [x] Fee breakdown table showing all fee items (label, amount in currency)
- [x] Discrepancies: "None"

**How to capture**:
1. From the transfer detail page, scroll so the reconciliation panel fills most of the viewport
2. Ensure all fee items are visible (if more than 3, use a scrolling capture or zoom out)
3. Take a close-up screenshot of just the reconciliation panel

---

## Shot 5: Evidence & Links Panel + Raw JSON Record

**URL**: Same as Shot 2 — scroll to evidence panel and raw JSON

**What it must show**:
- [x] Stellar tx hash (truncated, with copy button)
- [x] Stellar.expert link (visible as clickable link with ↗)
- [x] PIX e2e ID or txid
- [x] PIX charge ID
- [x] Payout reference ID or routing status
- [x] Receipt link (or "No receipt link available" if not generated)
- [x] Below: "Raw Transfer Record" `<details>` expanded showing syntax-highlighted JSON
  - All evidence fields visible: quote, pix, stellar, payout, reconciliation
  - Events array visible with all lifecycle events
  - Masked identifiers (e.g., `***1234`, `legacy:***abcd`)

**How to capture**:
1. Scroll to bottom of transfer detail page
2. Expand the "Raw Transfer Record" details element
3. Scroll enough to show the full JSON (or capture multiple scroll positions)
4. Ensure the evidence panel is visible above the JSON block
5. Take a screenshot showing evidence panel + raw JSON

---

## Summary Checklist

| # | Shot | URL | Required State |
|---|---|---|---|
| 1 | Dashboard + metrics | `/ops?source=transfers` | ≥3 transfers, mixed states |
| 2 | Transfer detail + timeline | `/ops/transfers/:id` | RECONCILED transfer |
| 3 | Stellar expert tx | `stellar.expert/explorer/testnet/tx/:hash` | Valid testnet tx hash |
| 4 | Reconciliation panel | `/ops/transfers/:id` (scroll) | RECONCILED transfer |
| 5 | Evidence links + raw JSON | `/ops/transfers/:id` (scroll) | RECONCILED transfer |

---

## Capture Settings

- **Viewport**: 1440×900 minimum
- **Theme**: Dark (built-in to the dashboard CSS)
- **Format**: PNG
- **Naming**: `shot-01-dashboard.png`, `shot-02-transfer-detail.png`, `shot-03-stellar-expert.png`, `shot-04-reconciliation.png`, `shot-05-evidence-raw-json.png`
- **Location**: Save to `insta-awards/deliverable-3/screenshots/`
