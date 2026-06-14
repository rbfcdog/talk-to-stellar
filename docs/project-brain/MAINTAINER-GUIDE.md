# MAINTAINER-GUIDE.md — Living Documentation Workflow

**For AI agents and developers working on TalkToStellar.**

The project brain is a **living document set**. Every time a bug is reported, a fix is applied, a new surface is built, or a pain point is discovered — the relevant docs must be updated immediately. Do NOT defer doc updates.

---

## When You Find a Bug (User Reports It)

1. Add it to `PAIN-POINTS.md` under the correct cluster (A–H). Include:
   - Verbatim user quote (keep original PT/EN)
   - Short English gloss
   - Suspected file path(s)
   - Root-cause hypothesis
   - Status: `Still open`
2. Add it to `OPEN-ISSUES.md` with suggested fix and priority.
3. If it's a new failure mode, add a diagnosis section to `operations/RUNBOOK.md`.
4. If it's surface-specific, update the relevant `product/surfaces/<surface>.md`.

## When You Fix a Bug

1. In `PAIN-POINTS.md`: change status to `Fixed` and add the fixing commit hash + verified code reference.
2. In `OPEN-ISSUES.md`: remove the item (or mark it `Fixed` if you want a record).
3. If a runbook entry existed, update it to note the fix.
4. Update the `Status Summary` counts at the bottom of `PAIN-POINTS.md`.
5. If the fix introduces a new architectural pattern, add a note to `architecture/`.

## When You Add a New Surface/Feature

1. Add it to `OVERVIEW.md` surfaces table.
2. Create a new `product/surfaces/<surface>.md` with: flow diagram, known issues, key files.
3. Register every new file in `README.md` index.
4. Add it to `DOCS-INDEX.md` if it references external docs.

## When You Change the Architecture

1. Update `architecture/SYSTEM-MAP.md` — the Mermaid diagram and file map.
2. Update `architecture/DATA-MODEL.md` if tables/fields changed.
3. Update `architecture/MONEY-FLOWS.md` if a flow lifecycle changed.
4. Update `architecture/INTEGRATIONS.md` if an external service changed.

## When You Get New Funding/Grant Info

1. Update `funding/GRANTS.md` with deliverable status, deadlines, evidence locations.
2. Update `history/TIMELINE.md` with new phases.

## Rules

- **Cite file paths** for every claim. Never guess a file — search the codebase.
- **Keep founder quotes verbatim** in PAIN-POINTS.md.
- **Trust the code over any doc**. If a doc contradicts the code, update the doc and flag the discrepancy in DOCS-INDEX.md.
- **Run `git log --oneline -20`** before updating PAIN-POINTS.md to find relevant fix commits.
- **Never delete old pain points** — mark them fixed with the commit hash. The history is valuable.
- **The `Status Summary` at the bottom of PAIN-POINTS.md must always be accurate**. Re-count after every update.

## File Hitlist — What to Update for Common Events

| Event | Files to Update |
|-------|----------------|
| New bug reported in chat | `PAIN-POINTS.md`, `OPEN-ISSUES.md`, `RUNBOOK.md` (if operational), `surfaces/<surface>.md` |
| Bug fixed | `PAIN-POINTS.md` (status), `OPEN-ISSUES.md` (remove), `surfaces/<surface>.md` (update), `RUNBOOK.md` (if applicable) |
| New surface/page built | `OVERVIEW.md` (surfaces table), `surfaces/<new>.md` (create), `README.md` (index), `architecture/SYSTEM-MAP.md` (file map) |
| New integration added | `architecture/INTEGRATIONS.md`, `architecture/SYSTEM-MAP.md`, `operations/ENVIRONMENTS.md` (new env vars) |
| Grant deliverable completed | `funding/GRANTS.md`, `history/TIMELINE.md` |
| Major refactor | `architecture/SYSTEM-MAP.md`, `architecture/DATA-MODEL.md`, `architecture/MONEY-FLOWS.md` |
| New env var added | `operations/ENVIRONMENTS.md` |
| i18n issue found | `product/I18N.md` (audit checklist), `PAIN-POINTS.md` (cluster D) |
| Copy/UX feedback from founder | `PAIN-POINTS.md` (cluster F/G), `product/UX-PRINCIPLES.md`, `product/COPY-GUIDE.md` |
