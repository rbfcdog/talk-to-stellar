# Evidence 2 — Stellar Transaction Hash

## Status

Evidence requirements are ready. Final same-transfer D2 Stellar hash is pending.

D2 requires a real Stellar testnet transaction hash from the same transfer used for Circle payout evidence. The existing Stellar JSON evidence from D1 can prove database-backed Stellar activity, but it is not a replacement for the D2 same-transfer payout package.

## Current Database Result

The database was inspected on 2026-06-15. See `current-db-state.md`.

Current result:

- `international_transfers`: 2 rows
- usable final D2 transfer count: 0
- both current transfer rows have mock-prefixed Stellar hashes
- both current transfer rows have mock-prefixed PIX identifiers
- `international_payout_instructions`: 0 rows
- `international_payout_events`: 0 rows

Therefore there is no valid D2 same-transfer Stellar hash to submit yet.

## Required Fields

Capture these from `public.international_transfers` after settlement:

```sql
select
  id as transfer_id,
  status,
  stellar_asset_code,
  stellar_tx_hash,
  stellar_memo,
  stellar_source_account,
  stellar_destination_account,
  quoted_usd_amount,
  stellar_settled_at,
  payout_instruction_id,
  provider_payout_id,
  payout_status
from public.international_transfers
where id = '<transfer_id>';
```

## Explorer Link

Use:

```text
https://stellar.expert/explorer/testnet/tx/<stellar_tx_hash>
```

The final D2 package should show the same `stellar_tx_hash` in:

- transfer database row
- payout instruction settlement evidence
- reconciliation output
- `/api/transfers/:id/payout-evidence`
- ops dashboard detail page

## D1 Cross-Reference

Current D1 verified Stellar evidence is in:

```text
docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-2026-STELLAR-000002.json
```

It includes testnet transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`, verified on Horizon testnet ledger `2488252`. This is database-backed Stellar evidence, but it is not a same-transfer D2 payout hash.
