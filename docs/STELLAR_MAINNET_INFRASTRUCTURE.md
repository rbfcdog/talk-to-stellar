# Stellar Mainnet Infrastructure

Este documento descreve a infraestrutura criada para preparar a TalkToStellar
para Stellar Mainnet sem plugar o produto ativo na Mainnet. O runtime atual deve
continuar em Testnet ate um cutover aprovado.

Referencias oficiais:

- Stellar Networks: https://developers.stellar.org/docs/networks
- Network passphrases: https://developers.stellar.org/docs/networks#network-passphrases

## Estado neste commit

O que foi criado:

- Perfis isolados de rede em `backend/src/infrastructure/stellar/network-profiles.ts`.
- Config/readiness Mainnet em `backend/src/infrastructure/stellar/mainnet-infrastructure.ts`.
- Script de validacao em `backend/scripts/stellar-mainnet-readiness.ts`.
- Exemplo de env em `backend/.env.mainnet.example`.
- Migration preparatoria em `backend/migrations/20260518_00_prepare_stellar_mainnet_infrastructure.sql`.
- Testes em `backend/tests/stellar-mainnet-infrastructure.test.ts`.

O que nao foi feito de proposito:

- Nenhum endpoint, agente, fluxo de pagamento, onboarding ou service runtime passou a usar Mainnet.
- `backend/src/config/stellar.ts` continua sendo a configuracao ativa do produto.
- `STELLAR_NETWORK` deve continuar como `TESTNET`.
- A migration nova nao foi adicionada ao `migrate:required`.

## Separacao Testnet/Mainnet

A Stellar usa passphrases diferentes por rede. A passphrase entra no hash da
transacao que e assinado. Se uma transacao for assinada para uma rede e enviada
para outra, ela nao deve ser aceita.

Valores oficiais usados pelo SDK:

| Rede | Passphrase | Horizon |
| --- | --- | --- |
| Testnet | `Test SDF Network ; September 2015` | `https://horizon-testnet.stellar.org` |
| Mainnet/Public | `Public Global Stellar Network ; September 2015` | `https://horizon.stellar.org` |

Mainnet usa valor real. Nao existe Friendbot em Mainnet. O produto precisa de
XLM real para reserva minima, fees, trustlines e operacoes.

## Variaveis de ambiente

As variaveis ativas continuam sendo as atuais:

```bash
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
```

As variaveis novas sao isoladas e usam prefixo `STELLAR_MAINNET_*`:

| Variavel | Uso |
| --- | --- |
| `STELLAR_MAINNET_ENABLED` | Marca que a infra Mainnet foi preenchida. Nao pluga runtime sozinha. |
| `STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION` | Guard explicito para cutover futuro. Deve ficar `false` agora. |
| `STELLAR_MAINNET_HORIZON_URL` | Horizon Mainnet ou provider Mainnet. |
| `STELLAR_MAINNET_NETWORK_PASSPHRASE` | Passphrase Mainnet oficial. |
| `STELLAR_MAINNET_USDC_ISSUER` | Issuer USDC Mainnet. |
| `STELLAR_MAINNET_BRL_ISSUER` | Issuer BRL Mainnet escolhido. |
| `STELLAR_MAINNET_TESOURO_ISSUER` | Issuer TESOURO usado por fluxo Etherfuse. |
| `STELLAR_MAINNET_FEE_TREASURY_PUBLIC_KEY` | Conta publica que recebera fees/spread. |
| `STELLAR_MAINNET_DISTRIBUTION_PUBLIC_KEY` | Conta publica de distribuicao, se houver asset proprio. |
| `STELLAR_MAINNET_SIGNER_MODE` | `disabled`, `external`, `kms` ou `vault`. |
| `STELLAR_MAINNET_EXTERNAL_SIGNER_URL` | URL HTTPS do signer externo. |
| `STELLAR_MAINNET_KMS_KEY_ID` | Chave KMS para assinatura Mainnet. |
| `STELLAR_MAINNET_VAULT_SECRET_ID` | Referencia Vault se o signer for Vault. |
| `STELLAR_MAINNET_REQUIRE_MANUAL_APPROVAL` | Deve ficar `true` no inicio. |
| `STELLAR_MAINNET_MAX_PAYMENT_USDC` | Limite por pagamento no cutover. |
| `STELLAR_MAINNET_SEP10_HOME_DOMAIN` | Dominio SEP-10 para autenticacao anchor/SEP. |
| `STELLAR_MAINNET_STELLAR_TOML_URL` | URL publica do `stellar.toml`. |

