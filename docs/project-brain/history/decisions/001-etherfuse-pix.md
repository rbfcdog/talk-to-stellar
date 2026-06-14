# ADR-001: Etherfuse as Primary PIX Provider

**Date**: May 2026
**Status**: Accepted

## Context
Need a PIX on/off-ramp provider for Brazilian users to move BRL in/out of the Stellar ecosystem. Options evaluated:
1. Etherfuse — sandbox API, TESOURO token, KYC included
2. Bridge.xyz (Stripe) — virtual accounts, PIX/ACH
3. BlindPay — PIX payins, Stellar mainnet support

## Decision
**Etherfuse chosen as primary PIX provider.** Bridge.xyz kept as alternate rail (PIX→ACH flow). BlindPay explored later as a dedicated Stellar on-ramp option.

## Reasons
1. **TESOURO/BRL tokens on Stellar**: Etherfuse mints Brazilian treasury bond tokens that can be auto-converted to USDC
2. **KYC included**: No separate KYC provider needed
3. **Sandbox availability**: API sandbox for testing without real BRL
4. **Webhook for PIX confirmation**: Real-time payment status updates

## Consequences
- Sandbox only (no real BRL until production)
- Sandbox timing issues: token minting lag causes "balance not credited" (#32)
- Monolithic AnchorService (8920 lines) — difficult to maintain
- Etherfuse API is not well-documented; required reverse-engineering
