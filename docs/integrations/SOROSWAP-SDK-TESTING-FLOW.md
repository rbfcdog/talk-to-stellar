# Soroswap SDK and Wallet Testing Flow

This document records the Soroswap SDK integration notes and the practical testing workflow for TalkToStellar. It answers the key operator question: quote screens do not need a wallet, but real swap execution does.

## What Soroswap Is For

Soroswap is the Stellar DEX aggregator used to find swap routes between Stellar assets, such as USDC -> XLM. In TalkToStellar, it powers the `/api/swap` routes and the Soroswap card on `/key-integrations`.

Soroswap is not the fiat ramp, not a bank payout provider, and not custody by itself. It returns prices and, when the route is available, an unsigned XDR transaction that a user's Stellar wallet must sign before anything moves on-chain.

## Current TalkToStellar Behavior

Current code paths:

- Frontend panel: `frontend/app/key-integrations/key-integrations-client.tsx`
- Backend routes: `backend/src/api/routes/soroswap.router.ts`
- Backend controller: `backend/src/api/controllers/soroswap.controller.ts`
- Backend service: `backend/src/integrations/soroswap/service.ts`
- Token config: `backend/src/integrations/soroswap/config.ts`

Current public endpoints:

| Purpose | Method | Path | Wallet needed? |
|---|---:|---|---|
| Token list | `GET` | `/api/swap/tokens` | No |
| Quote | `GET` | `/api/swap/quote?assetIn=USDC&assetOut=XLM&amount=10&tradeType=EXACT_IN` | No |
| Build unsigned XDR | `POST` | `/api/swap/build` | Public address needed |
| Sign XDR | Freighter / wallet / Stellar Lab | `/key-integrations` Freighter action or external wallet | Yes |
| Submit signed XDR | `POST` | `/api/swap/send` | Signed XDR required |

The current backend tries Soroswap first. If Soroswap quote/build infrastructure is unavailable, it can return a `stellar-broker-fallback` quote for pricing only:

```json
{
  "protocols": ["stellar-broker"],
  "source": "stellar-broker-fallback",
  "buildAvailable": false,
  "warning": "Soroswap quote API is unavailable; showing a Stellar Broker fallback quote. XDR build is unavailable for fallback quotes."
}
```

If the panel shows `Protocols: stellar-broker` or `Source: stellar-broker-fallback`, treat it as quote-only. Do not expect `/api/swap/build` to produce a Soroswap XDR for that fallback quote.

If Soroswap receives raw Soroban contract IDs but cannot find a route, the backend returns `source: "soroswap-unavailable"` with `buildAvailable: false`. This is also quote/build disabled; pick a different pair or network.

## Do I Need a Real Wallet?

Yes for actual use. No for quote-only testing.

| Action | Real Stellar wallet required? | Details |
|---|---:|---|
| View token list | No | Reads configured token list or fallback list. |
| Get a quote | No | Quote is read-only pricing. |
| Build swap XDR | Public key required | The transaction source must be a Stellar `G...` account. The wallet should exist on the selected network. |
| Sign swap XDR | Yes | You need the wallet secret, Freighter, LOBSTR, Stellar Lab signer, passkey wallet, or another signing tool. |
| Submit swap | Yes | The signed transaction spends the source wallet's assets and fees. |
| Mainnet execution | Yes, with real funds | Use only tiny test amounts until the full route is verified. |

For a USDC -> XLM swap, the wallet must hold enough USDC plus enough XLM for fees and minimum balance. For XLM -> USDC, the wallet receiving USDC must have the USDC trustline unless the transaction itself creates it.

## SDK Reference Saved From Prompt

The Soroswap SDK package is `@soroswap/sdk`.

Recommended backend pattern:

```ts
import { SoroswapSDK, SupportedNetworks } from "@soroswap/sdk";

const sdk = new SoroswapSDK({
  apiKey: process.env.SOROSWAP_API_KEY as string,
  baseUrl: process.env.SOROSWAP_API_URL,
  defaultNetwork: SupportedNetworks.MAINNET,
  timeout: 30000,
});
```

The SDK returns unsigned XDRs. The application must sign them with a user wallet or controlled test key, then submit the signed XDR:

```ts
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { SupportedNetworks } from "@soroswap/sdk";

const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.PUBLIC);
tx.sign(Keypair.fromSecret(process.env.STELLAR_SECRET_KEY as string));

const result = await sdk.send(tx.toXDR(), false, SupportedNetworks.MAINNET);
```

Important SDK rules:

- Keep `SOROSWAP_API_KEY` server-side. Do not expose an `sk_...` key in browser code.
- Quote amounts are `bigint` and are in smallest units. For 7-decimal Stellar assets, `1` token is `10000000`.
- Use `SupportedNetworks.MAINNET` or `SupportedNetworks.TESTNET` for SDK calls.
- Use `Networks.PUBLIC` or `Networks.TESTNET` from `@stellar/stellar-sdk` when parsing/signing XDR.
- If a quote includes `feeBps`, the build request must include `referralId`.

