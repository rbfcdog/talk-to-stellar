# Stellar Mainnet Hardening Scan

Data: 2026-05-18

Este scan cobre a preparacao Mainnet sem ativar Mainnet no produto. O runtime
deve continuar em Testnet ate um cutover aprovado.

Referencia oficial usada para validar rede, passphrases e Friendbot:
https://developers.stellar.org/docs/networks

## Escopo

Arquivos revisados:

- `backend/src`
- `backend/scripts`
- `backend/migrations`
- `frontend`
- `telegram`
- `evolution`
- `docs`

Ferramentas usadas:

- `rg` para buscar rede, Horizon, Friendbot, passphrases, secrets, signing e migrations.
- `npm run stellar:mainnet:audit` para scan estatico repetivel.
- Revisao manual dos services Stellar, scripts de liquidez, scripts de backfill e docs.

Resultado do auditor neste estado:

```text
pass=6, review=2, fail=0
```

## Correcoes feitas agora

### 1. Guard de runtime Public/Mainnet

Arquivo: `backend/src/config/stellar.ts`

Problema:

Antes, bastava configurar `STELLAR_NETWORK=PUBLIC` para o backend passar a usar
`Networks.PUBLIC`. Isso e perigoso em Railway ou qualquer ambiente com variavel
errada, porque poderia colocar o runtime em Mainnet antes do cutover.

Correcao:

- `STELLAR_NETWORK=PUBLIC` agora falha no startup se
  `STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=true` nao estiver explicito.
- Testnet continua default.
- Se PUBLIC for liberado futuramente, o default de Horizon vira
  `https://horizon.stellar.org`.
- Friendbot fica `undefined` em PUBLIC.
- Configuracoes obvias de rede/Horizon inconsistentes agora falham no startup.

Impacto:

O produto continua Testnet. A mudanca apenas impede ativacao Mainnet acidental.

### 2. Passphrases Stellar corrigidas

Arquivos:

- `backend/src/services/stellar.service.ts`
- `backend/tests/stellar-sdk.test.ts`

Problema:

O service legado tinha literais errados:

- `Public Global Stellar Network ; May 2015`
- `Test StellarNetwork ; September 2015`

Esses valores geram envelopes assinados para a rede errada. Em Mainnet, isso
quebraria submissao de transacoes e mascararia erro como falha de Horizon.

Correcao:

- O service legado usa `stellarConfig.network`.
- Os testes usam `StellarSDK.Networks.TESTNET`.
- O auditor agora procura esses literais invalidos.

### 3. Friendbot bloqueado fora de Testnet

Arquivo: `backend/src/api/services/stellar.service.ts`

Problema:

Friendbot so existe para Testnet/Futurenet. Qualquer codigo que tente funding
automatico em Mainnet e um erro conceitual e operacional.

Correcao:

- `fundWithFriendbot` agora falha se a rede ativa nao for Testnet.

### 4. Guard para scripts de Testnet

Arquivos principais:

- `backend/scripts/stellar-script-safety.ts`
- `backend/scripts/first-testnet-transaction.ts`
- `backend/scripts/setup-testnet-brl-liquidity.ts`
- `backend/scripts/setup-xlm-usdc-liquidity.ts`
- `backend/scripts/rebalance-testnet-brl-market.ts`
- `backend/scripts/test-usdc-issuer.ts`
- `backend/scripts/create-issuers.ts`
- `backend/scripts/debug-path-quotes.ts`
- `backend/scripts/seed-users.ts`

Problema:

Scripts de setup usam Friendbot, criam issuers, criam liquidez e assinam
transacoes. Eles sao uteis em Testnet, mas nao podem rodar por engano contra
Mainnet.

Correcao:

- Criado `assertTestnetOnlyScript`.
- Scripts de Testnet agora recusam `STELLAR_NETWORK=PUBLIC` e URLs obvias de
  Horizon Mainnet.

### 5. Guard para bulk mutations

Arquivos:

- `backend/scripts/add-trustlines-all.ts`
- `backend/scripts/backfill-default-trustlines.ts`
- `backend/scripts/backfill-trustlines-all-existing-wallets.ts`

Problema:

Backfills de trustline percorrem varias wallets, recuperam segredo no Vault e
assinam transacoes. Em Mainnet isso pode gastar XLM real em massa.

Correcao:

- Criado `assertMainnetBulkMutationAllowed`.
- Se o runtime estiver em PUBLIC, esses scripts exigem
  `STELLAR_MAINNET_ALLOW_BULK_MUTATION=true`.

### 6. Auditor estatico Mainnet

Arquivo: `backend/scripts/stellar-mainnet-audit.ts`

O auditor verifica:

- Passphrases Stellar invalidas.
- Guard de ativacao PUBLIC.
- Scripts Testnet sem guard.
- Bulk mutations sem guard Mainnet.
- SQL legado perigoso para producao.
- Uso de `NEXT_PUBLIC_*` com nomes que parecem segredo.
- Issuer USDC Mainnet stale em docs.

Comando:

```bash
cd backend
npm run stellar:mainnet:audit
```

### 7. Doc de USDC corrigido

Arquivo: `docs/TECH_STACK_DETAILED.md`

