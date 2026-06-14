# Anchor Library Portability: DX Report — Express Backend

## Thesis Under Test

> This repository provides useful information, examples, and copy/paste-friendly code that can be easily incorporated into any TypeScript project to enable anchor integration in a breeze.

## Methodology

Same approach as previous rounds. This round tests a fundamentally different environment: a pure Node.js/Express backend with no browser, no wallet UI, no Freighter, no frontend framework. The subagent builds an API server that mirrors the SvelteKit CORS proxy pattern — the kind of backend a React or mobile app would call.

The full prompt given to the subagent is in Appendix A.

## Test Application

**Stack:** Express 5 + TypeScript + tsx (for running TS directly)

**What was built:**

- Anchor factory reading config from `process.env` (Express equivalent of `anchorFactory.ts`)
- 17 REST endpoints covering the full `Anchor` interface for both Etherfuse and BlindPay
- `AnchorError`-aware error handling middleware with structured JSON responses
- Provider capabilities endpoint
- Health check and provider listing
- Provider-specific endpoints (BlindPay blockchain wallets/payout, Etherfuse sandbox simulation)

**Lines of code:** ~700 lines of Express/TypeScript (entry point + routes + factory + error middleware)

---

## Verdict: 10/10

Zero friction. Zero modifications to any library file. No browser API dependencies. No Node.js compatibility issues. The anchor library works as a pure backend dependency exactly as advertised.

