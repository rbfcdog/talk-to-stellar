# PagFinance — PIX Cash-In (Pix → USDC on Stellar)

> **Living document.** The VERIFIED API contract (tested live against
> `https://sandbox.brlp.io` on 2026-07-27) — trust this over the partner
> integration guide, which is out of date in places (marked below).
> Spec: `docs/specs/spec-pagfinance-pix-cashin.md` · Issues: ISS-001..007.

## What it does

PagFinance handles the fiat leg only: we create a cash-in intent, show the
Pix QR to the user, and receive a `CASHIN_COMPLETED` webhook when it is paid.
**They never custody or credit crypto** — our backend pays USDC from our
treasury to the user's Stellar wallet (`backend/src/integrations/pagfinance/credit.ts`),
at OUR BRL→USDC rate locked at intent time. Their `cryptoEstimate` is advisory
(their asset catalog is Solana/XRPL — the quote references SOL).

Cash-out (crypto → Pix) is out of scope: their instruction leg signs
Solana v0 / XRPL transactions, not Stellar.

## Verified API contract (diverges from the partner guide)

- **Auth (HMAC-SHA256)**: as documented — signingKey `SHA256(rawSecret:partnerId)`,
  canonical `METHOD\nPATH\nTS\nNONCE\nSHA256(body)`, strict header format.
  Implemented in `backend/src/integrations/pagfinance/hmac.ts`.
- **User creation** — `POST /api/v1/users` requires
  `{ uid, pubkey, blockchain }`, **not** `{ pubkey }` as the guide says:
  - `uid` is the primary identifier ("uid inválido." without it);
  - `pubkey` is only stored when `blockchain` is present — and
    **`blockchain: "stellar"` is accepted**;
  - creation is idempotent by uid and does NOT update existing records —
    the pubkey must be set on FIRST creation;
  - without a stored pubkey, minted JWTs carry an empty `pubkey` claim and
    every cashin endpoint returns 401 `"JWT sem pubkey."`.
  We use the user's Stellar G-key as both `uid` and `pubkey`.
- **KYC**: `PATCH /api/v1/users/{uid}/kyc {kycLevel:1, kycStatus:'APPROVED'}`
  (sandbox-only manual override per their OpenAPI). Checked live at request
  time, not embedded in the JWT.
- **JWT**: `POST /api/v1/auth/token {pubkey}` — works with the uid value.
- **Cash-in**: `POST /api/v1/cashin/quote` (advisory, SOL-based) and
  `POST /api/v1/cashin/intent {amount, customer:{name, taxID}}` → 201 with
  `brCode` (Woovi/OpenPix), `qrCodeImage`, `paymentLinkUrl`, `expiresIn`.
- **Webhook**: HMAC-SHA256 over the RAW body, `X-App-Signature: sha256=<hex>`;
  register once via `POST /api/v1/partners/me/webhook-config`
  (`npm run pagfinance:setup-webhook`). Retries 3x (2/4/8s), duplicates
  possible, no ordering — our receiver dedupes via an atomic
  `PENDING→CREDITING` claim on the operation row.
- **Real OpenAPI**: `https://sandbox.brlp.io/openapi.json` (much larger
  surface than the guide — merchant endpoints — and mostly schema-less).
- **Sandbox**: banking runs in dry-run; a cash-in intent never completes by
  itself and there is NO simulate-payment endpoint — the paid path is
  exercised with `npm run pagfinance:e2e -- --replay-webhook <intentId>`.

## Our implementation map

| Piece | Where |
|---|---|
| HMAC + webhook verify | `backend/src/integrations/pagfinance/hmac.ts` |
| HTTP client (retry, idempotency) | `backend/src/integrations/pagfinance/client.ts` |
| Service (provisioning, JWT cache, cash-in) | `backend/src/integrations/pagfinance/service.ts` |
| USDC credit leg (both networks) | `backend/src/integrations/pagfinance/credit.ts` |
| Settlement (claim + credit + receipt) | `backend/src/integrations/pagfinance/settlement.ts` |
| Session API `/api/pagfinance/cashin/*` | `backend/src/api/controllers/pagfinance.controller.ts` |
| Webhook receiver `/webhook/pagfinance` | `backend/src/api/controllers/pagfinance-webhook.controller.ts` |
| Frontend switch + slim client | `frontend/app/pix-on/pix-on-switch.tsx`, `pagfinance-onramp-client.tsx` |
| Ops scripts | `backend/scripts/setup-pagfinance-webhook.ts`, `pagfinance-e2e.ts` |

Config keys: see the PagFinance block in `backend/.env.example`. Network for
the credit leg follows `STELLAR_NETWORK`; USDC issuer via `USDC_ISSUER` /
network defaults; platform fee via `TALKTOSTELLAR_SPREAD_BPS`.

## Production rollout checklist

Operational steps — each requires coordination; none is automated:

- [ ] **Fund the mainnet USDC treasury** and set
  `PAGFINANCE_USDC_TREASURY_SECRET` (startup warns when enabled without it).
  Verify with a low-value credit first.
- [ ] Set `PAGFINANCE_FALLBACK_BRL_PER_USDC` (the on-chain TESOURO/USDC path
  has no mainnet liquidity — without either source, intents are refused).
- [ ] Switch the four `PAGFINANCE_*` credential envs to production values
  (deployment env only — never in files).
- [ ] Register the production webhook: `npm run pagfinance:setup-webhook`
  (requires `APP_PUBLIC_WEBHOOK_URL`).
- [ ] Run a live replay against the deployed backend
  (`pagfinance:e2e -- --replay-webhook`) and confirm: operation COMPLETED,
  USDC delta on Horizon, receipt in chat/Telegram, single history entry.
- [ ] **Rotate the sandbox secrets** (`POST /partners/me/rotate-secret` +
  `rotate-webhook-secret`) — they circulated in plain text in the shared
  integration guide. Coordinate with the PagFinance contact first: rotation
  invalidates the old values immediately.
- [ ] First real-money test: minimum amount, own CPF, confirm the full loop
  before announcing.
