# Specification stage

Create an implementable source of truth under `docs/specs/spec-<slug>.md`.

## Procedure

1. Read every applicable `AGENTS.md`.
2. Inspect the actual repository, tests, rules, configuration, and relevant history before describing current behavior.
3. Scaffold with `./scripts/sdd new-spec <slug> --title "<title>"`.
4. Fill every template section with evidence-backed decisions.
5. Keep the spec at `status: draft` while architectural or product decisions remain open.
6. Present decisions and trade-offs for human review.
7. Change the status to `approved` only after explicit user approval.
8. Run `./scripts/sdd validate`.

## Required qualities

- State objective, current context, scope, and exclusions.
- Define contracts, state transitions, failure paths, security constraints, and migration impact.
- Define objective validation gates.
- Split implementation into dependency-ordered phases that can become reviewable issues.
- Record non-obvious decisions and rejected alternatives.
- Avoid implementation code except short contract or schema examples needed to remove ambiguity.

Do not edit production code during this stage.