This is the cleanest round yet — the only "issue" encountered (Express 5's stricter param typing) has nothing to do with the anchor library.

---

## What Worked

### 1. Zero-modification copy (9 files verbatim)

| File                          | Source                                | Changes |
| ----------------------------- | ------------------------------------- | ------- |
| `anchors/types.ts`            | `src/lib/anchors/types.ts`            | None    |
| `anchors/etherfuse/client.ts` | `src/lib/anchors/etherfuse/client.ts` | None    |
| `anchors/etherfuse/types.ts`  | `src/lib/anchors/etherfuse/types.ts`  | None    |
| `anchors/etherfuse/index.ts`  | `src/lib/anchors/etherfuse/index.ts`  | None    |
| `anchors/blindpay/client.ts`  | `src/lib/anchors/blindpay/client.ts`  | None    |
| `anchors/blindpay/types.ts`   | `src/lib/anchors/blindpay/types.ts`   | None    |
| `anchors/blindpay/index.ts`   | `src/lib/anchors/blindpay/index.ts`   | None    |
| `wallet/stellar.ts`           | `src/lib/wallet/stellar.ts`           | None    |
| `wallet/types.ts`             | `src/lib/wallet/types.ts`             | None    |

Three consecutive rounds with zero modifications.

### 2. No browser API dependencies

The anchor clients use only:

- `fetch()` — globally available in Node.js 18+
- `crypto.randomUUID()` — globally available in Node.js 19+
- `JSON.stringify/parse`, `Date`, `URLSearchParams` — standard APIs

No DOM, no `window`, no `document`, no `localStorage`. The library is genuinely isomorphic.

### 3. Factory pattern translates 1:1

The SvelteKit factory (`$lib/server/anchorFactory.ts`) uses `$env/static/private` for API keys. The Express equivalent uses `process.env`. The structure is otherwise identical: a `Map<AnchorProvider, Anchor>` cache, a `getAnchor()` function, and a `isValidProvider()` type guard. This took about 30 lines.

### 4. `AnchorError` works with `instanceof` in Express middleware

The error handler middleware correctly distinguishes `AnchorError` from generic errors:

```typescript
if (err instanceof AnchorError) {
    res.status(err.statusCode).json({
        error: { code: err.code, message: err.message, statusCode: err.statusCode },
    });
}
```

This validates the earlier `erasableSyntaxOnly` fix — the explicit field declarations don't break `instanceof` behavior.

### 5. Types flow through Express route handlers

The library's input types (`CreateCustomerInput`, `GetQuoteInput`, etc.) structure request body parsing, and return types (`Customer`, `Quote`, `OnRampTransaction`, etc.) flow through to `res.json()`. TypeScript catches shape mismatches at compile time.

### 6. Multi-provider support is trivial

The factory instantiates both `EtherfuseClient` and `BlindPayClient` from the same router. Provider-specific endpoints use `instanceof` checks to gate access:

```typescript
if (!(anchor instanceof BlindPayClient)) {
    res.status(400).json({ error: { code: 'NOT_SUPPORTED', ... } });
    return;
}
```

---

## What Didn't Work

### No library issues found

The only friction was Express 5's stricter `req.params` typing (`string | string[]` instead of `string`), which required a small `asString()` helper. This is an Express issue, not an anchor library issue.

### Confirmed from previous rounds

- **Barrel `anchors/index.ts`** — subagent created a custom barrel exporting only the two providers needed (same pattern as rounds 1 and 2)
- **Freighter is browser-only** — correctly excluded from the server project. The subagent noted this was expected and documented

---

## Comparison Across All Rounds

| Dimension                  | Round 1: React + Etherfuse | Round 2: Next.js + BlindPay | Round 3: Express Backend |
| -------------------------- | :------------------------: | :-------------------------: | :----------------------: |
| Files needing modification |             2              |              0              |            0             |
| Library issues found       |             2              |     2 new, 2 confirmed      |    0 new, 1 confirmed    |
| Verdict                    |            8/10            |            9/10             |          10/10           |
| Browser APIs needed        |      Yes (Freighter)       |       Yes (Freighter)       |            No            |
| Backend proxy tested       |             No             |    Yes (Next.js routes)     |   Yes (Express routes)   |
| Multi-provider             |    No (Etherfuse only)     |     No (BlindPay only)      |        Yes (both)        |
| `AnchorError` instanceof   |         Not tested         |         Not tested          |        Validated         |
| Factory pattern ported     |     No (mock service)      |       Yes (server.ts)       |  Yes (anchorFactory.ts)  |

### Trend

The library's portability is improving with each round:

- Round 1 found real issues (`erasableSyntaxOnly`, barrel index)
- Round 2 found abstraction leaks (composite customer ID, stub behavior)
- Round 3 found nothing — the library is clean for server-side use

---

## Recommendations

No new recommendations from this round. The library works as a pure backend dependency without issues.

**Carry forward from previous rounds:**

- Fix composite customer ID leakiness (round 2)
- Improve copy instructions (barrel index, wallet callout)
- Consider making token config portable

---

## File Manifest

### Portable library files used (from `src/lib/`)

| File                          | Copied Verbatim |
| ----------------------------- | :-------------: |
| `anchors/types.ts`            |       Yes       |
| `anchors/etherfuse/client.ts` |       Yes       |
| `anchors/etherfuse/types.ts`  |       Yes       |
| `anchors/etherfuse/index.ts`  |       Yes       |
| `anchors/blindpay/client.ts`  |       Yes       |
| `anchors/blindpay/types.ts`   |       Yes       |
| `anchors/blindpay/index.ts`   |       Yes       |
| `wallet/stellar.ts`           |       Yes       |
| `wallet/types.ts`             |       Yes       |

### Express application files created

| File                             | Lines | Purpose                                           |
| -------------------------------- | ----: | ------------------------------------------------- |
| `src/index.ts`                   |   101 | Express app entry point, middleware, health check |
| `src/lib/anchorFactory.ts`       |    61 | Multi-provider factory with `process.env` config  |
| `src/routes/anchor.ts`           |   601 | 17 REST endpoints covering full Anchor interface  |
| `src/middleware/errorHandler.ts` |    44 | `AnchorError`-aware error middleware              |
| `src/lib/anchors/index.ts`       |   ~10 | Custom barrel (Etherfuse + BlindPay only)         |
| `src/lib/wallet/index.ts`        |    ~5 | Wallet barrel (no Freighter)                      |

---

## Appendix A: Subagent Prompt

The following prompt was given to the subagent verbatim:

> **Task: Build an Express Backend Using the Portable Anchor Library**
>
> You are a backend Node.js developer who has discovered the Stellar Regional Starter Pack — a SvelteKit application with a portable anchor integration library. You want to build a standalone Express + TypeScript API server that acts as a backend proxy for anchor integrations — the kind of server a React or mobile app would call.
>
> **Your Goal**
>
> Build a working Express + TypeScript API server that:
>
> 1. Instantiates anchor clients (Etherfuse and/or BlindPay) with configurable API keys
> 2. Exposes REST endpoints that proxy to the anchor clients
> 3. Demonstrates the full on-ramp and off-ramp flows via API
> 4. Includes proper error handling using the library's `AnchorError` type
> 5. Type-checks cleanly with `npx tsc --noEmit`
>
> This is a **server-side only** project. No browser, no wallet connection UI, no Freighter, no CORS concerns. The point is to validate that the portable anchor library works as a pure Node.js/Express backend dependency.
>
> **How to Work**
>
> 1. Start by reading the documentation and source code in the reference SvelteKit repo. Key files:
>     - `README.md` and `CLAUDE.md` — project overview
>     - `src/lib/anchors/README.md` — anchor library documentation
>     - `src/lib/anchors/types.ts` — shared Anchor interface and all common types
>     - `src/lib/anchors/etherfuse/client.ts` and `types.ts`
>     - `src/lib/anchors/blindpay/client.ts` and `types.ts`
>     - `src/lib/server/anchorFactory.ts` — the SvelteKit factory pattern
>     - `src/lib/wallet/stellar.ts` — Stellar SDK utilities
> 2. Decide what to copy into `_express-test/src/`. Maintain the relative directory structure.
> 3. Build the Express app. TypeScript, Express, and `@stellar/stellar-sdk` are installed. Use `tsx` to run.
> 4. Document everything in `_express-test/BUILD_JOURNAL.md`.
>
> **What to Build**
>
> - Anchor factory reading from `process.env`
> - REST endpoints mirroring the SvelteKit proxy pattern
> - Error handling using `AnchorError`
> - Capabilities endpoint
>
> **Key Things to Test**
>
> 1. Can the anchor clients be instantiated in Node.js?
> 2. Does AnchorError instanceof work?
> 3. Do types flow through Express handlers?
> 4. Can you build a multi-provider factory?
> 5. Any Node.js-specific issues?
>
> **Verification**: `npx tsc --noEmit` should pass with zero errors.
