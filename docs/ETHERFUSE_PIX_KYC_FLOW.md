# Etherfuse PIX, KYC e entrega de TESOURO

Este documento descreve como o fluxo de PIX ramp da TalkToStellar funciona hoje, quais endpoints internos e externos sao usados, como o KYC entra no processo e como o saldo chega na wallet Stellar.

## Resumo do fluxo

A integracao atual usa a Etherfuse como anchor para simular/operar um fluxo de ramp entre BRL e TESOURO na Stellar Testnet.

Fluxo on-ramp, ou seja, colocar saldo via PIX:

1. O usuario informa o email da conta TalkToStellar.
2. A aplicacao encontra a sessao/wallet TalkToStellar associada ao email.
3. O backend cria ou recupera um customer na Etherfuse.
4. O backend prepara wallet, KYC e conta PIX/fiat para esse customer.
5. O backend cria uma quote BRL -> TESOURO.
6. O backend cria uma ordem de on-ramp.
7. A UI mostra o checkout PIX/testnet.
8. No sandbox, o usuario clica em `Confirmar PIX (testnet)`.
9. O backend simula fiat recebido e entrega TESOURO na wallet Stellar Testnet.
10. A UI mostra saldo antes/depois e o chat recebe uma mensagem de confirmacao.

Fluxo off-ramp, ou seja, tirar saldo:

1. O usuario pede para sacar ou retirar TESOURO via PIX.
2. A aplicacao abre a tela `/pix-off`.
3. A tela mostra TESOURO saindo da wallet e BRL entrando em uma conta PIX testnet/bancaria simulada.
4. No sandbox, o fluxo e local/simulado quando a Etherfuse nao disponibiliza a conta fiat real pronta.

## Onde testar no frontend

On-ramp usado pelo chat:

```text
/pix-on?amount=150&asset=TESOURO&autostart=1
```

Off-ramp usado pelo chat:

```text
/pix-off?amount=5&asset=TESOURO
```

Off-ramp com alvo em reais, para a tela calcular quanto TESOURO precisa sair:

```text
/pix-off?fiat_amount=100&fiat_currency=BRL&asset=TESOURO
```

Rota legada/manual:

```text
/pix-ramp
```

Via chat, exemplos de frases:

```text
depositar 150 reais via pix
quero pagar com pix para colocar 100 reais na conta
quero trazer 100 brl pra minha conta via pix
quero sacar 5 tesouro por pix
quero sacar 100 reais para minha conta bancaria via pix
quero tirar dinheiro para minha conta bancaria via pix
```

## Endpoints internos da TalkToStellar

A UI chama o proxy do frontend:

```text
/api/ramp/...
```

Esse proxy encaminha para o backend:

```text
/api/ramp/...
```

Endpoints principais:

| Endpoint | Metodo | Funcao |
| --- | --- | --- |
| `/api/ramp/etherfuse/config` | `GET` | Mostra configuracao de runtime da integracao Etherfuse. |
| `/api/ramp/etherfuse/resolve-wallet` | `POST` | Resolve wallet TalkToStellar por email, apenas em sandbox/devnet. |
| `/api/ramp/etherfuse/customer` | `POST` | Cria/recupera customer Etherfuse e roda onboarding programatico sandbox. |
| `/api/ramp/etherfuse/kyc-status` | `GET` | Consulta status de KYC do customer na Etherfuse. |
| `/api/ramp/etherfuse/assets` | `GET` | Lista assets disponiveis para ramp, incluindo TESOURO quando disponivel. |
| `/api/ramp/etherfuse/wallet-balances` | `GET` | Consulta saldos da wallet Stellar para mostrar antes/depois. |
| `/api/ramp/etherfuse/fiat-accounts` | `GET` | Lista contas fiat/PIX associadas ao customer. |
| `/api/ramp/etherfuse/quote` | `POST` | Cria quote para BRL -> TESOURO ou TESOURO -> BRL. |
| `/api/ramp/etherfuse/trustline` | `POST` | Garante trustline de TESOURO antes de entregar o asset. |
| `/api/ramp/etherfuse/onramp` | `POST` | Cria ordem de on-ramp PIX/BRL -> TESOURO. |
| `/api/ramp/etherfuse/onramp/:orderId` | `GET` | Faz polling do status da ordem on-ramp. |
| `/api/ramp/etherfuse/sandbox/simulate-fiat` | `POST` | Sandbox: simula recebimento do PIX e entrega TESOURO. |
| `/api/ramp/etherfuse/offramp` | `POST` | Cria ordem de off-ramp TESOURO -> BRL/PIX. |
| `/api/ramp/etherfuse/offramp/:orderId` | `GET` | Faz polling do status do off-ramp. |
| `/api/ramp/etherfuse/offramp/:orderId/submit` | `POST` | Assina/submete a transacao Stellar de saida quando a anchor prepara o XDR. |
| `/api/ramp/etherfuse/sandbox/test-onramp` | `POST` | Endpoint temporario para testar o fluxo on-ramp inteiro. |
| `/api/ramp/etherfuse/sandbox/test-offramp` | `POST` | Endpoint temporario para testar o fluxo off-ramp inteiro. |

