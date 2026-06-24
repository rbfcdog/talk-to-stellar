# D3 — Video Storyboard

90-second demo. Record screen at 1920×1080, dark theme, no browser extensions visible.

## Scene 1 (0:00–0:22) — Dashboard

Open `/ops`. Show the metric bar and the transfer ledger table. Point out the rows with color-coded status pills and the amount chain (R$ → USDC). Mention that the table pulls from four database sources and you can filter by state, date, or source.

## Scene 2 (0:22–0:45) — Transfer detail

Click a transfer row. Show the hero section (public_ref, status, amounts), the 9-stage rail with green circles for completed stages, and the lifecycle timeline. Expand one event payload to show the JSON. Point out the actor badges (system, poller:stellar, webhook:etherfuse).

## Scene 3 (0:45–1:05) — Reconciliation + evidence

Show the reconciliation panel on the right: amount matching, fee breakdown, discrepancies. Below it, the evidence panel: Stellar tx hash with copy button and stellar.expert link, PIX IDs, payout reference. Click the stellar.expert link to verify the tx on testnet.

## Scene 4 (1:05–1:30) — Raw record

Scroll to the bottom, expand "Raw Transfer Record". Show the full JSON with all evidence fields and redacted identifiers. Mention this is what gets exported for reviewer evidence.

## Pre-flight

- Backend running, Supabase connected, migrations applied
- At least 3 transfers seeded, 1 at RECONCILED with a real Stellar testnet hash
- Dashboard at `/ops`, transfer detail at `/ops/transfers/:id`
