---
id: ISS-002
spec: SPEC-pagfinance-pix-cashin
status: completed
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

- [x] Treasury resolvida na ordem `PAGFINANCE_USDC_TREASURY_SECRET` → `STELLAR_SECRET_KEY` → (mainnet) cadeia de sponsor de `bridge.controller.ts:386-395`; ausência → falha explícita com erro claro, nunca crédito parcial.
- [x] USDC resolvido por `resolveConfiguredAsset('USDC')` (`config/assets.ts:101`) com issuer correto por rede.
- [x] Trustline garantida antes do pagamento: `TrustlineService.ensureTrustline` em testnet; sponsored-trustline (padrão `bridge.controller.ts:414-490`, reimplementado local) em mainnet.
- [x] Crédito ao usuário + fee para a treasury de fees submetidos numa única transação via `StellarService.submitAssetPaymentsFromSecret` (`stellar.service.ts:1191`), memo `PIX PAGFINANCE`, retornando o hash.
- [x] `resolveCreditDestination` cobre as duas redes e falha explícito quando nenhum destino existe na rede ativa.
- [x] Startup valida: `PAGFINANCE_ENABLED` em `PUBLIC` sem treasury USDC configurada gera aviso/falha visível.
- [x] Teste unitário fino de resolução de treasury/destino com env stubado (submissão Stellar já coberta pelos testes existentes do `stellar.service`).

## Notes

Não chamar os helpers privados do `AnchorService`
(`settleSandboxOnRampFinalAsset`, `platformFeePaymentForAsset`) — são
`private static` e acoplados ao mock Etherfuse/TESOURO; extrair caminho limpo.
Risco aberto: não existe treasury USDC mainnet fundada hoje — provisionamento é
pré-requisito operacional do rollout (ISS-007), não desta issue.

## Plan

### Comportamento atual e padrões reutilizáveis

- `StellarService.submitAssetPaymentsFromSecret` (`stellar.service.ts:1191`)
  já faz multi-payment + memo numa tx e **segue `STELLAR_NETWORK`** (o
  `server`/passphrase vêm de `config/stellar.ts:32-41`); `ensureTestnetAccountFunded`
  é no-op fora de testnet. Um único caminho serve as duas redes.
- USDC por rede: `resolveConfiguredAsset('USDC')` (`config/assets.ts:101`)
  com `PUBLIC_USDC_ISSUER`/`TESTNET_USDC_ISSUER` (`assets.ts:8-9`) e override
  `USDC_ISSUER`; rede via `getStellarNetworkName()` (`assets.ts:32`).
- Trustline testnet: `TrustlineService.ensureTrustline(publicKey, secretKey,
  userId, asset)` (`trustline.service.ts:328`) — friendbot + top-up embutidos.
- Trustline mainnet patrocinada: padrão em `bridge.controller.ts:414-490`
  (`beginSponsoringFutureReserves` + `changeTrust` + `endSponsoring`, sponsor
  de `resolveSponsorSecret()` `:386-395`, secret do wallet via
  `wallets`/`bridge_stellar_wallets`.`vault_secret_id` +
  `VaultService.getSecret` `core/vault.service.ts:60`) — module-private lá,
  reimplementar local usando o `server`/`stellarConfig` network-aware.
- Fee: `PlatformFeeService.calculateSpread` (`platform-fee.service.ts:68`) —
  já aplica `TALKTOSTELLAR_SPREAD_BPS` + mínimo para par USDC/BRL e expõe
  `treasuryPublicKey` (`getTreasuryPublicKey` `:59`). O cálculo acontece na
  ISS-003 (intent); aqui a fee chega pronta como valor.
- Destinos: `wallets` (session, testnet-born), `stellar_mainnet_wallets`
  (`mainnet-wallet.service.ts:114+`, `getPrimaryWallet(sessionId, userId)`
  `:227`), `bridge_stellar_wallets` por email (`is_primary`,
  `20260623_00_bridge_stellar_wallets.sql`).
- Supabase: `import { supabase } from '../../config/supabase'`; estilo de mock
  nos testes: `jest.mock('<módulo>')` (`bridge-webhook.controller.test.ts:23`).

### Testes a escrever primeiro

`backend/tests/pagfinance-credit.test.ts` (env stubado, supabase e
StellarService mockados — sem rede):
1. Resolução de treasury na ordem `PAGFINANCE_USDC_TREASURY_SECRET` →
   `STELLAR_SECRET_KEY` → (só PUBLIC) cadeia de sponsor; vazio → erro claro.
2. `resolveCreditDestination`: TESTNET retorna a session wallet; PUBLIC usa a
   source key quando existe na Horizon, cai para `stellar_mainnet_wallets` e
   depois `bridge_stellar_wallets`; nenhum → `{success:false}` explícito.
3. `creditUsdcToUser` monta os payments certos (usuário + fee só quando
   `usdcFee > 0` e treasury de fee configurada) e propaga o hash; falha da
   submissão → `{success:false, error}` sem throw.
4. `validateCreditReadiness` avisa quando ENABLED em PUBLIC sem treasury.

### Passos de implementação

