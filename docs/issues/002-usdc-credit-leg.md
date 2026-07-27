---
id: ISS-002
spec: SPEC-pagfinance-pix-cashin
status: pending
depends_on: [ISS-001]
created: 2026-07-27
---

# Perna de crédito USDC em duas redes

## Overview

Criar `backend/src/integrations/pagfinance/credit.ts`: a função
`creditUsdcToUser` que paga USDC da treasury para a wallet Stellar do usuário,
com o mesmo código em testnet e mainnet (`STELLAR_NETWORK` decide treasury,
issuer, trustline e destino). Inclui `resolveCreditDestination` (session
wallet → `stellar_mainnet_wallets` → `bridge_stellar_wallets`) e o pagamento
atômico crédito+fee. É uma issue única porque isola a única parte que move
dinheiro on-chain, testável de forma independente das rotas e do webhook.

## Surface

- [x] Application code
- [x] Data or infrastructure
- [x] Tests
- [ ] Documentation

## Spec coverage

Seção 2.4 (perna de crédito) e o risco de treasury mainnet da seção de riscos.
Fase 2 da implementação.

## Acceptance criteria

- [ ] Treasury resolvida na ordem `PAGFINANCE_USDC_TREASURY_SECRET` → `STELLAR_SECRET_KEY` → (mainnet) cadeia de sponsor de `bridge.controller.ts:386-395`; ausência → falha explícita com erro claro, nunca crédito parcial.
- [ ] USDC resolvido por `resolveConfiguredAsset('USDC')` (`config/assets.ts:101`) com issuer correto por rede.
- [ ] Trustline garantida antes do pagamento: `TrustlineService.ensureTrustline` em testnet; sponsored-trustline (padrão `bridge.controller.ts:414-490`, reimplementado local) em mainnet.
- [ ] Crédito ao usuário + fee para a treasury de fees submetidos numa única transação via `StellarService.submitAssetPaymentsFromSecret` (`stellar.service.ts:1191`), memo `PIX PAGFINANCE`, retornando o hash.
- [ ] `resolveCreditDestination` cobre as duas redes e falha explícito quando nenhum destino existe na rede ativa.
- [ ] Startup valida: `PAGFINANCE_ENABLED` em `PUBLIC` sem treasury USDC configurada gera aviso/falha visível.
- [ ] Teste unitário fino de resolução de treasury/destino com env stubado (submissão Stellar já coberta pelos testes existentes do `stellar.service`).

## Notes

Não chamar os helpers privados do `AnchorService`
(`settleSandboxOnRampFinalAsset`, `platformFeePaymentForAsset`) — são
`private static` e acoplados ao mock Etherfuse/TESOURO; extrair caminho limpo.
Risco aberto: não existe treasury USDC mainnet fundada hoje — provisionamento é
pré-requisito operacional do rollout (ISS-007), não desta issue.