## Environment Checklist

Backend:

```bash
STELLAR_NETWORK=mainnet
SOROSWAP_API_URL=https://api.soroswap.finance
SOROSWAP_API_KEY=sk_...                 # required for SDK mode, optional in current REST wrapper when provider permits unauthenticated calls
SOROSWAP_DEFAULT_SLIPPAGE_BPS=50
STELLAR_WALLET_SPONSOR_SECRET=S...      # required only for backend-created funded wallets
```

Frontend proxy:

```bash
BACKEND_URL=http://localhost:3001
```

For mainnet, `STELLAR_WALLET_SPONSOR_SECRET` must be a real funded mainnet account if you want the backend wallet creator to fund new wallets. For testnet, use a funded testnet sponsor key.

## Step-By-Step Testing Workflow

### 1. Pick The Test Mode

Use one of these modes:

| Mode | Purpose | Funds at risk |
|---|---|---:|
| Quote-only | Verify token list and quote UI | None |
| Build-only | Verify Soroswap can produce unsigned XDR for a public key | None until signed |
| Testnet execution | Verify signing/submission mechanics | Testnet only |
| Mainnet micro-swap | Verify production route with tiny amount | Real funds |

The built-in token fallback in `backend/src/integrations/soroswap/config.ts` includes mainnet XLM/USDC/BRZ/BRLT and testnet XLM/USDC. If `STELLAR_NETWORK=testnet`, Soroswap still needs liquidity for the selected pair before a real build/send path exists.

### 2. Start The App

```bash
npm --prefix backend run dev
npm --prefix frontend run dev
```

Open:

```text
http://localhost:3000/key-integrations
```

### 3. Run Quote-Only Test

In the Soroswap card:

```text
From: USDC
To: XLM
Amount: 10
```

Expected quote-only output:

```text
Input: 10 USDC
Output: 47.6089662 XLM
Price impact: 0.0000%
Protocols: stellar-broker or soroswap/aqua/phoenix/sdex
```

Interpretation:

- `stellar-broker` means the backend showed a pricing fallback. This is useful for display, but not a Soroswap XDR build.
- `soroswap`, `aqua`, `phoenix`, or `sdex` means Soroswap returned a route that may be buildable.
- If `buildAvailable` is `false`, stop at quote testing.

Equivalent curl:

```bash
curl "http://localhost:3001/api/swap/quote?assetIn=USDC&assetOut=XLM&amount=10&tradeType=EXACT_IN"
```

### 4. Create A Test Wallet

Use this when you need a real public key for XDR build/sign/send testing.

Frontend proxy:

```bash
curl -X POST "http://localhost:3000/api/stellar-wallets" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "soroswap-test@example.com",
    "label": "Soroswap test wallet"
  }'
```

Backend direct:

```bash
curl -X POST "http://localhost:3001/api/stellar/wallets" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "soroswap-test@example.com",
    "label": "Soroswap test wallet"
  }'
```

Expected response shape:

```json
{
  "success": true,
  "wallet": {
    "public_key": "G...",
    "is_funded": true,
    "has_usdc_trustline": true,
    "label": "Soroswap test wallet"
  },
  "secret": "S...",
  "sponsor_note": "Wallet funded and USDC trustline added - ready for Bridge."
}
```

Security rule: the `secret` is shown once and is not stored by this endpoint. Save it only for test wallets. Do not paste production user secrets into logs, tickets, or docs.

### 5. Verify The Wallet Exists

For mainnet:

```bash
curl "https://horizon.stellar.org/accounts/G_PUBLIC_KEY"
```

For testnet:

```bash
curl "https://horizon-testnet.stellar.org/accounts/G_PUBLIC_KEY"
```

Also list saved wallets:

```bash
curl "http://localhost:3001/api/stellar/wallets?user_id=soroswap-test@example.com"
```

### 6. Fund The Wallet For The Swap

For quote-only and build-only tests, no asset balance is needed.

For real execution:

- The wallet needs XLM for fees and minimum reserve.
- The wallet needs the input asset balance, for example USDC for USDC -> XLM.
- The wallet needs trustlines for non-XLM assets it will hold.

Current wallet creation adds a USDC trustline when `STELLAR_WALLET_SPONSOR_SECRET` is configured and the sponsor transaction succeeds. It does not automatically deposit USDC. Use the product's on-ramp/test funding flow or a controlled funding wallet to send a small amount of USDC before a real USDC -> XLM test.

### 7. Build The Swap XDR

First save the full quote JSON from `/api/swap/quote`. Then call:

```bash
curl -X POST "http://localhost:3001/api/swap/build" \
  -H "Content-Type: application/json" \
  -d '{
    "quote": FULL_QUOTE_OBJECT_FROM_PREVIOUS_STEP,
    "senderAddress": "G_PUBLIC_KEY",
    "slippageBps": 50
  }'
```

Expected success:

```json
{
  "xdr": "AAAA...",
  "network": "TESTNET",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "quote": {
    "...": "..."
  }
}
```