## Endpoints externos da Etherfuse

Base sandbox usada pela integracao:

```text
https://api.sand.etherfuse.com
```

Autenticacao correta:

```text
Authorization: api_sand:<api_key>:<organization_id>
```

Nao usar prefixo `Bearer`.

Endpoints Etherfuse usados pelo cliente:

| Endpoint Etherfuse | Metodo | Uso |
| --- | --- | --- |
| `/ramp/onboarding-url` | `POST` | Cria onboarding/KYC URL para customer, bank account e public key. |
| `/ramp/customer/{customerId}/wallet` | `POST` | Registra a wallet Stellar do customer. |
| `/ramp/wallet` | `POST` | Registra a wallet no escopo da organizacao Etherfuse. |
| `/ramp/customer/{customerId}/kyc` | `POST` | Envia dados de identidade KYC programaticamente. |
| `/ramp/customer/{customerId}/kyc/documents` | `POST` | Envia documentos/selfie KYC programaticamente. |
| `/ramp/agreements/electronic-signature` | `POST` | Aceita consentimento de assinatura eletronica. |
| `/ramp/agreements/terms-and-conditions` | `POST` | Aceita termos e condicoes. |
| `/ramp/agreements/customer-agreement` | `POST` | Aceita contrato do cliente. |
| `/ramp/customer/{customerId}/bank-account` | `POST` | Cria conta bancaria/PIX do customer. |
| `/ramp/bank-account` | `POST` | Fallback com presigned URL para criar conta bancaria/PIX. |
| `/ramp/customer/{customerId}/kyc/{publicKey}` | `GET` | Consulta status KYC. |
| `/ramp/assets` | `GET` | Lista assets rampaveis. |
| `/ramp/quote` | `POST` | Cria quote. Quotes expiram rapido, por isso o backend renova antes da ordem. |
| `/ramp/order` | `POST` | Cria ordem on-ramp/off-ramp. |
| `/ramp/order/{orderId}` | `GET` | Consulta ordem. |
| `/ramp/order/fiat_received` | `POST` | Sandbox: simula fiat recebido pela anchor. |

## A gente ja usa KYC?

Sim, mas com uma distincao importante.

Hoje a TalkToStellar ja usa KYC programatico no fluxo sandbox/devnet da Etherfuse. O backend tenta fazer automaticamente estes passos quando cria o customer ou a ordem:

1. Registra wallet do customer.
2. Registra wallet no escopo da organizacao.
3. Envia payload fake de identidade KYC para `/ramp/customer/{customerId}/kyc`.
4. Envia documentos/selfie fake para `/ramp/customer/{customerId}/kyc/documents`.
5. Aceita os acordos via endpoints de agreements quando ha `kycUrl`.
6. Cria conta PIX/fiat programaticamente.

Isso significa que, no ambiente atual, a pessoa nao esta fazendo KYC manual em uma tela da Etherfuse. A aplicacao tenta fazer onboarding/KYC programatico com dados mockados para destravar o fluxo de sandbox.

