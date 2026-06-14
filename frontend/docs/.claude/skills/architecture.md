---
name: tts-architecture
description: >
  Architecture reference for TalkToStellar frontend. Consult before creating
  any new file, component, route, or abstraction. Contains directory rules,
  design system constraints, backend proxy pattern, and B2B positioning signals.
---

# Architecture — TalkToStellar Frontend

## Stack

- **Framework**: Next.js 16.2.6, App Router, React 18, TypeScript 5, Turbopack
- **Styling**: Tailwind CSS 4 + CSS custom properties (oklch color space)
- **Components**: shadcn/ui (New York style) over Radix primitives
- **State**: React Context + useState — no global state library
- **Backend access**: Next.js API routes as proxy — browser never calls backend directly
- **Auth**: PIN + Passkeys/WebAuthn via @simplewebauthn/browser
- **Testing**: Vitest + React Testing Library + Playwright

## Directory structure
frontend/
├── app/
│   ├── (routes)/          # App Router pages — one directory per route
│   └── api/               # Backend proxy route handlers
├── components/
│   ├── ui/                # shadcn primitives — do not add product logic here
│   ├── landing/           # Landing page sections — no logic, only presentation
│   ├── chat/              # Chat window, sidebar, welcome screen
│   ├── payment/           # Confirm, receipt, Pix, ramp UI
│   ├── auth/              # Login, PIN, passkey UI
│   └── shared/            # Components used by 3+ features
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities, session, proxy, i18n, errors
├── tests/             # Test files mirroring component structure
└── public/                # Static assets

### Where to put a new file

| What you are creating | Where it goes |
|---|---|
| shadcn primitive | components/ui/ |
| Landing page section | components/landing/ |
| Chat-related component | components/chat/ |
| Payment step component | components/payment/ |
| Auth screen component | components/auth/ |
| Used in 3+ features | components/shared/ |
| Custom hook | hooks/ |
| Pure utility | lib/ |
| New page | app/[route]/page.tsx + [route]-client.tsx |
| Backend proxy endpoint | app/api/[path]/route.ts |

## Backend proxy pattern

The browser NEVER calls BACKEND_URL or AGENT_API_URL directly.
All backend access goes through Next.js API routes in app/api/:
Browser → app/api/[...path]/route.ts → BACKEND_URL

The proxy in lib/backend-proxy.ts handles:
- Session header injection (X-Session-Id, X-Session-Token)
- Idempotency keys for mutating operations
- Error normalization

Do not bypass this. Do not add fetch() calls to external URLs in client components.

## Design system rules

### Colors — tts-* tokens only
--tts-bg:       #F5F1E8  parchment background
--tts-surface:  #FDFAF3  card/panel surfaces
--tts-deep:     #1C1812  warm black — headings, text, primary button
--tts-gold:     #B8880F  single accent — used sparingly
--tts-muted:    #8C7E64  secondary text
--tts-border:   #DDD5C3  all borders
--tts-confirm:  #22C55E  payment confirmation ONLY
--tts-error:    #E5362A  error states ONLY

No hardcoded hex colors. No dark: prefixes. Light mode only.

### Typography rules
- Display headlines: 700-800 weight, −0.025em tracking
- Body: 400 weight, 1.6 line-height
- Financial data: always font-mono-financial class (Geist Mono + tnum + letter-spacing)
- Labels/eyebrows: 700 weight, 0.12em tracking, uppercase, 9px

### Component patterns — what to use

| Situation | Use |
|---|---|
| Section/feature eyebrow | `<TerminalEyebrow command="tts ..." />` |
| Feature highlight card | `<FeatureCard snippetLines={...} />` (JSON snippet, no icon) |
| Clickable element | `<Button>` component or `<div role="button">` |
| Financial amount | `<span class="font-mono-financial text-tts-gold">` |
| Status indicator | `<Badge variant="success|destructive|neutral">` |
| Section with dots texture | CSS `background-image: radial-gradient(...)` at 8% opacity |

### Patterns that are BANNED

- Icon + title + description cards (generic SaaS look)
- Pill/badge eyebrows above headlines
- Raw `<button>` tags with custom styles
- Dark mode classes (`dark:`)
- Hardcoded colors in classNames
- Direct backend fetch() from client components
- `any` TypeScript type

## B2B positioning signals

The product has pivoted from B2C to B2B. Every new component and copy should reflect:

- **Language**: "Infraestrutura", "Integre", "API", "SLA", "Uptime" — not "Fácil", "Rápido", "Simples"
- **CTA primary**: "Falar com o time" — not "Começar grátis" or "Criar conta"
- **WhatsApp positioning**: One channel among several (API, Telegram, Dashboard) — not the product itself
- **Metrics**: Show volume, latency, uptime — not user counts or simplicity claims
- **Terminal eyebrow**: Use technical commands that reflect what the section does

## Route conventions

Every page follows:
app/[route]/
├── page.tsx         # Server component — minimal, just imports client
└── [route]-client.tsx  # Client component — all interactivity here

Do not put business logic in page.tsx. Keep it as a thin shell that imports
the client component and handles metadata.
