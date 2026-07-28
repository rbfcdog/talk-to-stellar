# Execute stage

Implement exactly one planned issue.

## Preconditions

- Work on a task branch, not the default branch.
- Require `status: planned` and a complete `## Plan`.
- Require all declared dependencies to be completed.
- Ensure the working tree contains no unexplained overlapping changes.

## Procedure

1. Set the issue to `in_progress`.
2. Follow the plan in order.
3. Write or update tests before implementation when the planned surface is testable.
4. Make the smallest change that satisfies the tests and acceptance criteria.
5. Run targeted checks after each coherent change and full applicable gates at the end.
6. Keep security-sensitive writes, authorization, payments, and data migrations within the approved boundaries.
7. Add a `## Implementation` summary with files changed and validation results.
8. Leave the issue `in_progress` until review completes.

## Stop conditions

Set `status: blocked`, record the reason under `## Notes`, and stop when:

- the plan contradicts repository reality;
- an architectural or product decision is missing;
- a validation gate exposes a design-level problem;
- completing the work requires expanding scope;
- user authorization is required for a sensitive change.

Do not silently change the spec or plan during execution.
