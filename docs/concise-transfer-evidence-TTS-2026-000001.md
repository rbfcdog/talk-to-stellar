# Concise Transfer Evidence - TTS-2026-000001

Last updated: 2026-06-22

JSON file: [`concise-transfer-evidence-TTS-2026-000001.json`](./concise-transfer-evidence-TTS-2026-000001.json)

```json
{
  "transfer_id": "972fda9f-fdec-47bd-a21c-a9326999e948",
  "public_ref": "TTS-2026-000001",
  "state": "PAYOUT_INSTRUCTED",
  "route": "PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK",
  "environment": "stellar_testnet_provider_sandbox",
  "created_at": "2026-06-14T14:54:49Z",
  "updated_at": "2026-06-14T14:54:53Z",
  "amounts": {
    "brl_received": "1000.00",
    "fx_rate_brl_usd": "4.923897",
    "usdc_settled": "203.09",
    "usd_expected_out": "203.09"
  },
  "exchange": {
    "received_funds_exchanged": true,
    "path": ["BRL", "USDC", "USD"],
    "summary": "BRL funded by PIX is exchanged into USDC on Stellar testnet, then routed toward expected USD payout."
  },
  "ultimate_destination": {
    "country": "US",
    "destination_type": "masked_us_bank_or_payout_account",
    "masked_account": "acct:***6789",
    "account_holder_name": "Destination USD Institution LLC",
    "same_name_check_passed": true
  },
  "evidence": {
    "pix": {
      "provider": "provider_sandbox",
      "charge_id_masked": "mock_pix_tr_brl_usd_...05ec",
      "paid_at": "2026-05-23T00:40:15Z"
    },
    "stellar": {
      "network": "testnet",
      "asset": "USDC",
      "tx_hash": "e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094",
      "ledger": 2488252,
      "explorer": "https://stellar.expert/explorer/testnet/tx/e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094"
    },
    "payout": {
      "provider": "provider_sandbox",
      "instruction_id_masked": "provider_instruction_6d66...3568f",
      "routing_status": "instructed"
    }
  },
  "reconciliation": {
    "amounts_match": true,
    "discrepancies": [],
    "reconciled_by": "system",
    "reconciled_at": "2026-06-14T14:54:52Z"
  },
  "lifecycle": [
    "CREATED",
    "QUOTED",
    "PIX_CHARGE_ISSUED",
    "PIX_FUNDED",
    "CONVERTING",
    "STELLAR_SETTLED",
    "PAYOUT_ROUTING",
    "PAYOUT_INSTRUCTED"
  ],
  "submission_boundary": {
    "status": "testnet_sandbox_evidence",
    "do_not_claim": "production_bank_delivery",
    "redact": [
      "raw_provider_ids",
      "raw_bank_account_numbers",
      "api_keys",
      "private_keys",
      "full_wallet_or_wire_destination_ids"
    ]
  }
}
```
