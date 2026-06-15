# Evidence 2 — Stellar Transaction Hash

## Status

Pending final same-transfer run.

D2 requires a real Stellar testnet transaction hash from the same transfer used for Circle payout evidence. The existing historical Stellar JSON evidence from D1 can prove real Stellar activity, but it is not a replacement for the D2 same-transfer payout package.

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
