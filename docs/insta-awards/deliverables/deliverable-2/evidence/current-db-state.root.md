# Current Database State — D2 Evidence Boundary

Captured: 2026-06-15T14:53:48.666Z

## Summary

The live database does not currently contain a usable final D2 transfer.

| Table | Count |
|---|---:|
| `public.international_transfers` | 2 |
| `public.international_payout_instructions` | 0 |
| `public.international_payout_events` | 0 |
| `public.international_transfer_reconciliations` | 2 |

Usable final D2 transfer count: 0.

## Sanitized Transfer Rows

| Transfer ID | Status | Stellar hash shape | PIX evidence shape | Payout instruction present | Provider payout present | Provider | Mock metadata |
|---|---|---|---|---:|---:|---|---|
| `tr_brl_usd_4413c4bb-475f-4cfa-a7e8-50c18e7605ec` | `PAYOUT_PENDING` | mock-prefixed | mock-prefixed | yes | yes | `etherfuse` | yes |
| `tr_brl_usd_d99f39d3-2e38-4827-93e9-09aad4421a0f` | `PAYOUT_PENDING` | mock-prefixed | mock-prefixed | yes | yes | `etherfuse` | yes |

## Conclusion

These rows cannot be used for final D2 evidence because they contain generated/mock identifiers and no payout instruction rows exist in `public.international_payout_instructions`.

The final D2 package still needs one real same-transfer run with:

- a non-mock 64-character Stellar testnet transaction hash
- a stored `international_payout_instructions` row
- a provider payout ID or clearly labeled compatibility-mode reference
- payout status history or webhook evidence
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
