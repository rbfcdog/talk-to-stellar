# Break stage

Convert one approved spec into small, dependency-ordered operational issues under `docs/issues/`.

## Procedure

1. Confirm the spec frontmatter contains `status: approved`.
2. Map every implementation phase and validation obligation to one or more issues.
3. Scaffold each issue with `./scripts/sdd new-issue <spec-path> <slug> --title "<title>"`.
4. Fill overview, affected surface, spec coverage, dependencies, and initial acceptance criteria.
5. Keep every new issue at `status: pending` and omit `## Plan` until the plan stage.
6. Run `./scripts/sdd validate` and `./scripts/sdd status --write`.

## Sizing rules

- Make each issue independently reviewable and testable in one focused implementation cycle.
- Preserve dependency order in the numeric filename prefix.
- Do not mix unrelated product, infrastructure, and cleanup work.
- Do not split work so finely that issue overhead exceeds implementation effort.
- Cover every spec phase; do not invent work outside the spec.

Do not implement code during this stage.
