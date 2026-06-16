# 2. Stellar Transaction Hash

- Network: testnet
- Asset: USDC
- Transfer ID: `tr_d2_circle_stellar_payment_2`
- Tx hash: _run a real Stellar testnet transfer and put the hash here_
- Explorer: https://stellar.expert/explorer/testnet/tx/_hash_

The hash lives in the transfer record. Pull it with:

```sql
select id, status, stellar_tx_hash, stellar_asset_code,
       stellar_settled_at, quoted_usd_amount
from public.international_transfers
where id = '<transfer-id>';
```

You can also see it on the ops dashboard at `/ops/transfers/:id` under the Evidence & links panel — there's a clickable link straight to stellar.expert.

The hash is carried through the entire pipeline: database row, payout evidence JSON, reconciliation output, and the ops dashboard forensics view. Same hash everywhere.
