---
name: tts-code-review
description: >
  Code review discipline for TalkToStellar frontend. Run after every code
  generation task. Evaluates against SOLID, Clean Code, nesting depth,
  function size, and TalkToStellar-specific architecture rules. Reports
  findings — does not auto-fix.
---

# Code Review — TalkToStellar Frontend

Analyze code and produce a review report. Do NOT auto-fix. Report findings for
human decision.

## Review layers

Run these checks in order every time code is generated or modified.

### Layer 1 — TalkToStellar architecture rules (check first, block if violated)

These are project-specific non-negotiables:

**Design system**
- [ ] No raw `<button>` tags with custom styles — use the Button component or div[role="button"]
- [ ] No hardcoded hex colors in className strings — only tts-* Tailwind tokens or CSS variables
- [ ] No `dark:` Tailwind prefixes anywhere — the app is light-mode only
- [ ] No `bg-white` outside QR code containers — use `bg-tts-surface`
- [ ] No `text-black`, `bg-gray-*`, `text-gray-*`, `bg-zinc-*` — use semantic tokens
- [ ] Financial data (amounts, hashes, addresses, rates) must use `font-mono-financial` class
- [ ] `--tts-confirm` / `text-tts-confirm` used only for payment confirmation states

**Component patterns**
- [ ] No icon + title + description card pattern — use FeatureCard (terminal-led) instead
- [ ] No pill/badge eyebrow above headlines — use TerminalEyebrow component
- [ ] Section headlines use weight 700-800 with tight tracking (−0.02em minimum)
- [ ] Dot grid texture appears only in: parchment hero sections, dark sections — not everywhere

**Architecture**
- [ ] No direct fetch() calls to BACKEND_URL or AGENT_API_URL from client components
  — all backend access goes through /app/api/* proxy routes
- [ ] No global state management added (no Zustand, Redux, Jotai) — use React Context + useState
- [ ] Components placed in the correct directory:
  - ui/ → shadcn primitives only
  - landing/ → landing page sections only
  - chat/ → chat-related components only
  - payment/ → payment flow components only
  - auth/ → auth UI components only
  - shared/ → used by 3+ features

**Testing**
- [ ] New components have at least a renders-without-crashing test
- [ ] New utility functions have unit tests covering happy path + edge cases
- [ ] No production code added without a corresponding test file

### Layer 2 — Function size & structure

- Max 60 lines per function (one screen)
- Single responsibility — one reason to change
- Max 3 parameters preferred; use an options object for 4+
- Use paragraph style: group related lines with blank line separators
- React components: JSX should be readable — extract named sub-components if JSX
  exceeds 40 lines

### Layer 3 — Nesting depth

- Max 2 levels of nesting
- Flag arrow anti-pattern (code forming rightward arrow shape)
- Suggest guard clauses and early returns
- In React: deep conditional JSX nesting should become separate components

### Layer 4 — SOLID

- **S**: Does each component/hook/module have only one responsibility?
- **O**: Can new variants be added without modifying the core component? (CVA is good for this)
- **L**: If extending a base component, does the extended version remain drop-in compatible?
- **I**: Are hook return values minimal — only what callers actually use?
- **D**: Do components depend on abstractions (props, context) not concrete implementations?

### Layer 5 — Loop selection

Flag index-based loops where semantic alternatives exist:
- Transforming items → `map`
- Filtering items → `filter`
- Finding single item → `find`
- Checking conditions → `some` / `every`
- Accumulating → `reduce`
- Side effects only → `forEach` or `for...of`

In JSX: always use `.map()` for rendering lists, with a stable `key` prop.

### Layer 6 — Clean code

- **Naming**: Do names reveal intent? Are component names noun phrases, handler names verb phrases?
- **Magic values**: String literals like `'28px'`, `0.08`, `'stellar:mainnet'` should be named constants
- **Comments**: Code should explain itself. Comments explain WHY, not WHAT.
- **Dead code**: No commented-out blocks, no unused imports, no unreachable branches

### Layer 7 — TypeScript quality

- Prefer `const` over `let` when value won't be reassigned
- No `any` — use `unknown` and narrow, or define the proper type
- No `// @ts-ignore` — fix the type error
- Props interfaces should be named `[ComponentName]Props`
- Use optional chaining `?.` and nullish coalescing `??` over manual null checks
- Prefer `async/await` over promise chains
- Use type guards over type assertions (`as`)

### Layer 8 — DRY / KISS / YAGNI

- **DRY**: Repeated className strings → CVA variant. Repeated logic → custom hook or utility.
- **KISS**: Is there a simpler way to express this? Fewer abstractions are usually better.
- **YAGNI**: No speculative props, no "we might need this later" code paths.

## Report format
Code Review — [filename or task description]
Architecture violations
[Block-level issues specific to TalkToStellar rules]

Issue · which rule it violates · location

Critical issues
[Problems that must be fixed — function size, nesting, SOLID violations, bugs]

Issue · principle violated · file:line

Warnings
[Improvements worth considering]

Issue · rationale

Notes
[Minor style suggestions, optional improvements]
Metrics

Longest component: [name] at [N] lines
Max nesting depth: [N] levels in [location]
Missing tests: [list]
Architecture rule violations: [count]


## Severity

**Architecture violation**: Always critical — block until resolved
**Critical**: Functions >60 lines, nesting >3 levels, SOLID violations, missing tests for new code
**Warning**: Nesting at 3 levels, magic values, suboptimal loop, any type
**Note**: Naming improvements, optional extractions
