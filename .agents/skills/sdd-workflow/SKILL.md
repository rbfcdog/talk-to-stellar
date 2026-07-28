---
name: sdd-workflow
description: Run a provider-neutral spec-driven development workflow for software changes. Use when creating or approving a specification, breaking a spec into operational issues, planning an issue, executing an approved plan, reviewing an implementation against its spec, or reporting SDD status.
---

# SDD Workflow

Treat repository artifacts as the durable interface. Do not depend on slash commands, model names, subagents, hooks, or configuration from a particular AI provider.

## Select the stage

Read exactly one stage reference before acting:

- Create or amend a specification: [references/spec.md](references/spec.md)
- Decompose an approved specification: [references/break.md](references/break.md)
- Plan one operational issue: [references/plan.md](references/plan.md)
- Implement one planned issue: [references/execute.md](references/execute.md)
- Review and close an implementation: [references/review.md](references/review.md)

## Follow the source-of-truth order

1. Apply `AGENTS.md` files from broadest to nearest scope.
2. Apply the approved spec under `docs/specs/`.
3. Apply the operational issue and its approved plan under `docs/issues/`.
4. Treat code and tests as implementation evidence, not permission to silently contradict the spec.

When two layers conflict, stop at the higher layer. Record the conflict in the issue instead of guessing.

## Enforce stage boundaries

- Do not implement during spec, break, or plan stages.
- Do not re-plan during execution. Mark the issue `blocked` when the plan is insufficient.
- Do not mark work `completed` until review and all applicable validation gates pass.
- Change an approved spec only through an explicit amendment accepted by the user.
- Keep provider adapters thin. They may invoke this workflow but must not redefine it.

## Use deterministic tooling

Run the repository wrapper from the project root:

```bash
./scripts/sdd new-spec <slug> --title "Title"
./scripts/sdd new-issue <spec-path> <slug> --title "Title"
./scripts/sdd validate
./scripts/sdd status
./scripts/sdd status --write
```

Use [assets/spec-template.md](assets/spec-template.md) and [assets/issue-template.md](assets/issue-template.md) through the script rather than copying them manually.
