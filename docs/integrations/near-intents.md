# Near Intents — Cross-Chain Execution

Near Intents provides a solver-based execution layer for cross-chain value transfer. Users express an intent ("I want USDC on Stellar") and NEAR-based solvers compete to route it from any source chain as efficiently as possible.

## What it does

Near Intents abstracts multi-step cross-chain operations into a single API call:

1. User holds crypto on any chain (BTC, ETH, SOL, NEAR, BNB, etc.)
2. TalkToStellar calls the 1Click API with input/output token identifiers
3. Competing solvers find the optimal bridging + swap route
4. USDC (or the requested asset) lands on Stellar in one user-facing step

The underlying route may involve any combination of bridges (Rainbow Bridge, Wormhole, LayerZero) and DEXs — all invisible to the user.

## How TalkToStellar uses it

**Use case: Receive value from other chains**

When a user abroad wants to fund their TalkToStellar account from BTC, ETH, or SOL:

1. Near Intents issues a deposit address on the source chain
2. User sends crypto to that address
3. Solvers bridge and convert to USDC
4. USDC arrives in the user's Stellar account

The user only sees: "Fundos recebidos" (Funds received). No mention of NEAR, bridges, or routes.

## API Reference

**Base URL:** `https://1click.chaindefuser.com/v0`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tokens` | GET | List all supported tokens and chains |
| `/quote` | POST | Request a quote from solvers |
| `/status/:id` | GET | Poll execution status |

### Quote request body

```json
{
  "defuse_asset_identifier_in": "nep141:wrap.near",
  "defuse_asset_identifier_out": "nep141:ft.usdc.near",
  "exact_amount_in": "1000000000000000000000000",
  "min_deadline_ms": 120000,
  "referral_id": "talktobrl.near"
}
```

## Token identifier format

Near Intents uses `defuse_asset_identifier` strings:

| Chain | Asset | Identifier |
|-------|-------|------------|
| NEAR | wNEAR | `nep141:wrap.near` |
| NEAR | USDC | `nep141:ft.usdc.near` |
| Bitcoin | BTC | `nep141:token.brrr.near` or bridge-wrapped |
| Ethereum | ETH | via Rainbow Bridge or Wormhole |

For Stellar USDC as the destination, the flow goes: source chain → NEAR USDC → Stellar USDC (via anchor or bridge).

## Local service

**File:** `backend/src/integrations/near-intents/service.ts`

| Method | Description |
|--------|-------------|
| `getTokens()` | Returns supported tokens, cached 10 min |
| `getQuote(input)` | Sends quote request to 1Click API |
| `getStellarUsdcIdentifier()` | Returns `nep141:ft.usdc.near` |
| `getSupportedRoutes()` | Filters tokens that end in USDC |

## Comparison with other inbound rails

| Rail | Source | Speed | Complexity |
|------|--------|-------|------------|
| Near Intents | BTC / ETH / SOL / NEAR | Minutes | Fully automated |
| Bridge.xyz | Wire / ACH / card | Hours–days | Fiat KYC required |
| Stellar anchors (SEP-24) | Bank account | Hours | Anchor-dependent |

Near Intents is uniquely suited for receiving crypto-native value from users who hold assets on other chains, without requiring them to have a Stellar account or know what Stellar is.

## Security notes

- Near Intents is a decentralized protocol — solvers are permissionless and compete on price
- TalkToStellar uses it only as an optional **inbound** rail (receiving), not for outbound transfers
- Solver execution is atomic — if the route fails, funds are returned to the sender
- Never exposed to end users by name; referred to only as "receber de outras redes"
