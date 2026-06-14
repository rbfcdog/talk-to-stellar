# Non-Project-Brain Markdown Summary

Generated: 2026-06-13. Updated after documentation consolidation.

This file is the project-brain compatibility entry point for repository-authored Markdown outside `docs/project-brain/`.

Documentation now lives in `docs/` directories. Use [`REPOSITORY-DOCS.md`](../REPOSITORY-DOCS.md) for the root index, then open the local `<module>/docs/DOCS-SUMMARY.md`.

## Current Scan

Command:

```bash
find . \( -path './docs/project-brain' -o -path '*/node_modules' -o -path './.git' -o -path './backend/dist' -o -path './frontend/.next' \) -prune -o -name '*.md' -type f -print
```

Result: **250 Markdown files**.

This includes 201 source documents, 13 distributed summary/index files, and 36 old-path redirect stubs. Redirect stubs are intentional where old module paths still exist; source documentation content lives in `docs/` directories only.

## Summary Index

See [`REPOSITORY-DOCS.md`](../REPOSITORY-DOCS.md) for all source-family summaries, counts, and freshness guidance.

Core rule: live code and current project-brain files override dated scans, historical grant packages, and deprecated provider experiments.