Problema:

A doc tinha issuer USDC Mainnet/Testnet stale e diferente do backend.

Correcao:

- Mainnet/Public: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
- Testnet: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

## Achados restantes

### Resolvido: migrations legadas removidas

Os antigos arquivos de bootstrap, reparo e migrations incrementais foram
substituidos por `backend/migrations/20260613_00_full_schema.sql`. O bootstrap
consolidado termina removendo `exec_sql`, habilitando o hardening RLS e
restringindo os helpers de Vault ao `service_role`.

Risco restante:

- Um banco ja existente precisa receber e verificar a migration consolidada.
- `get_private_key` continua dependendo de Vault; Mainnet deve preferir signer
  externo/KMS.

### Alto: signing ainda aceita secret key crua em services

Arquivos principais:

- `backend/src/api/services/stellar.service.ts`
- `backend/src/api/services/trustline.service.ts`
- `backend/src/agent/tools.ts`

Risco:

Hoje varios fluxos recuperam secret key do Vault e assinam no processo do
backend. Isso funciona em Testnet, mas em Mainnet aumenta blast radius: se o
backend ou logs forem comprometidos, a chave operacional fica muito perto da
aplicacao.

Proxima correcao recomendada:

- Criar interface `StellarSigner`.
- Implementar `TestnetVaultSigner` para o fluxo atual.
- Implementar `MainnetExternalSigner` ou `MainnetKmsSigner`.
- Bloquear Mainnet se o signer for `vault` sem aprovacao explicita.

### Alto: metadados de rede ainda nao sao usados nas queries runtime

Schema atual:

- `backend/migrations/20260613_00_full_schema.sql`

Risco:

A migration preparatoria adiciona `stellar_network`, mas repositories/services
ainda nao filtram por rede. Quando Mainnet for plugada, wallets, contacts,
operations e payment logs precisam ser isolados por rede para evitar mistura de
historico Testnet/Mainnet.

Proxima correcao recomendada:

- Atualizar repositories para sempre filtrar `stellar_network`.
- Trocar unicidade global por unicidade composta onde fizer sentido:
  `(stellar_network, public_key)`, `(stellar_network, session_id)`.
- Atualizar todos os inserts para gravar a rede ativa.

### Alto: limites Mainnet existem em readiness, mas nao no settlement runtime

Arquivos:

- `backend/src/infrastructure/stellar/mainnet-infrastructure.ts`
- `backend/src/api/services/stellar.service.ts`
- `backend/src/agent/tools.ts`

Risco:

`STELLAR_MAINNET_MAX_PAYMENT_USDC` e approval manual ja existem na infra, mas
ainda nao estao aplicados no fluxo real de pagamento. Quando o runtime for
plugado, isso precisa bloquear transacoes acima do limite antes de construir XDR.

Proxima correcao recomendada:

- Criar `MainnetPaymentPolicy`.
- Aplicar antes de `buildPaymentXdr`, path payments, conversions e PIX/anchor
  settlement.
- Logar `policy_decision` em `operations`/`audit_events`.

### Medio: scripts ainda imprimem secrets em fluxos Testnet descartaveis

Arquivos:

- `backend/scripts/first-testnet-transaction.ts`
- `backend/scripts/setup-testnet-brl-liquidity.ts`
- `backend/scripts/setup-xlm-usdc-liquidity.ts`

Risco:

Os scripts agora sao Testnet-only, entao o risco Mainnet imediato foi reduzido.
Mesmo assim, imprimir secret key cria maus habitos e pode vazar em logs de CI.

Proxima correcao recomendada:

- Esconder secrets por default.
- Exigir `REVEAL_TESTNET_SECRET_KEYS=true` para imprimir chaves descartaveis.
- Nunca permitir esse flag em PUBLIC.

### Medio: provider Horizon de producao precisa de decisao explicita

Risco:

O default oficial `https://horizon.stellar.org` e correto como perfil, mas
produto em producao deve decidir se vai usar provider com SLA, fallback e rate
limit planejado.

Proxima correcao recomendada:

- Definir `STELLAR_MAINNET_HORIZON_URL` para provider escolhido.
- Adicionar healthcheck de Horizon.
- Adicionar fallback ou runbook de troca de provider.

## Ordem recomendada dos proximos PRs

1. Criar pacote de migrations Mainnet production-safe.
2. Introduzir `StellarSigner` e separar signer Testnet/Vault de Mainnet/KMS.
3. Aplicar `stellar_network` em repositories e queries.
4. Aplicar `MainnetPaymentPolicy` nos fluxos de pagamento.
5. Remover impressao default de secrets nos scripts restantes.
6. Definir provider Horizon Mainnet e healthcheck.

## Comandos uteis

```bash
cd backend
npm run stellar:mainnet:readiness
npm run stellar:mainnet:audit
npm run stellar:mainnet:audit:strict
```

Estado esperado agora:

- Runtime ainda em Testnet.
- `STELLAR_NETWORK=PUBLIC` bloqueado sem guard.
- Auditor sem `fail`.
- Restantes em `review` porque exigem decisao arquitetural antes de plugar
  Mainnet no produto.
