# D3 — Screenshots

5 shots, PNG format, 1440×900 or wider, dark theme.

## Shot 1 — Dashboard

`/ops?source=transfers`

Show the metric bar with actual values, the table with at least 3 rows, color-coded status pills (at least one green "Reconciled"), and the amount chain visible (R$ → USDC). Make sure the source filter shows "D1 lifecycle".

## Shot 2 — Transfer detail + timeline

`/ops/transfers/:id`

Hero section with public_ref and status. 9-stage rail with green circles for completed stages. Lifecycle timeline showing all events from CREATED to RECONCILED. Expand one event payload to show JSON. Right sidebar: reconciliation panel and evidence panel both visible.

## Shot 3 — Stellar explorer

`https://stellar.expert/explorer/testnet/tx/:hash`

Open from the evidence panel link. Show the transaction overview: hash, status (Successful), ledger number, operation count, asset code.

## Shot 4 — Reconciliation close-up

Same transfer detail page, scroll to reconciliation panel. Show the green "Amounts matched" banner, fee breakdown table, and "None" for discrepancies.

## Shot 5 — Raw JSON record

Same transfer detail page, scroll to bottom. Expand "Raw Transfer Record". Show syntax-highlighted JSON with all evidence fields (quote, pix, stellar, payout, reconciliation) and the events array. Redacted identifiers should be visible (****0010, ***abcd).

## Naming

```
shot-01-dashboard.png
shot-02-transfer-detail.png
shot-03-stellar-expert.png
shot-04-reconciliation.png
shot-05-evidence-raw-json.png
```
