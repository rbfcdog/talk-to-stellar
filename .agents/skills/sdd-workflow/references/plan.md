# Plan stage

Produce an evidence-backed implementation plan for one pending issue without changing product code.

## Procedure

1. Confirm the issue is `pending` or `blocked` and its dependencies are completed.
2. Read the parent spec sections referenced by the issue.
3. Inspect affected code, tests, rules, configuration, and existing patterns.
4. Add a `## Plan` section containing:
   - current behavior and reusable patterns;
   - tests to write first;
   - ordered implementation steps with exact file paths;
   - migrations or compatibility work;
   - documentation updates;
   - validation commands;
   - risks and explicit non-goals.
5. Make acceptance criteria objective and traceable to the spec.
6. Set `status: planned` only when no blocking decision remains.
7. If blocked, add the reason under `## Notes` and set `status: blocked`.
8. Run `./scripts/sdd validate` and update generated status.

Do not modify product code during this stage.
