# Current Database State — D2 Evidence Boundary

Captured: 2026-06-16T11:14:53-03:00

## Summary

The live database now contains one usable D2 Circle sandbox payout transfer.

| Table | Count |
|---|---:|
| `public.international_transfers` | 3 |
| `public.international_payout_instructions` | 1 |
| `public.international_payout_events` | 0 |
| `public.international_transfer_reconciliations` | 3 |

Usable D2 Circle transfer count: 1.

## Sanitized Transfer Rows

| Transfer ID | Status | Stellar hash shape | Payout instruction present on transfer | Persisted payout instruction row | Provider payout present | Provider |
|---|---|---|---:|---:|---:|---|
| `tr_d2_circle_stellar_payment_2` | `PAYOUT_COMPLETED` | `64:hex64` | yes | yes | yes | `circle` |
| `tr_brl_usd_4413c4bb-475f-4cfa-a7e8-50c18e7605ec` | `PAYOUT_PENDING` | `45:other` | yes | no | yes | `etherfuse` |
| `tr_brl_usd_d99f39d3-2e38-4827-93e9-09aad4421a0f` | `PAYOUT_PENDING` | `45:other` | yes | no | yes | `etherfuse` |

## Conclusion

The active D2 row is `tr_d2_circle_stellar_payment_2`. It can be used for D2 evidence because it has a 64-character Stellar transaction hash, provider `circle`, execution mode `sandbox_api`, and a persisted payout instruction row.

The two older `tr_brl_usd_*` rows cannot be used for final D2 evidence because their Stellar hash shape is not a 64-character transaction hash, they use the Etherfuse proof provider rather than Circle, and they do not have persisted rows in `public.international_payout_instructions`.

The active D2 package has:

- a 64-character Stellar testnet transaction hash
- a stored `international_payout_instructions` row
- a Circle provider payout reference stored in the database
- payout status history from creation plus protected status refreshes, with final observed status `completed`
- reconciliation metadata for the same transfer

## Inspection Query Shape

The inspection used Supabase service access and selected only sanitized output:

```sql
select
  id,
  status,
  stellar_tx_hash,
  payout_instruction_id,
  provider_payout_id,
  payout_status,
  payout_provider,
  reconciliation_metadata,
  pix_payment_id,
  pix_order_id,
  created_at,
  updated_at
from public.international_transfers
order by created_at desc
limit 10;
```

No raw API keys, bank account numbers, routing numbers, or Circle linked-bank IDs were printed or committed.