Common failure:

```text
Soroswap XDR build unavailable for fallback quotes.
```

This means the quote came from `stellar-broker-fallback`; fix Soroswap API/key/provider availability or use the quote as display-only.

### 8. Sign And Submit The XDR

You have three practical options.

Option A: Use `/key-integrations` with Freighter:

1. Open `http://localhost:3000/key-integrations`.
2. In the Soroswap card, get a buildable non-fallback quote.
3. Connect Freighter.
4. Confirm Freighter network matches the backend network shown in the card.
5. Build XDR for the connected address.
6. Click the sign button, approve in Freighter, then click submit.
7. Save the returned transaction hash.

Option B: Sign with another wallet:

1. Import or connect the test wallet in Freighter, LOBSTR, or another Stellar wallet.
2. Confirm the wallet network matches `STELLAR_NETWORK`.
3. Paste/sign the unsigned XDR through the wallet.
4. Submit the signed XDR through:

```bash
curl -X POST "http://localhost:3001/api/swap/send" \
  -H "Content-Type: application/json" \
  -d '{ "signedXdr": "AAAA_SIGNED..." }'
```

Option C: Sign with Stellar Lab:

1. Open Stellar Lab transaction signer.
2. Pick the correct network passphrase.
3. Paste the unsigned XDR.
4. Sign with the test secret key.
5. Submit only after checking operations, source, assets, amount, and network.

Option D: Sign and submit from a local backend shell for test wallets:

```bash
cd backend
UNSIGNED_XDR='AAAA...' \
STELLAR_SECRET_KEY='S...' \
STELLAR_NETWORK='mainnet' \
node <<'NODE'
const { Keypair, Networks, TransactionBuilder, Horizon } = require('@stellar/stellar-sdk');

const network = process.env.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
const horizon = process.env.STELLAR_NETWORK === 'mainnet'
  ? 'https://horizon.stellar.org'
  : 'https://horizon-testnet.stellar.org';

const server = new Horizon.Server(horizon);
const tx = TransactionBuilder.fromXDR(process.env.UNSIGNED_XDR, network);
tx.sign(Keypair.fromSecret(process.env.STELLAR_SECRET_KEY));

server.submitTransaction(tx)
  .then((result) => {
    console.log(JSON.stringify({ hash: result.hash, successful: result.successful }, null, 2));
  })
  .catch((error) => {
    console.error(error.response?.data || error);
    process.exit(1);
  });
NODE
```

For SDK-native submission, install `@soroswap/sdk` and call `sdk.send(signedXdr, false, SupportedNetworks.MAINNET)` after signing.

### 9. Verify The Result

Check the transaction hash in Stellar Expert or Horizon:

```bash
curl "https://horizon.stellar.org/transactions/TX_HASH"
```

Then check balances:

```bash
curl "https://horizon.stellar.org/accounts/G_PUBLIC_KEY"
```

Expected outcome for USDC -> XLM:

- USDC balance decreases by the swap input plus any fees.
- XLM balance increases by the output amount minus network effects/reserves.
- Transaction hash exists on the selected network.

## What The `/key-integrations` Soroswap Card Should Mean

When it shows:

```text
Soroswap - Multi-Protocol DEX
Token List (4)
USDC, XLM, BRZ, BRLT
```

That means token discovery is working, or the built-in fallback list is active.

When it shows:

```text
Input 10 USDC
Output 47.6089662 XLM
Protocols stellar-broker
```

That means price discovery works through fallback pricing. It does not prove Soroswap can build an executable XDR.

When it shows `Build Swap Transaction (XDR)`, the user must enter a real `G...` Stellar public key. The output is still unsigned. Nothing moves until the wallet signs and submits it.

## Production Flow Target

The production-grade flow should be:

```text
User asks to swap
  -> Backend resolves source asset, destination asset, amount, and user wallet
  -> Backend gets Soroswap quote
  -> Backend rejects fallback quotes for execution or shows them as estimate-only
  -> Backend builds unsigned XDR for the user's wallet
  -> User signs with wallet/passkey/approved signing flow
  -> Signed XDR is submitted
  -> Backend records tx hash, quote, route, and status
  -> UI/agent shows completed swap with input, output, fee, and hash
```

Soroswap's role is only the quote/build/send rail for token swaps. Wallet creation, funding, KYC, fiat on-ramp, and payout are separate TalkToStellar or provider flows.

## Minimum Acceptance Checklist

- `/api/swap/tokens` returns tokens.
- `/api/swap/quote` returns quote fields: input, output, price impact, protocols.
- Fallback quote shows `buildAvailable: false`.
- Non-fallback Soroswap quote can build XDR with a real sender address.
- The sender wallet exists on the selected network.
- The sender wallet has enough input asset and XLM for fees/reserve.
- The user signs the XDR with the correct network passphrase.
- Submitted transaction hash is visible on Horizon/Stellar Expert.
- Balances changed as expected.
- Test evidence records quote JSON, XDR build response, signed transaction hash, before/after balances, and network.
