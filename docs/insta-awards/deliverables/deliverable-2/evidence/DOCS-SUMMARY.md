# Documentation Summary: insta-awards/deliverables/deliverable-2/evidence

Generated summary for `docs/insta-awards/deliverables/deliverable-2/evidence`. Last generated: 2026-06-16.

## Markdown Files

| File | Title | Words | Summary | Language note |
|------|-------|-------|---------|---------------|
| [`adapter-interface-code.md`](./adapter-interface-code.md) | Evidence 1 — Adapter Interface Code | 360 | Adapter contract, provider map, Circle option forwarding, USDC rail metadata, reviewer claim, execution boundary, and verification commands for backend tests/build. | English or mostly English. |
| [`circle-bridge-integration.md`](./circle-bridge-integration.md) | Evidence 3 — Circle / Bridge Integration | 760 | Circle sandbox API readiness, completed TTS Circle payout instruction, redacted balance/wire proof, linked-bank evidence, USDC on/off-ramp metadata, Bridge compatibility boundary, and claim wording. | English or mostly English. |
| [`current-db-state.md`](./current-db-state.md) | Current Database State — D2 Evidence Boundary | 330 | Sanitized DB counts and transfer-row shapes proving the active D2 Circle transfer has a 64-character Stellar hash, completed payout status, and persisted payout instruction row. | English or mostly English. |
| [`payout-instructions.md`](./payout-instructions.md) | Evidence 4 — Payout Instructions | 430 | Commands and proof for the completed Circle sandbox payout instruction, USDC rail persistence requirements, status refresh result, export/query proof, redaction rules, and final claim wording. | English or mostly English. |
| [`stellar-transaction-hash.md`](./stellar-transaction-hash.md) | Evidence 2 — Stellar Transaction Hash | 260 | D2 Stellar hash proof for transfer `tr_d2_circle_stellar_payment_2`, SQL query, explorer link, and D1 database-backed Stellar source cross-reference. | English or mostly English. |

## Notes

- This folder contains all four D2 evidence labels plus Circle sandbox-readiness proof and a redacted Circle sandbox payout completion JSON.
- The raw Circle API key and linked bank destination ID must stay out of committed docs.
- `circle-readiness-redacted.json` contains a redacted non-Markdown readiness snapshot.
- `circle-sandbox-payout-redacted.json` contains the redacted Circle sandbox payout completion snapshot.
