You are doing a structural cleanup of the TalkToStellar frontend codebase before a design system migration. Read the full directory structure first with a recursive ls of frontend/ before touching anything.

Context:
- Framework: Next.js 16.2.6 App Router, React 18, TypeScript 5, Turbopack
- The product is pivoting from B2C to B2B focus
- Two landing directories coexist: landing/ (legacy, unused) and landing-v2/ (current)
- No global state library — React Context + useState only
- Backend proxy pattern: browser never calls backend directly, all calls go through /app/api/* routes

## Task 1 — Remove legacy landing

Delete frontend/components/landing/ entirely.
Then rename frontend/components/landing-v2/ to frontend/components/landing/.
Update every import across the codebase that references landing-v2 or landing/ to point to the new path.
Update frontend/app/page.tsx imports accordingly.

## Task 2 — Reorganize components directory

Current structure mixes UI primitives, page sections, and feature components at the same level. Restructure frontend/components/ to:

frontend/components/
├── ui/              # shadcn primitives — untouched
├── landing/         # landing page sections (renamed from landing-v2/)
├── chat/            # move chat-window.tsx, chat-sidebar.tsx, welcome-screen.tsx here
├── payment/         # move any payment-specific components here (confirm, receipt, pix UI)
├── auth/            # move login, PIN, passkey-related UI components here
└── shared/          # theme-provider.tsx, language-toggle.tsx, feedback.tsx

Rules:
- Only move files that are clearly owned by one feature. If a component is used by 3+ features, it stays in shared/.
- After moving, fix every broken import across frontend/app/ and frontend/components/.
- Run TypeScript compiler (tsc --noEmit) to verify no broken imports remain.

## Task 3 — Route audit

List every route under frontend/app/ and classify each as:
- ACTIVE: used in the current product
- LEGACY: no longer relevant to the B2B pivot but kept for safety
- DEAD: no inbound links, no references anywhere in the codebase

Specifically check:
- /mainnet — is this still used?
- /institution-settlement — B2B relevant or legacy?
- /link-used — still referenced?
- /r/[code] — redirect handler, still active?
- /pix-on, /pix-off, /pix-ramp — are all three needed or are they duplicate flows?
- /global-transfer vs /international-transfer — two routes for the same thing?

For DEAD routes: delete the directory and its files.
For LEGACY routes: add a comment at the top of page.tsx: // LEGACY — kept for backward compat, review before next release
Do not delete ACTIVE or LEGACY routes.

## Task 4 — next.config.mjs cleanup

Open frontend/next.config.mjs and:

1. Re-enable image optimization — remove or set to false the `images: { unoptimized: true }` flag if present. If external image domains are needed, list them in `images.remotePatterns`.

2. Ensure Turbopack is correctly configured for production. If there's a `experimental: { turbo: ... }` block, verify it matches the Next.js 16 stable API.

3. Add these if not present:
   - `compress: true`
   - `poweredByHeader: false`
   - `reactStrictMode: true`

4. Do not change the existing proxy or env variable setup.

## Task 5 — TypeScript config review

Open frontend/tsconfig.json and ensure:
- `"strict": true` is set
- `"noUnusedLocals": true` is set
- `"noUnusedParameters": true` is set
- Path alias `@/*` correctly maps to the frontend root

Run `tsc --noEmit` after enabling strict flags. Fix any type errors that surface — do not use `// @ts-ignore` or `any` as a fix; find the correct type.

## Task 6 — lib/ directory cleanup

Open frontend/lib/ and read every file. Then:

1. Document each utility with a one-line JSDoc comment if it lacks one.

2. Check frontend/lib/i18n.tsx — the product is pivoting to B2B and the primary market is Brazil. Audit the EN + pt-BR dictionaries:
   - Remove any consumer-facing strings that no longer apply (e.g. overly casual copy)
   - Add missing B2B terms if any pages reference strings that don't exist in the dictionary
   - Do not change the i18n mechanism itself

3. Check frontend/lib/public-errors.ts — ensure error messages are professional and appropriate for a B2B context.

4. Check frontend/lib/backend-proxy.ts — add a TypeScript return type to the main proxy function if it's missing.

5. Delete any .ts or .tsx files in lib/ that have zero imports anywhere in the codebase (use grep to verify before deleting).

## Task 7 — Dead import cleanup

After all the above, run:
  grep -r "from '@/components/landing'" frontend/app
  grep -r "from '@/components/chat-window'" frontend/app
  grep -r "from '@/components/chat-sidebar'" frontend/app

Fix any imports that point to old paths.

Then run `tsc --noEmit` one final time. Report the result — zero errors is the acceptance criteria before Phase 1 begins.

## Deliverable

At the end, output a summary:
- Files deleted
- Files moved (old path → new path)
- Routes classified (ACTIVE / LEGACY / DEAD)
- tsc --noEmit result
- Any outstanding issues that need manual review