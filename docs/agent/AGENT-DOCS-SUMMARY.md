# Agent Documentation Summary

Summary for repository agent instructions. Repository index: [`REPOSITORY-DOCS.md`](../REPOSITORY-DOCS.md).

Source scope: `AGENTS.md`, `.github/COPILOT_SETUP.md`, `.github/copilot-instructions.md`.

## What These Docs Cover

- `AGENTS.md` defines the current repository-wide AI workflow: read project-brain first, do not change application code without an explicit request, verify claims in code, and document bugs and fixes.
- `.github/COPILOT_SETUP.md` explains how GitHub Copilot instruction files are loaded and gives setup examples.
- `.github/copilot-instructions.md` contains Copilot-specific project guidance.

## Freshness Guidance

Treat `AGENTS.md` and `docs/project-brain/MAINTAINER-GUIDE.md` as the governing documentation workflow. Copilot setup examples can contain older architecture or provider language, so verify their technical examples against live code before following them.

## Project-Brain Relationship

Agent workflow belongs in `AGENTS.md`, `docs/project-brain/MAINTAINER-GUIDE.md`, and the main project-brain index. Product, architecture, and provider facts should live in their dedicated project-brain files rather than assistant setup examples.