Nao crie `STELLAR_MAINNET_FRIENDBOT_URL`. O readiness falha se essa variavel
aparecer, porque Friendbot e somente Testnet/Futurenet.

## Readiness

Rode:

```bash
cd backend
npm run stellar:mainnet:readiness
```

Para JSON:

```bash
cd backend
npm run stellar:mainnet:readiness -- --json
```

Para CI/cutover:

```bash
cd backend
npm run stellar:mainnet:readiness:strict
```

O modo `strict` so deve passar quando:

- `STELLAR_MAINNET_ENABLED=true`.
- O guard `STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=true` foi aberto de forma explicita.
- Horizon nao aponta para Testnet.
- A passphrase e Mainnet.
- Nao existe Friendbot Mainnet.
- Issuers sao public keys validas.
- Tesouraria de fee esta configurada.
- Signer Mainnet esta configurado.
- Limite operacional por pagamento esta configurado.
- Aprovacao manual continua obrigatoria.

Enquanto o produto estiver em Testnet, o esperado e o readiness mostrar que o
runtime atual esta seguro para Testnet, mas que a ativacao Mainnet ainda esta
bloqueada por design.

## Migration preparatoria

Arquivo:

```text
backend/migrations/20260518_00_prepare_stellar_mainnet_infrastructure.sql
```

Ela adiciona:

- Tipo `public.stellar_network` com `TESTNET` e `PUBLIC`.
- Tabela `public.stellar_network_configs`.
- Coluna `stellar_network` em tabelas financeiras principais, com default `TESTNET`.
- Indices por rede para queries futuras.

Ela nao muda o runtime. Ela tambem nao remove dados existentes. Como o default e
`TESTNET`, dados atuais continuam marcados como Testnet quando a migration for
aplicada.

Aplicar manualmente quando quiser preparar o banco:

```bash
psql "$DATABASE_URL" -f backend/migrations/20260518_00_prepare_stellar_mainnet_infrastructure.sql
```

Ou cole o SQL no editor do Supabase. Nao adicionei ao `migrate:required` para
evitar mudanca automatica de schema antes da decisao de cutover.

## Plano de ativacao futura

1. Manter `STELLAR_NETWORK=TESTNET` ate o ultimo passo.
2. Aplicar a migration preparatoria.
3. Criar ou escolher contas Mainnet:
   - conta de fee treasury;
   - conta de distribuicao, se houver asset proprio;
   - conta(s) operacionais do signer.
4. Fundar as contas com XLM real suficiente para reserva minima, trustlines e fees.
5. Escolher signer Mainnet:
   - preferido: signer externo HTTPS ou KMS;
   - aceitavel: Vault com referencia server-side;
   - evitar: secret key crua em env.
6. Configurar limites iniciais baixos com `STELLAR_MAINNET_MAX_PAYMENT_USDC`.
7. Manter `STELLAR_MAINNET_REQUIRE_MANUAL_APPROVAL=true`.
8. Preencher `STELLAR_MAINNET_SEP10_HOME_DOMAIN` e `STELLAR_MAINNET_STELLAR_TOML_URL` antes de fluxos SEP/anchor publicos.
9. Rodar `npm run stellar:mainnet:readiness`.
10. Fazer um PR separado para plugar os services de pagamento no perfil Mainnet.
11. Somente no cutover aprovado, abrir `STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=true`.
12. Somente no cutover aprovado, trocar o runtime ativo para Mainnet.

## Railway

No backend Railway atual, mantenha:

```bash
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
```

Pode adicionar as variaveis `STELLAR_MAINNET_*` no mesmo service para readiness,
mas deixe:

```bash
STELLAR_MAINNET_ENABLED=false
STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=false
STELLAR_MAINNET_SIGNER_MODE=disabled
```

Quando todas as chaves publicas, signer e limites estiverem definidos, mude
`STELLAR_MAINNET_ENABLED=true` apenas para indicar que a configuracao esta
preenchida. Isso ainda nao ativa pagamentos Mainnet.

## Rollback

Enquanto a Mainnet nao estiver plugada, rollback e simples:

```bash
STELLAR_MAINNET_ENABLED=false
STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=false
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

A migration preparatoria pode ficar aplicada; ela so adiciona metadados e
indices. O produto ativo segue ignorando esses campos ate o PR de wiring.