O que ainda nao temos como KYC real de producao:

- Coleta real de documento, selfie, CPF/endereco com UX propria.
- Consentimento juridico explicito do usuario antes de aceitar agreements em nome dele.
- Revisao/aprovacao real de KYC de producao.
- Garantia de PIX real pagavel no app bancario.

Para producao, nao devemos aceitar agreements silenciosamente no backend. A UI precisa mostrar os termos e exigir acao explicita do usuario.

## Como o PIX chega na wallet

No fluxo real de on-ramp, a Etherfuse deveria retornar instrucoes PIX na ordem, como:

- `depositPixCode`
- `depositPixKey`
- `depositPixKeyType`
- valor em BRL
- beneficiario
- status da ordem

A UI usa essas instrucoes para mostrar QR Code e codigo copia-e-cola.

Quando o usuario paga o PIX real, a anchor detecta o fiat recebido. Depois disso, a Etherfuse liquida o asset na Stellar para a wallet do usuario.

No sandbox/devnet atual, a diferenca e esta:

- O QR/codigo exibido e demonstrativo/testnet quando a Etherfuse nao retorna um `depositPixCode` real.
- Esse codigo nao existe no DICT do Banco Central.
- Apps reais como Nubank podem mostrar `chave nao encontrada`.
- Para simular pagamento, o usuario clica em `Confirmar PIX (testnet)`.
- O backend chama o simulador e entrega TESOURO na Stellar Testnet.

## Entrega de TESOURO

Antes de entregar TESOURO, o backend garante a trustline da wallet:

```text
POST /api/ramp/etherfuse/trustline
```

Depois, no sandbox, ao confirmar PIX testnet:

```text
POST /api/ramp/etherfuse/sandbox/simulate-fiat
```

O backend tenta liquidar TESOURO para a public key da wallet TalkToStellar. A UI consulta os saldos antes e depois com:

```text
GET /api/ramp/etherfuse/wallet-balances
```

A tela mostra delta de saldo para deixar explicito que:

- BRL/testnet entrou como origem do pagamento.
- TESOURO foi recebido na wallet.
- No off-ramp, TESOURO sai da wallet e BRL entra em uma conta PIX/bancaria simulada.
- Quando o off-ramp vem com `fiat_amount`, a tela trata BRL como valor alvo e o backend calcula a quantidade de TESOURO necessaria antes de criar a ordem sandbox.

## Por que o PIX sandbox nao funciona no Nubank

O PIX sandbox/mock nao e uma chave PIX registrada no Banco Central. Ele serve para testar UX e integracao de on-ramp em testnet.

Portanto, se o usuario copiar esse codigo no Nubank, o banco pode responder:

```text
chave PIX nao encontrada
```

Isso e esperado para sandbox. PIX bancario real so deve ser apresentado quando a Etherfuse retornar um `depositPixCode` ou `depositPixKey` real e valido.

## Estado atual da implementacao

Estado atual:

- A UI real usada pelo chat fica em `/pix-on` para on-ramp e `/pix-off` para off-ramp.
- A UI legada `/pix-ramp` continua existindo como tela manual com alternancia de modo.
- O chat detecta intencoes de PIX para deposito e saque.
- A wallet e resolvida por email usando a infraestrutura TalkToStellar, sem Freighter.
- O backend cria customer, quote e ordem.
- Quotes sao renovadas no servidor antes de criar ordem para evitar `Quote not found or expired`.
- KYC programatico sandbox e executado automaticamente com dados mockados.
- O fluxo sandbox entrega TESOURO na Stellar Testnet.
- A tela mostra saldo antes/depois.
- O chat recebe notificacao apos conclusao do on-ramp sandbox.

Limite atual:

- PIX real pagavel em bancos depende de a Etherfuse retornar instrucoes PIX reais e de a organizacao/conta bancaria estar ativa na anchor.
- Enquanto isso nao estiver ativo na Etherfuse, usamos fallback sandbox local para testar experiencia e entrega on-chain.
