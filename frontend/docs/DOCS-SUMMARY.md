# Frontend Documentation Summary

Local summary for the actual `frontend/` directory. Repository index: [`docs/REPOSITORY-DOCS.md`](../../docs/REPOSITORY-DOCS.md).

Source scope: `frontend/**/*.md`, excluding this summary (5 source files).

| File | Purpose |
|------|---------|
| `frontend/docs/README.md` | Current folder map, global CSS location, onboarding flow, payment confirmation flow, and frontend env examples |
| `frontend/docs/CLAUDE.md` | Frontend-specific assistant workflow and non-negotiable rules |
| `frontend/docs/.claude/skills/architecture.md` | Directory rules, backend proxy pattern, design system, and B2B positioning |
| `frontend/docs/.claude/skills/code-review.md` | Frontend review checklist and severity model |
| `frontend/docs/.claude/skills/tdd.md` | Frontend TDD workflow, test locations, and coverage targets |

## Consolidated Guidance

The frontend uses Next.js App Router, React, TypeScript, Tailwind, shadcn/Radix patterns, Vitest, and Playwright. Browser requests should pass through `frontend/app/api/` proxy routes and `frontend/lib/backend-proxy.ts`; client components should not call backend service URLs directly.

## Freshness Guidance

`frontend/docs/README.md` and the local assistant references are the focused frontend guides, but assistant rules can contain product-positioning or style statements that conflict with newer product decisions. Verify route, stack-version, design-token, and command claims against the current frontend tree and package manifest.

Current user-facing UX rules remain in `docs/project-brain/product/`.
