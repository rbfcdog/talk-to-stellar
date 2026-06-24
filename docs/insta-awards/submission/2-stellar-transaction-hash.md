# 2. Stellar Transaction Hash

- Network: testnet
- Asset: USDC (source: XLM)
- Tx hash: `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`
- Ledger: 2488252
- Explorer: https://stellar.expert/explorer/testnet/tx/e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094
- Status: successful
- Source: GDCXQYCU45GJJXP37U4DEFAMNPW6WLISXXTSLJFQ4D5YQZIWQSLAZQ42
- Destination: GBBBRRQ2JIQX4RDQFPQHA4FBT5I5T37DPGYSC76TM3PEC65QIZXE3WCY
- Amount: 11.9281550 XLM → 10.0000000 USDC
- Fee: 0.0000100 XLM (100 stroops)
- Created: 2026-05-10T21:46:35Z

The full record with all settlement details is at `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-2026-STELLAR-000002.json` — it includes the Horizon API response, operation details, and database row evidence.

The hash was exported from the live production database (`payment_logs.id = 2`, `operations.id = 259de57a-ca16-409b-bf73-79c5641cbf16`) and verified against Horizon testnet. The transaction is at ledger 2488252, confirmed successful, visible on stellar.expert.
