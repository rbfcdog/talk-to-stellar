# Run 2026-06-14-2245 — Real Evidence Only

## Summary

Removed non-final D1 log/transfer-record JSON from the active evidence folder and added an export guard so final reviewer evidence cannot be written unless the transfer is a reconciled real Stellar testnet transfer.

## Files Changed

| File | Change |
|---|---|
| `backend/src/scripts/realEvidenceGuard.ts` | Added final-evidence validation for transfer state, PIX evidence, Stellar hash, Stellar ledger, reconciliation metadata, and generated local evidence values. |
| `backend/src/scripts/export-transfer-log.ts` | Runs the real-evidence guard before writing and writes to the active `docs/insta-awards/deliverables/deliverable-1/evidence/` folder. |
| `backend/src/scripts/export-transfer-record.ts` | Runs the same guard before writing and writes to the active evidence folder. |
| Old non-final orchestration log JSON | Removed from active evidence. |
| Old non-final transfer record JSON | Removed from active evidence. |
| `docs/insta-awards/deliverables/deliverable-1/STATUS.md` | Documents that logs and transfer record JSON remain pending until the final real transfer passes the export guard. |
| `docs/insta-awards/deliverables/deliverable-1/EVIDENCE-RUNBOOK.md` | Requires provider-returned evidence values and documents export guard failures. |
| `docs/project-brain/funding/instaward-1.md` | Marks D1 logs and transfer record as pending final real export. |
| `docs/project-brain/funding/GRANTS.md` | Removes the obsolete evidence claim and documents guarded final export. |

## Verification

The live database currently has no final reconciled real D1 transfer to export. The existing normalized transfer is blocked by the guard and cannot be written as reviewer evidence.

Verified with:

```bash
npm run instawards:export-log -- <current_non_final_transfer_id>
npm run instawards:export-record -- <current_non_final_transfer_id>
```

Both commands failed before writing because the transfer is not reconciled and does not carry real Stellar evidence.

Final checks run in this session:

```bash
npm --prefix backend test -- --runInBand tests/real-evidence-guard.test.ts tests/ops.routes.test.ts tests/security.middleware.test.ts
npm --prefix backend run build
git diff --check
find docs/insta-awards/deliverables/deliverable-1 -name '*.json' -type f
```

Results:

- PASS: 3 test suites, 10 tests.
- PASS: TypeScript build.
- PASS: whitespace check.
- PASS: no JSON files remain under the active D1 package.

Expected final export files after a real run:

```text
docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-<public_ref>.json
docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-<public_ref>.json
```