1. `backend/tests/pagfinance-credit.test.ts` (vermelho).
2. `backend/src/integrations/pagfinance/credit.ts`:
   - `resolveTreasurySecret(network)` — ordem acima, `''` → null.
   - `resolveCreditDestination({network, sourcePublicKey, sessionId?, userId?,
     email?})` — TESTNET: `sourcePublicKey`; PUBLIC: Horizon
     `server.loadAccount(sourcePublicKey)` → `stellar_mainnet_wallets`
     (primary por session/user) → `bridge_stellar_wallets` por email
     (primary primeiro); falha explícita com motivo.
   - `ensureUsdcTrustlineForCredit({network, publicKey, userId})` — TESTNET:
     `TrustlineService.ensureTrustline` com secret do vault
     (`wallets.vault_secret_id` por public_key); PUBLIC: changeTrust
     patrocinado (padrão bridge.controller) com secret de
     `wallets`/`bridge_stellar_wallets` e sponsor da cadeia.
   - `creditUsdcToUser({destinationPublicKey, usdcNet, usdcFee, userId,
     memoText})` — treasury → asset → trustline → 
     `submitAssetPaymentsFromSecret` (payment do usuário + fee para
     `PlatformFeeService.getTreasuryPublicKey()` quando aplicável), retorna
     `{success, hash?, error?}`.
   - `validateCreditReadiness()` — warn alto quando enabled+PUBLIC sem
     treasury; chamada no `initPagfinanceService()`.
3. Export no `index.ts`; hook de validação no `service.ts`
   (`initPagfinanceService`).

### Migrações e compatibilidade

Nenhuma migration; nenhuma tabela nova. Módulo ainda sem chamadores de
produção (o webhook da ISS-004 será o primeiro).

### Documentação

Nenhuma nesta issue (ISS-007).

### Validação

```bash
cd backend && npx tsc --noEmit
npx jest tests/pagfinance-credit.test.ts
npx jest tests/pagfinance-hmac.test.ts tests/pagfinance-client.test.ts tests/pagfinance-service.test.ts
```

### Riscos e não objetivos

- Trustline mainnet patrocinada exige a secret do wallet no vault — wallets
  externos (attach de public key) não têm secret e falham explícito; correto,
  pois não podemos assinar changeTrust por eles.
- Fee treasury ausente ⇒ paga-se só o usuário (fee zerada) — mesmo
  comportamento do fluxo Etherfuse.
- Não objetivos: cálculo de taxa/fee (ISS-003), disparo do crédito
  (ISS-004), provisionamento da treasury mainnet (ISS-007).

## Implementation

Implementado em 2026-07-27 (testes primeiro, depois o módulo):

- `credit.ts` com `resolveTreasurySecret` (ordem PAGFINANCE → STELLAR_SECRET_KEY
  → cadeia de sponsor só em PUBLIC), `resolveCreditDestination` (TESTNET =
  session wallet; PUBLIC = Horizon → `stellar_mainnet_wallets` primary/any →
  `bridge_stellar_wallets` por email primary/any; falha explícita),
  `ensureUsdcTrustlineForCredit` (check de trustline existente via Horizon;
  TESTNET → `TrustlineService.ensureTrustline` com secret do vault; PUBLIC →
  changeTrust patrocinado com `stellarConfig.network`), `creditUsdcToUser`
  (treasury → asset por rede → trustline → `submitAssetPaymentsFromSecret`
  com payment do usuário + fee atômica, memo `PIX PAGFINANCE`) e
  `validateCreditReadiness` (warn de boot sem treasury, ligado no
  `initPagfinanceService` via import lazy).

### Arquivos alterados

- `backend/src/integrations/pagfinance/credit.ts` (novo)
- `backend/src/integrations/pagfinance/index.ts` (exports)
- `backend/src/integrations/pagfinance/service.ts` (readiness check no init)
- `backend/tests/pagfinance-credit.test.ts` (novo, 18 testes)

### Validação executada

- `npx tsc --noEmit`: passou (após corrigir issuer `string | undefined`).
- `npx jest tests/pagfinance-*.test.ts`: 4 suítes, 51/51 testes.

## Review

Revisado em 2026-07-27 contra a spec §2.4 e o plano.

### Findings

1. **Médio — resolvido:** primeira versão passava `asset.issuer`
   (`string | undefined`) direto ao `TrustlineService.ensureTrustline`
   (exige `string`) — pego pelo `tsc`, corrigido com fallback `''` (o
   `resolveConfiguredAsset('USDC')` sempre retorna issuer na prática).
2. **Baixo — aceito:** `submitSponsoredTrustline` sem sponsor configurado cai
   para changeTrust pago pelo próprio wallet — exige XLM próprio; comportamento
   idêntico ao fluxo Bridge e só alcançável se toda a cadeia de sponsor
   estiver vazia.
3. **Baixo — aceito por design:** fee payment é omitida quando
   `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY` não está configurada ou é igual ao
   destino — paridade com o fluxo Etherfuse.
4. Nenhum finding crítico/alto aberto.

### Evidências e validações

- Ordem de resolução de treasury e cadeia de sponsor cobertas por teste
  (4 casos), incluindo o caso "nada configurado → null".
- Resolução de destino coberta nas duas redes (5 casos), incluindo falha
  explícita sem destino mainnet.
- Montagem de payments (com/sem fee), falha sem treasury (sem submit), falha
  de trustline (sem submit) e propagação de erro de submissão cobertas.
- Boot warning coberto (PUBLIC + enabled sem treasury → `ok:false`).

### Riscos residuais

- A submissão patrocinada de trustline mainnet não tem teste de integração
  (exigiria Horizon) — será exercitada no rollout (ISS-007) com valores baixos.
- Treasury USDC mainnet segue não provisionada — pré-requisito operacional
  registrado na ISS-007.
