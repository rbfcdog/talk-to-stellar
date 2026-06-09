# TalkToStellar — Fee Structure

## User-Facing Fees

| Operation | User Pays | Breakdown |
|---|---|---|
| **BRL → USDC (PIX on-ramp)** | ~0.80% total | 0.50% Bridge + 0.30% TalkToStellar |
| **USDC → BRL (PIX off-ramp)** | ~0.80% total | 0.50% Bridge + 0.30% TalkToStellar |
| **USDC → USD (ACH off-ramp)** | ~0.50% total | 0.30% TalkToStellar + Bridge ACH fee |
| **BRL → USDC conversion (internal)** | 0.30% | TalkToStellar only |
| **Payment to contact (same asset)** | Free | On-chain Stellar fee only ($0.00001) |

## Comparison: R$5,000 Conversion to USD

| Provider | User Receives | Total Cost | Cost % |
|---|---|---|---|
| **TalkToStellar** | ~$875 | R$ 40 | 0.80% |
| Wise | ~$868 | R$ 68 | 1.36% |
| Remessa Online | ~$860 | R$ 110 | 2.20% |
| Banco Tradicional | ~$835 | R$ 250 | 5.00% |
| Binance P2P | ~$885 | R$ 25 | 0.50% |

*Rates as of June 2026. BRL/USD at 5.60.*

## TalkToStellar Revenue

| Transaction | Flow | TTS Cut (0.30%) |
|---|---|---|
| User converts R$1,000 → USDC | R$1,000 | R$ 3.00 |
| User converts R$5,000 → USDC | R$5,000 | R$ 15.00 |
| User off-ramps $1,000 → BRL PIX | R$5,600 | R$ 16.80 |
| User off-ramps $200 → US bank ACH | $200 | $0.60 |

## Fee Transparency (User Sees Before Confirming)

```
 ┌─────────────────────────────────────┐
 │  Conversão BRL → USDC               │
 │                                     │
 │  Você envia:    R$ 1.000,00         │
 │  Taxa Bridge:   R$   5,00  (0.50%)  │
 │  Taxa TTS:      R$   3,00  (0.30%)  │
 │  Você recebe:  ~$ 177,00            │
 │                                     │
 │  Economia vs banco: R$ 22,00        │
 │                                     │
 │  Comprovante Stellar incluso.       │
 └─────────────────────────────────────┘
```

## Fee Distribution

```
User sends R$1,000 via PIX
  │
  ├─ R$ 5.00 → Bridge.xyz   (PIX rail + conversion + compliance)
  ├─ R$ 3.00 → TalkToStellar (platform fee)
  └─ R$ 992.00 → User's USDC (on Stellar, verifiable)
```

## No Hidden Fees

- **No IOF** — Bridge handles as regulated US institution; IOF built into their rate
- **No spread on exchange rate** — Bridge rate is the real rate; we add 0.30% transparently
- **No minimum balance** — No maintenance fees
- **No withdrawal fee** — PIX out is the same 0.30% spread
- **Stellar network fee**: $0.00001 per transaction (effectively free)
