# Evidence 2: Stellar Transaction Hash

## Status

Template ready. **Real testnet transfer execution pending.**

## Required Fields

The `StellarEvidence` type is defined at `backend/src/orchestration/types.ts:95-103`:

```typescript
export interface StellarEvidence {
  tx_hash: string;
  ledger: number;
  network: 'testnet' | 'mainnet';
  settled_at: string;
  source_account_masked: string;
  asset: string;
  path_used: string[];
}
```

And on the international transfer record at `backend/src/api/services/international-transfer.types.ts:277-280`:

```typescript
stellar_tx_hash?: string;
stellar_memo?: string;
stellar_source_account?: string;
stellar_destination_account?: string;
```

## How to Capture

1. Execute a real Stellar testnet transfer through the TalkToStellar platform.
2. The transfer record will contain the `stellar_tx_hash` field.
3. From the ops dashboard (`/ops`), locate the transfer by its `public_ref` (e.g. `TTS-2026-000002`).
4. Export the transfer record:
   ```bash
   cd backend
   npx ts-node scripts/export-transfer-record.ts <orchestration_transfer_id>
   ```
5. Copy the `stellar_tx_hash` value from the exported JSON.

## How to Verify on Stellar Expert

Open `https://stellar.expert/explorer/testnet/tx/<stellar_tx_hash>` in a browser. Confirm:

- Transaction exists on the Stellar testnet
- Asset matches the expected stablecoin (e.g. USDC)
- Source and destination accounts match the transfer endpoints
- The memo field matches the `stellar_memo` on the transfer record

## Expected Evidence Shape (from Coordination Service)

The coordination service at `backend/src/api/services/usd-payout-coordination.service.ts:196-201` builds the settlement block:

```typescript
settlement: {
  attached: Boolean(transfer.stellar_tx_hash),
  stellar_tx_hash: transfer.stellar_tx_hash,
  stellar_memo: transfer.stellar_memo,
  asset_code: transfer.stellar_asset_code,
  amount_usd: transfer.quoted_usd_amount,
},
```

When the hash is present, `checklist[1]` (`stellar_transaction_hash`) flips from `ready: false` to `ready: true`.

## Placeholder for Real Testnet Transfer

| Field | Value |
|---|---|
| `tx_hash` | `<INSERT REAL TESTNET TX HASH AFTER EXECUTING TRANSFER>` |
| `ledger` | `<INSERT LEDGER NUMBER>` |
| `network` | `testnet` |
| `settled_at` | `<INSERT ISO-8601 TIMESTAMP>` |
| `asset` | `USDC` |
| `amount` | `<INSERT SETTLING AMOUNT>` |
| `explorer_link` | `https://stellar.expert/explorer/testnet/tx/<INSERT TX HASH>` |

## Checklist Impact

In `PayoutCoordinationEvidence.checklist` (`usd-payout-coordination.service.ts:146-151`):

```typescript
{
  id: 'stellar_transaction_hash',
  label: 'Stellar Transaction Hash',
  ready: Boolean(transfer.stellar_tx_hash),
  artifact: transfer.stellar_tx_hash || 'Awaiting confirmed Stellar settlement.',
},
```

The D2 evidence becomes `READY` when `readyCount === 4` (all items ready). Without the real tx hash, `readyCount` is 3.
