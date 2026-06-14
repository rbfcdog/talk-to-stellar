# Build Journal: Express Backend Using the Portable Anchor Library

## Goal

Build a standalone Express + TypeScript API server that validates the portability of the Stellar Regional Starter Pack's anchor integration library. The server acts as a backend proxy for anchor integrations -- the kind of server a React or mobile app would call.

## Step 1: Reading the Source

Read and analyzed the key files from the reference SvelteKit project:

- `src/lib/anchors/types.ts` -- The shared `Anchor` interface, `AnchorCapabilities`, all input/output types, and the `AnchorError` class.
- `src/lib/anchors/etherfuse/client.ts` and `types.ts` -- Full Etherfuse client implementation.
- `src/lib/anchors/blindpay/client.ts` and `types.ts` -- Full BlindPay client implementation.
- `src/lib/server/anchorFactory.ts` -- SvelteKit factory pattern that reads `$env/static/private`.
- `src/lib/wallet/stellar.ts` and `types.ts` -- Stellar SDK utilities (Horizon, transactions, trustlines).

**Key observation:** The anchor library is genuinely framework-agnostic. The only SvelteKit-specific code is the factory (`$env/static/private` imports) and the wallet's Freighter integration (browser API). The anchor clients use standard `fetch()` and `crypto.randomUUID()`, both available in Node.js 18+.

## Step 2: Deciding What to Copy

Copied into `_express-test/src/lib/`:

| Source                        | Destination                       | Why                                         |
| ----------------------------- | --------------------------------- | ------------------------------------------- |
| `anchors/types.ts`            | `lib/anchors/types.ts`            | Shared interface -- required by all clients |
| `anchors/etherfuse/client.ts` | `lib/anchors/etherfuse/client.ts` | Etherfuse client implementation             |
| `anchors/etherfuse/types.ts`  | `lib/anchors/etherfuse/types.ts`  | Etherfuse API types                         |
| `anchors/etherfuse/index.ts`  | `lib/anchors/etherfuse/index.ts`  | Re-exports                                  |
| `anchors/blindpay/client.ts`  | `lib/anchors/blindpay/client.ts`  | BlindPay client implementation              |
| `anchors/blindpay/types.ts`   | `lib/anchors/blindpay/types.ts`   | BlindPay API types                          |
| `anchors/blindpay/index.ts`   | `lib/anchors/blindpay/index.ts`   | Re-exports                                  |
| `wallet/stellar.ts`           | `lib/wallet/stellar.ts`           | Horizon utilities (server-compatible)       |
| `wallet/types.ts`             | `lib/wallet/types.ts`             | `StellarNetwork` type etc.                  |

**Not copied:**

- `anchors/alfredpay/` -- Decided to focus on two providers (Etherfuse + BlindPay) for a cleaner demo.
- `anchors/sep/` -- SEP protocol modules not needed for custom anchor API clients.
- `anchors/testanchor/` -- Test anchor client not relevant.
- `wallet/freighter.ts` -- Browser-only Freighter wallet API, not needed server-side.
- `anchors/index.ts` -- Created a new one that only exports the two providers we need.

**Zero modifications** were needed to the copied library files. They work as-is in Node.js/Express.

## Step 3: Building the Express App

### 3.1 Anchor Factory (`src/lib/anchorFactory.ts`)

Express equivalent of `$lib/server/anchorFactory.ts`. Key differences:

- Reads from `process.env` instead of `$env/static/private`
- Provides sensible defaults for base URLs (sandbox endpoints)
- Same lazy-instantiation and caching pattern
- Same `isValidProvider()` type guard

### 3.2 Routes (`src/routes/anchor.ts`)

Built a full Express router that mirrors the SvelteKit CORS proxy pattern:

| Method | Endpoint                                    | Operation                  |
| ------ | ------------------------------------------- | -------------------------- |
| GET    | `/:provider/capabilities`                   | Provider capabilities      |
| POST   | `/:provider/customers`                      | Create customer            |
| GET    | `/:provider/customers?email=`               | Lookup by email            |
| GET    | `/:provider/customers/:customerId`          | Get customer by ID         |
| GET    | `/:provider/kyc/:customerId`                | Get KYC URL                |
| GET    | `/:provider/kyc/:customerId/status`         | Get KYC status             |
| POST   | `/:provider/quotes`                         | Get quote                  |
| POST   | `/:provider/onramp`                         | Create on-ramp             |
| GET    | `/:provider/onramp/:id`                     | Get on-ramp status         |
| POST   | `/:provider/offramp`                        | Create off-ramp            |
| GET    | `/:provider/offramp/:id`                    | Get off-ramp status        |
| POST   | `/:provider/fiat-accounts`                  | Register fiat account      |
| GET    | `/:provider/fiat-accounts?customerId=`      | List fiat accounts         |
| POST   | `/:provider/blockchain-wallets`             | Register wallet (BlindPay) |
| GET    | `/:provider/blockchain-wallets?receiverId=` | List wallets (BlindPay)    |
| POST   | `/:provider/payout-submit`                  | Submit payout (BlindPay)   |
| POST   | `/:provider/sandbox/simulate-fiat-received` | Sandbox sim (Etherfuse)    |

Plus global endpoints:

- `GET /health` -- Health check
- `GET /api/providers` -- List all providers + capabilities

