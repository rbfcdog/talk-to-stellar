# TalkToStellar — Claude Code Reference

## What this project is

B2B payments infrastructure. Converts BRL → USDC via Pix using the Stellar 
Network. Delivered via WhatsApp/Telegram (as one channel among several) and 
REST API. Not a consumer app.

## Before writing any code, read:

- .claude/skills/architecture.md — directory rules, design system, banned patterns
- .claude/skills/tdd.md          — test-first discipline, refactor emphasis
- .claude/skills/code-review.md  — review checklist, run after every task

## Stack summary

Next.js 16 · React 18 · TypeScript 5 · Tailwind 4 · shadcn/ui · Vitest · Playwright

## Non-negotiables

1. Write the test before the implementation. Always.
2. After tests pass, refactor. Ask: is this the most concise correct solution?
3. Run code-review checklist before marking any task done.
4. No hardcoded colors. No dark: classes. No direct backend fetch from client.
5. Financial data always uses font-mono-financial class.
6. New files go in the directory the architecture skill defines — not components/.

## Test commands

npm run test:watch    # Keep running during development
npm run test:coverage # Before any PR
npm run test:e2e      # After any flow-level change
