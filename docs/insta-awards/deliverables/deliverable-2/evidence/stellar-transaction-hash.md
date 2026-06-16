# Evidence 2 — Stellar Transaction Hash

## Status

Ready. The D2 Circle payout transfer uses a 64-character Stellar testnet transaction hash attached to the same TTS transfer record used for Circle payout evidence.

## Current Database Result

The database was inspected on 2026-06-16. See `current-db-state.md`.

Current result:

- `international_transfers`: 3 rows
- usable D2 Circle transfer count: 1
- D2 transfer ID: `tr_d2_circle_stellar_payment_2`
- Stellar hash shape: `64:hex64`
- provider: `circle`
- `international_payout_instructions`: 1 row
- `international_payout_events`: 0 rows

Therefore the D2 Stellar hash evidence is ready.

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
https://stellar.expert/explorer/testnet/tx/e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094
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

It includes testnet transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`, verified on Horizon testnet ledger `2488252`.

For D2, this hash is attached to transfer `tr_d2_circle_stellar_payment_2`, which also has the Circle sandbox payout instruction `circle_instruction_e0be3785-0b35-4690-9eb6-5f99b66167ab`.
