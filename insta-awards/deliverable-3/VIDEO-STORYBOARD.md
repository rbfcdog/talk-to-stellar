# Video Storyboard — 90-Second Demo Script

**Deliverable 3: End-to-End Transfer Routing Demonstration**
**Target duration**: 90 seconds
**Audience**: Stellar reviewer (knows blockchain, not this codebase)

---

## Scene 1: Dashboard Overview (0:00–0:22)

**Visual**: `/ops` dashboard page with metrics cards and transfer ledger table.
**Audio/Narration**: "This is the TalkToStellar operational dashboard. Here you can see every transfer that flows through the system. The metric cards show transfers today, BRL-to-USDC volume, in-flight transfers, items needing attention, and admin fees. The table below is a unified ledger pulling from four database sources: D1 lifecycle transfers, international transfers, operations, and payment logs."

**What to show on screen**:
1. Browser loads `http://localhost:3333/ops` (or deployed URL)
2. 5 metric cards animate in (Transfers today, BRL to USDC today, In flight, Needs attention, Admin fees)
3. Scroll down to the table showing rows with: Reference, Status (color-coded pills), Route (e.g., "D1 lifecycle transfer"), Amount chain (R$ → USDC/USD), Evidence (tx hash), Fee, Created, Updated
4. Hover cursor over a status pill to show meaning
5. Point out the `source=transfers` filter dropdown and status legend

**Technical walkthrough notes for reviewer**:
- Dashboard route: `GET /ops` → `ops.controller.ts:661 dashboard()`
- Metrics computed by `dashboardMetrics()` at `ops.controller.ts:515`
- Table populated by `OpsHistoryRepository.list()` which loads from 4 tables (`ops-history.repository.ts:377`)
- Each row maps through `mapTransfer()`, `mapInternationalTransfer()`, `mapOperation()`, `mapPaymentLog()`
- The `source` filter isolates D1 normalized records

---

## Scene 2: Transfer Detail — Lifecycle Timeline (0:22–0:45)

**Visual**: Click a transfer row, land on `/ops/transfers/:id` detail page.
**Audio/Narration**: "Clicking into a transfer opens the forensics view. At the top you see the public reference, current state, amounts — BRL in, USDC settled, USD out. Below that is the stage rail showing progress through the 9 primary stages. And here's the lifecycle timeline — every state transition recorded as an append-only event with actor, timestamp, and full payload. Notice the `poller:stellar` actor — that's the Stellar settlement watcher automatically confirming the Horizon transaction."

**What to show on screen**:
1. Click a row in the ledger table → navigate to `/ops/transfers/<uuid>`
2. Hero section: public_ref, status pill, TESTNET badge, amount summary (BRL in / USDC settled / USD out)
3. 9-stage rail: circles for CREATED→QUOTED→PIX_CHARGE_ISSUED→PIX_FUNDED→CONVERTING→STELLAR_SETTLED→PAYOUT_ROUTING→PAYOUT_INSTRUCTED→RECONCILED (done=green, active=amber)
4. Timeline below: ordered `<ol>` of events
5. Expand one event's "Payload" `<details>` to show JSON payload
6. Point out the `actor` badge — show `poller:stellar`, `webhook:etherfuse`, `system`
7. Point out the `correlation_id` linking events together

**Technical walkthrough notes for reviewer**:
- Detail route: `GET /ops/transfers/:id` → `ops.controller.ts:708 transferDetail()`
- Loads: `orchestrator.getTransferWithEvents(id)` → `transferRepository.getById()` + `transferRepository.getEvents()`
- Timeline rendering: `renderTimeline()` at `ops-dashboard.view.ts:689`
- Events are append-only: `transfer_events` table has `before update/delete` triggers that throw exceptions
- Stage rail: `renderStageRail()` at `ops-dashboard.view.ts:649`

---

## Scene 3: Reconciliation Panel (0:45–1:05)

**Visual**: Right sidebar panels on the transfer detail page.
**Audio/Narration**: "On the right, you'll find the reconciliation panel. It compares the BRL amount in against the USDC settled against the USD expected out. The green banner means amounts matched — no discrepancies. The fee breakdown shows the fee items from the quote. Below that is the evidence panel linking to the Stellar transaction on stellar.expert, the PIX e2e ID, charge ID, and payout reference."

