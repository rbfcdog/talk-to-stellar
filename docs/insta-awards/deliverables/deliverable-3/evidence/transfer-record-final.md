# Evidence - Transfer Record Final

## Status

Final same-transfer record is pending. This file defines exactly what must be submitted once the demo run is captured.

## Final Transfer Record Target

```text
docs/insta-awards/deliverables/deliverable-3/evidence/json/final-transfer-record.json
```

## Required Record Shape

The final record must identify one transfer and connect every stage:

```json
{
  "transfer_id": "<legacy or international transfer id>",
  "normalized_transfer_id": "<transfers.id when mirrored>",
  "public_ref": "<public transfer reference>",
  "quote": {
    "quote_id": "<quote id>",
    "source_amount_brl": "<amount>",
    "destination_amount_usd": "<amount>",
    "fee_breakdown": {}
  },
  "pix": {
    "provider": "<etherfuse or compatibility provider>",
    "reference": "<pix order, txid, e2e id, or explicit mode label>",
    "funded_at": "<timestamp>"
  },
  "stellar": {
    "network": "testnet",
    "tx_hash": "<64 character hash when available>",
    "asset_code": "USDC",
    "settled_at": "<timestamp>"
  },
  "payout": {
    "provider": "<circle, bridge, etherfuse, or mock>",
    "execution_mode": "<compatibility, sandbox_api, live_api, proof, or mock>",
    "payout_instruction_id": "<id>",
    "provider_payout_id": "<id when provider returned one>",
    "status": "<provider status>"
  },
  "reconciliation": {
    "status": "<matched, pending, discrepancy, or failed>",
    "evidence_files": []
  }
}
```

## Current Available Transfer Record

The current repository has a verified Stellar payment record from D1:

```text
docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-2026-STELLAR-000002.json
```

That file proves a database-backed Stellar testnet payment, but it is not the final Week 4 same-transfer PIX-to-Stellar-to-payout demo record.

## Completion Rule

Do not mark this evidence final until the video, screenshots, orchestration log, payout evidence, reconciliation, and transfer record all reference the same transfer ID or public reference.
