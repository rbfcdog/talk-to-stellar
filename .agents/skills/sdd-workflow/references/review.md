# Review stage

Review the complete issue diff against the parent spec, plan, acceptance criteria, and applicable `AGENTS.md` rules.

## Procedure

1. Inspect the diff and every changed file.
2. Verify behavior, security, authorization, data integrity, error handling, and backwards compatibility in risk order.
3. Confirm every acceptance criterion has evidence.
4. Run or verify all validation gates listed in the plan.
5. Add a `## Review` section containing:
   - findings ordered by severity;
   - validation commands and outcomes;
   - residual risks;
   - any approved deviations.
6. Resolve required findings before completion.
7. Set `status: completed` only when no required work remains.
8. Run `./scripts/sdd validate` and `./scripts/sdd status --write`.

If a required finding cannot be resolved within the plan, set the issue to `blocked`; do not broaden scope automatically.