**What to show on screen**:
1. Scroll to the right sidebar (reconciliation panel)
2. Green banner: "Amounts matched — No discrepancies recorded"
3. Fee breakdown table: rows for each fee item (label, amount, currency)
4. Discrepancies section: "None"
5. Evidence panel below: Stellar tx hash (with copy button), link to stellar.expert, PIX e2e id, PIX charge id, Payout reference
6. Click the stellar.expert link (opens new tab showing the testnet transaction)
7. Back to the dashboard, point out the receipt link

**Technical walkthrough notes for reviewer**:
- Reconciliation panel: `renderReconciliation()` at `ops-dashboard.view.ts:725`
- Evidence panel: `renderEvidencePanel()` at `ops-dashboard.view.ts:752`
- Stellar expert URL: `stellarExpertUrl()` at `ops-dashboard.view.ts:613`
- Reconciliation computed by `computeReconciliation()` in `TransferOrchestrator.ts:470`
- Uses `decimalAbsDiffWithin()` for decimal-safe amount comparison

---

## Scene 4: Raw JSON Record & Review (1:05–1:30)

**Visual**: Expanded raw JSON record at the bottom of the transfer detail page.
**Audio/Narration**: "Finally, for deep inspection, each transfer detail page includes the raw JSON record — collapsed by default — showing the complete transfer object with all evidence fields and every event in the lifecycle. This is what gets exported for reviewer evidence. Every field is redacted where needed — payer masks, account last-4 only, no secrets."

**What to show on screen**:
1. Scroll to bottom of transfer detail page
2. Click to expand "Raw Transfer Record" `<details>` element
3. Syntax-highlighted JSON block showing:
   - `transfer` object with all 13 fields (id, public_ref, state, state_version, source_endpoint, destination_endpoint, amount_brl_in, amount_usdc_settled, amount_usd_out_expected, quote, pix, stellar, payout, reconciliation)
   - `events` array with all lifecycle events
   - Masked identifiers (e.g., `"masked_identifier": "***1234"`)
4. Point out the `redaction` notes at the top
5. Show the copy button for exporting the raw JSON

**Technical walkthrough notes for reviewer**:
- Raw JSON render: `renderRawTransfer()` at `ops-dashboard.view.ts:768`
- JSON syntax highlighting: `syntaxHighlightJson()` at `ops-dashboard.view.ts:662`
- Evidence export script: `backend/scripts/export-transfer-record.ts`
- Evidence capture tool: `backend/scripts/instawards-evidence.mjs` → `npm run instawards:evidence`
- Redaction applied in export scripts (payout identifiers, PII, account numbers)

---

## Total: ~90 seconds

| Scene | Time | What |
|---|---|---|
| 1 | 0:00–0:22 | Dashboard overview: metrics + ledger table |
| 2 | 0:22–0:45 | Transfer detail: lifecycle timeline + stage rail |
| 3 | 0:45–1:05 | Reconciliation panel + evidence links + stellar.expert |
| 4 | 1:05–1:30 | Raw JSON record + evidence export |

---

## Recording Instructions

1. **Environment**: Use a 1920×1080 viewport. Dark theme (the dashboard uses a dark color scheme).
2. **Browser**: Chrome/Chromium with DevTools closed. Clean profile (no extensions visible).
3. **Data**: Pre-seed at least 2-3 transfers at different lifecycle stages so the dashboard table has content.
4. **Stellar.expert**: Open the testnet explorer link in a new tab to verify the transaction hash exists.
5. **Pause on key elements**: Give 2-3 seconds on each panel before moving.
6. **No audio required**: The narration above is a guide. The video can be silent with text overlays or recorded with voiceover.

---

## Pre-Flight Checklist

Before recording:
- [ ] Backend server running (`npm --prefix backend run dev`)
- [ ] Supabase connected, migrations applied (`npm --prefix backend run migrate:required`)
- [ ] At least 3 transfers seeded (use `POST /api/transfers` via the `/ops` UI or curl)
- [ ] At least 1 transfer has reached `STELLAR_SETTLED` or `RECONCILED` with a real testnet tx hash
- [ ] `STELLAR_WATCHER_INTERVAL_MS=10000` (10s polling)
- [ ] Ops dashboard token set (`OPS_DASHBOARD_TOKEN=dev-ops-token` for local)
- [ ] Dashboard URL: `http://localhost:3333/ops`
- [ ] Transfer detail URL: `http://localhost:3333/ops/transfers/<uuid>`
- [ ] Stellar expert URL format: `https://stellar.expert/explorer/testnet/tx/<hash>`