### 3.3 Error Handler (`src/middleware/errorHandler.ts`)

Express error middleware that handles `AnchorError` instances:

```json
{
    "error": {
        "code": "QUOTE_EXPIRED",
        "message": "Quote has expired",
        "statusCode": 400
    }
}
```

Falls back to a generic 500 response for non-AnchorError exceptions.

### 3.4 Entry Point (`src/index.ts`)

Express app with JSON body parsing, health check, provider listing, anchor routes, 404 handler, and error handler. Starts on `PORT` (default 3001).

## Step 4: Type Checking

### Express 5 Type Challenge

The project uses Express 5 (`express@5.2.1`) with `@types/express@5.0.6`. Express 5 types define `req.params` values as `string | string[]` (rather than just `string` in Express 4). This caused type errors when passing `req.params.provider` to functions expecting `string`.

**Solution:** Created an `asString()` helper that normalizes `string | string[]` to `string`, used throughout the route handlers for both params and query values. This is a clean pattern that could be extracted to a utility module.

### Result

```
$ npx tsc --noEmit
(zero errors)
```

## Findings

### 1. Can the anchor clients be instantiated in Node.js?

**Yes, completely.** No browser APIs are needed. Both `EtherfuseClient` and `BlindPayClient` instantiate cleanly with just config objects. They use:

- `fetch()` -- available globally in Node.js 18+
- `crypto.randomUUID()` -- available globally in Node.js 19+ (and via `crypto` module in 18+)
- Standard `JSON.stringify/parse`, `Date`, `URLSearchParams`

### 2. Does the AnchorError class work correctly?

**Yes.** The `AnchorError` class extends `Error` and carries `code` and `statusCode`. The `instanceof` check works correctly in the error handler middleware. The error middleware properly distinguishes `AnchorError` from generic `Error` instances.

### 3. Do the types flow through Express route handlers?

**Yes, with one caveat.** The input types (`CreateCustomerInput`, `GetQuoteInput`, etc.) work perfectly for structuring request bodies before passing to client methods. The return types (`Customer`, `Quote`, `OnRampTransaction`, etc.) flow through to `res.json()` correctly.

The caveat is Express 5's `req.params` typing as `string | string[]`. This requires explicit handling (the `asString()` helper) but is not related to the anchor library itself.

### 4. Can you build a multi-provider factory?

**Yes, trivially.** The factory pattern from the SvelteKit app translated 1:1 to Express. The only change was replacing `$env/static/private` imports with `process.env` reads. The `Map<AnchorProvider, Anchor>` caching pattern works identically.

### 5. Are there any Node.js-specific issues?

**None found.** The library is clean for Node.js 18+:

- `fetch()` is globally available
- `crypto.randomUUID()` is globally available
- No DOM APIs or browser-specific code
- No framework-specific imports
- The `@stellar/stellar-sdk` dependency works in both Node.js and browser

## Project Structure

```
_express-test/
├── package.json          # Express, TypeScript, tsx, @stellar/stellar-sdk
├── tsconfig.json         # ES2022, strict, bundler module resolution
├── BUILD_JOURNAL.md      # This file
└── src/
    ├── index.ts          # Express app entry point
    ├── middleware/
    │   └── errorHandler.ts  # AnchorError-aware error middleware
    ├── routes/
    │   └── anchor.ts     # All /api/anchor/:provider/* routes
    └── lib/
        ├── anchorFactory.ts  # Express anchor factory (process.env)
        ├── anchors/
        │   ├── types.ts      # Shared Anchor interface (copied as-is)
        │   ├── index.ts      # Re-exports for Express
        │   ├── etherfuse/    # Copied as-is from SvelteKit project
        │   │   ├── client.ts
        │   │   ├── types.ts
        │   │   └── index.ts
        │   └── blindpay/     # Copied as-is from SvelteKit project
        │       ├── client.ts
        │       ├── types.ts
        │       └── index.ts
        └── wallet/
            ├── types.ts      # StellarNetwork type (copied as-is)
            ├── stellar.ts    # Horizon utilities (copied as-is)
            └── index.ts      # Re-exports (no Freighter)
```

## Running the Server

```bash
# Start the server
npm start
# or: npx tsx src/index.ts

# Type check
npm run typecheck
# or: npx tsc --noEmit

# Test endpoints
curl http://localhost:3001/health
curl http://localhost:3001/api/providers
curl http://localhost:3001/api/anchor/etherfuse/capabilities
curl http://localhost:3001/api/anchor/blindpay/capabilities

# Test invalid provider (returns 400)
curl http://localhost:3001/api/anchor/invalid/capabilities

# Create a customer (requires valid API keys)
curl -X POST http://localhost:3001/api/anchor/etherfuse/customers \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","publicKey":"GXYZ..."}'
```

## Conclusion

The portable anchor library from the Stellar Regional Starter Pack works perfectly as a standalone Node.js dependency. Zero modifications were needed to the library source files. The main engineering work was:

1. Replacing SvelteKit's `$env/static/private` with `process.env` in the factory
2. Building Express route handlers that map HTTP requests to the `Anchor` interface methods
3. Handling Express 5's stricter `req.params` typing
4. Wiring up the `AnchorError`-aware error handling middleware

The library's design -- framework-agnostic clients that implement a shared `Anchor` interface, with framework-specific factories kept separate -- makes portability straightforward.
