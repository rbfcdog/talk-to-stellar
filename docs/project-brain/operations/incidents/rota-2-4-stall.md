# Rota 2/4 Stall — Incident Report

**Pain point #8**

## Symptom
> "em apenas uma conta específica do meu amigo, quando ele faz uma transferência pix pra outra pessoa, da erro 'a operação parou antes de concluir' na parte da transação e rota calculada 2/4"

Translation: One specific friend's account always fails at step 2/4 "rota calculada" (pathfinding) during PIX transfer. The operation stops before concluding.

## Diagnosis

Step 2/4 "rota calculada" corresponds to Stellar pathfinding: `Horizon.strictSendPaths()` is called to find a conversion path from the sender's asset to the destination asset.

### Most Likely Cause

The friend's account is **missing a trustline** for the destination asset. On Stellar, an account cannot receive an asset unless it has an active trustline for that asset's issuer.

### Verification Steps

```bash
# Check the friend's account trustlines
curl https://horizon-testnet.stellar.org/accounts/{friend_public_key} | jq '.balances'

# Look for the destination asset (e.g., USDC from GA5ZSEJ...)
# If missing → trustline needed
```

## Fix

1. **Pre-flight check**: Before calling pathfinding, verify the destination account has the required trustline
2. **Specific error**: If missing, tell the user exactly what's wrong:
   > "Fulano não pode receber USDC. Peça para ele ativar em Configurações > Carteira > Adicionar Ativo."
3. **Never show generic error**: "Operação parou" tells the user nothing actionable

## Files Involved

- `backend/src/api/services/stellar.service.ts:884-961` — pathfinding (quotePathPayment, quoteStrictSendConversion)
- `backend/src/api/services/stellar.service.ts:334` — selectTrustedConversionPaths (filters to trusted assets only)
- Frontend error display — generic "operação parou" message

## Root Cause Category

**Missing pre-condition validation.** The system attempts pathfinding without first checking if both accounts are capable of sending/receiving the assets. The error surfaces as a generic failure instead of a specific, actionable message.
