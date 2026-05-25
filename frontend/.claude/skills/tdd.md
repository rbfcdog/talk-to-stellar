---
name: tts-tdd
description: >
  TDD discipline for TalkToStellar frontend. Consult before implementing any
  component, hook, utility, or API route handler. Stack: Vitest + React Testing
  Library + Playwright. The Refactor step is the most important — once tests
  pass, always ask how the solution can be made more elegant and concise.
---

# TDD — TalkToStellar Frontend

## The cycle

1. **Red** — Write the test describing the expected behavior. Run it. It must fail.
2. **Green** — Write the minimum code to make the test pass. Nothing more.
3. **Refactor** — This is the most important step. With passing tests as a safety
   net, reason about the implementation: Is it the most concise expression of the
   intent? Can abstractions be reduced? Can duplication be removed? Can names be
   made more precise? Run tests after every change to the implementation.

Never write production code without a failing test first.

## Test file locations
frontend/
├── tests/
│   ├── unit/
│   │   ├── components/    # Mirrors frontend/components/
│   │   ├── hooks/         # Custom hooks
│   │   └── lib/           # Utility functions
│   ├── integration/       # Multi-component flows, full pages
│   └── e2e/               # Playwright end-to-end

Test files: `*.test.tsx` for components, `*.test.ts` for pure logic.

## Component test structure

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'

describe('TerminalEyebrow', () => {
  describe('rendering', () => {
    it('renders the prompt character and command', () => {
      render(<TerminalEyebrow command="tts convert --from BRL" />)
      expect(screen.getByText(/\$/)).toBeInTheDocument()
      expect(screen.getByText(/tts convert --from BRL/)).toBeInTheDocument()
    })

    it('does not render cursor when showCursor is false', () => {
      render(<TerminalEyebrow command="tts convert" showCursor={false} />)
      expect(document.querySelector('.animate-\\[blink\\]')).toBeNull()
    })

    it('applies dark variant styles when dark prop is true', () => {
      render(<TerminalEyebrow command="tts channels" dark />)
      // assert dark background class is present
    })
  })
})
```

- `describe` outer: component or function name
- `describe` inner: method or behavior group
- `it`: describes behavior from the user's perspective, not implementation

## Hook test structure

```typescript
import { renderHook, act } from '@testing-library/react'
import { useScrollY } from '@/hooks/use-scroll-y'

describe('useScrollY', () => {
  it('returns 0 on initial render', () => {
    const { result } = renderHook(() => useScrollY())
    expect(result.current).toBe(0)
  })

  it('updates value on window scroll', () => {
    const { result } = renderHook(() => useScrollY())
    act(() => { window.scrollY = 120; window.dispatchEvent(new Event('scroll')) })
    expect(result.current).toBe(120)
  })
})
```

## Mocking Next.js internals

```typescript
// At the top of the test file
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} />,
}))
```

## What to test in order

When implementing a component or function, write tests in this order:

1. **Renders without crashing** — the baseline
2. **Happy path** — the main behavior works correctly
3. **Props variation** — key prop combinations produce expected output
4. **User interaction** — clicks, inputs, keyboard events
5. **Edge cases** — empty state, loading state, error state
6. **Accessibility** — role, label, keyboard navigation

## The Refactor step in practice

Once all tests pass, ask these questions before moving on:

- Can this component be split into smaller pieces with clearer responsibilities?
- Are there magic values that should be named constants?
- Is conditional logic readable or should it be extracted to a helper?
- Can a long JSX tree be broken into named sub-components?
- Is the prop interface the minimal necessary surface?
- Are there repeated className strings that should be a CVA variant?

Refactoring rules:
- Change only structure, never behavior
- Run tests after every refactor step, not just at the end
- If a refactor makes a test harder to read, reconsider the refactor
- Small, safe steps — one concern at a time

## Coverage targets

| Area | Target |
|---|---|
| UI components (ui/) | 85% |
| Landing sections (landing/) | 70% |
| Hooks | 90% |
| Utilities (lib/) | 95% |
| API route handlers (app/api/) | 80% |

## Dev commands

```bash
cd frontend
npm run test          # Run full suite
npm run test:watch    # Watch mode — keep running during development
npm run test:ui       # Vitest UI in browser
npm run test:e2e      # Playwright
npm run test:coverage # Coverage report
```

Keep test:watch running during development. Red-green-refactor must be continuous.
