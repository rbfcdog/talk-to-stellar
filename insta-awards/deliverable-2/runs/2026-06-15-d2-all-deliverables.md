# Run 2026-06-15 - D2 All Deliverables Package

## Summary

Assembled the D2 reviewer package for all four requested evidence labels:

- Adapter Interface Code
- Hash Transacao Stellar
- Integracao Circle/Bridge
- Payout Instructions

The package is complete as a foundation and compatibility-evidence package. Final real same-transfer Circle payout execution remains pending because the current database has no usable real D2 transfer and this backend shell cannot execute Circle sandbox payouts.

## Files Changed

| File | Purpose |
|---|---|
| `docs/insta-awards/deliverables/deliverable-2/STATUS.md` | One-page status and completion boundary for all D2 evidence labels. |
| `docs/insta-awards/deliverables/deliverable-2/DELIVERABLE-LOCATIONS.md` | Exact D2 and D1 evidence locations for reviewer navigation. |
| `docs/insta-awards/deliverables/deliverable-2/README.md` | Updated D2 package entry point with all-label status and DB boundary. |
| `docs/insta-awards/deliverables/deliverable-2/evidence/adapter-interface-code.md` | Clarified code-review claim and execution boundary. |
| `docs/insta-awards/deliverables/deliverable-2/evidence/stellar-transaction-hash.md` | Added current DB result and D1 historical Stellar cross-reference. |
| `docs/insta-awards/deliverables/deliverable-2/evidence/circle-bridge-integration.md` | Added redacted Circle readiness status and Bridge claim boundary. |
| `docs/insta-awards/deliverables/deliverable-2/evidence/payout-instructions.md` | Added current empty-payout-table boundary and final claim wording. |
| `docs/insta-awards/deliverables/deliverable-2/evidence/current-db-state.md` | Records sanitized DB counts and why current rows are not final D2 evidence. |
| `docs/insta-awards/deliverables/deliverable-2/evidence/circle-readiness-redacted.json` | Redacted Circle readiness snapshot with no raw secrets or bank identifiers. |

## Commands Run

```bash
npm --prefix backend run circle:payout-readiness
```

Result:

- linked Circle wire destination: present
- Circle API key visible to this backend shell: no
- `ENABLE_REAL_PAYOUT_EXECUTION`: false
- compatibility evidence ready: yes
- Circle sandbox API execution ready: no

```bash
node <sanitized Supabase inspection script>
```

Result:

- `international_transfers`: 2
- `international_payout_instructions`: 0
- `international_payout_events`: 0
- `international_transfer_reconciliations`: 2
- usable final D2 transfer count: 0

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts tests/international-transfer.routes.test.ts
npm --prefix backend run build
git diff --check
rg -n "<raw Circle/API/bank secret patterns>" . -g '!node_modules' -g '!backend/dist' -g '!frontend/dist' -g '!frontend/.next' -g '!backend/node_modules'
```

Result:

- targeted backend tests: 2 suites, 14 tests passed
- backend TypeScript build: passed
- `git diff --check`: passed
- raw secret scan: no matches for the pasted Circle sandbox key, account number, routing number, full linked destination ID, tracking reference, or fingerprint

## Evidence Boundary

No mocked D2 JSON was created. The existing current `international_transfers` rows contain mock-prefixed Stellar and PIX identifiers, so they are documented as blockers rather than submitted as final evidence.

## Next Required Run

1. Configure backend secrets with the rotated Circle sandbox API key.
2. Keep the linked Circle wire bank destination ID in backend secret storage.
3. Set `ENABLE_REAL_PAYOUT_EXECUTION=true` only for the sandbox payout execution run.
4. Run one same-transfer flow through real Stellar settlement.
5. Create the Circle payout instruction and persist provider response evidence.
6. Export payout evidence, reconciliation evidence, and dashboard screenshots for the same transfer.
