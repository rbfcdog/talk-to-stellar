# AGENTS.md — AI Agent Instructions

You are working on **TalkToStellar**, a conversational money platform (PIX → Stellar → multi-asset balances, via WhatsApp/Telegram/web).

## Critical Rules

1. **Never modify application code unless explicitly asked.** Prefer reading/searching first.
2. **The project brain lives at `docs/project-brain/`.** Read `docs/project-brain/MAINTAINER-GUIDE.md` before touching any doc.
3. **Every bug report or fix must be documented.** When a user reports a bug:
   - Add it to `docs/project-brain/PAIN-POINTS.md` (correct cluster, verbatim quote, suspected files, root cause, status)
   - Add it to `docs/project-brain/OPEN-ISSUES.md` (priority, suggested fix)
   - If it's a new failure mode, add diagnosis to `docs/project-brain/operations/RUNBOOK.md`
4. **When you fix a bug, update the docs.** Change status to `Fixed` with the commit hash. Remove from OPEN-ISSUES.md. Re-count the Status Summary.
5. **Before claiming a fix exists, verify it in the code.** Search for the specific file and line. Cite file paths.
6. **Before adding a pain point, check git log for fix commits.** Run `git log --oneline --grep="fix\|Fix" -20`.
7. **Trust the code over any doc.** If a doc contradicts the code, update the doc and flag in DOCS-INDEX.md.
8. **Keep founder quotes verbatim** in PAIN-POINTS.md (preserve original PT/EN).
9. **Every new surface, integration, or architectural change must be registered** in the relevant project-brain file.
10. **The `docs/project-brain/README.md` index must stay current.** Register every new file there.

## Key File Locations

| What | Where |
|------|-------|
| Project brain index | `docs/project-brain/README.md` |
| Living doc workflow | `docs/project-brain/MAINTAINER-GUIDE.md` |
| All pain points (bugs) | `docs/project-brain/PAIN-POINTS.md` |
| Open issue backlog | `docs/project-brain/OPEN-ISSUES.md` |
| Operational runbook | `docs/project-brain/operations/RUNBOOK.md` |
| UX design rules | `docs/project-brain/product/UX-PRINCIPLES.md` |
| Banned copy patterns | `docs/project-brain/product/COPY-GUIDE.md` |
| i18n system + audit | `docs/project-brain/product/I18N.md` |
| Surface-specific audits | `docs/project-brain/product/surfaces/*.md` |
| Architecture map | `docs/project-brain/architecture/SYSTEM-MAP.md` |
| Money flow lifecycles | `docs/project-brain/architecture/MONEY-FLOWS.md` |
| Grant status | `docs/project-brain/funding/GRANTS.md` |

## Tone

- Write docs in English (EN). Keep user-facing quotes in original PT.
- Be concise. Cite file paths. Never guess.
- When in doubt, search the codebase before writing.
