# 2. Stellar Transaction Hash

**Repo**: https://github.com/rbfcdog/talk-to-stellar — `main` — `bf9c55a`

## Evidence

| Field | Value |
|-------|-------|
| Network | Stellar testnet |
| Asset | USDC |
| Transfer ID | `tr_d2_circle_stellar_payment_2` |
| Tx hash | *run a real Stellar testnet transfer and paste here* |
| Explorer | https://stellar.expert/explorer/testnet/tx/`<hash>` |

## Where to find it

```
GET /ops/transfers/<transfer-id>
→ Evidence & links panel
→ Stellar tx hash with explorer link
```

```sql
SELECT id, status, stellar_tx_hash, stellar_asset_code, 
       stellar_settled_at, quoted_usd_amount
FROM public.international_transfers
WHERE id = '<transfer-id>';
```

## Claim

The payout instruction is linked to a completed Stellar USDC settlement by transaction hash. The hash appears in the database, payout evidence, reconciliation, and dashboard.

> Fill the tx hash above by running a real testnet transfer through the backend.
