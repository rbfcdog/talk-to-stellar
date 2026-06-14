# Passkey e OpenZeppelin: guia de envs

Este guia explica o que preencher em cada variavel para a tela `/passkey-test` funcionar e para deixar claro o que ainda falta para execucao on-chain com OpenZeppelin Stellar Smart Account.

## Resumo rapido

Existem dois niveis diferentes:

1. **Passkey/WebAuthn no navegador:** cria e valida biometria/passkey. Isso depende principalmente de `PASSKEY_RP_ID`, `PASSKEY_ORIGIN` e `NEXT_PUBLIC_PASSKEY_ENABLED`.
2. **OpenZeppelin smart account on-chain:** usa a chave P-256/WebAuthn como signer externo de uma smart account Soroban. Isso exige verifier contract, smart account contract, context rule e fluxo de assinatura on-chain.

Hoje o repo faz o nivel 1 e salva metadata para o nivel 2. A propria service marca o deployment como `metadata_only`.

Referencia de codigo:

```text
backend/src/api/services/core/passkey.service.ts
backend/migrations/20260525_00_passkey_smart_accounts.sql
frontend/app/passkey-test/passkey-test-client.tsx
```

## Env para desenvolvimento local

Use isto quando o frontend abre em `http://localhost:3000`:

```env
PASSKEY_RP_ID=localhost
PASSKEY_ORIGIN=http://localhost:3000
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

No frontend:

```env
NEXT_PUBLIC_PASSKEY_ENABLED=true
```

## Env para producao

Troque pelo dominio real onde o usuario abre o frontend:

```env
PASSKEY_RP_ID=app.seu-dominio.com
PASSKEY_ORIGIN=https://app.seu-dominio.com
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

No frontend:

```env
NEXT_PUBLIC_PASSKEY_ENABLED=true
```

Importante: `PASSKEY_RP_ID` e `PASSKEY_ORIGIN` precisam bater com o dominio real aberto no navegador. Se o usuario abre `https://talk-to-stellar-owxg.vercel.app`, use:

```env
PASSKEY_RP_ID=talk-to-stellar-owxg.vercel.app
PASSKEY_ORIGIN=https://talk-to-stellar-owxg.vercel.app
```

Nao use a URL do backend, Railway ou Telegram nesses campos, a menos que a passkey esteja abrindo exatamente nesse dominio.

## O que cada variavel faz

| Variavel | Onde | O que colocar | Para que serve |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_PASSKEY_ENABLED` | Frontend | `true` | Mostra cadastro/login/confirmacao com passkey na UX. Se `false`, esconde a opcao, mas nao remove endpoints do backend. |
| `PASSKEY_RP_ID` | Backend | Dominio sem protocolo, ex. `app.exemplo.com` ou `localhost` | Relying Party ID do WebAuthn. O navegador so aceita criar/usar passkey se esse valor combinar com o dominio aberto. |
| `PASSKEY_ORIGIN` | Backend | Origem completa, ex. `https://app.exemplo.com` ou `http://localhost:3000` | Origin esperada na validacao WebAuthn. Precisa ter protocolo, dominio e porta quando houver. |
| `PASSKEY_RP_NAME` | Backend | `TalkToStellar` | Nome mostrado pelo sistema operacional/navegador no prompt de passkey. |
| `PASSKEY_CHALLENGE_TTL_SECONDS` | Backend | `900` | Tempo de validade do challenge salvo no banco. `900` = 15 min. |
| `PASSKEY_OPERATION_TIMEOUT_MS` | Backend | `180000` | Timeout enviado ao navegador para concluir registro/login. `180000` = 3 min. |
| `PASSKEY_USER_VERIFICATION` | Backend | `preferred` ou `required` | Controla se biometria/senha local do aparelho e exigida. No codigo atual, so `required` vira obrigatorio; qualquer outro valor cai em `preferred`. |
| `PASSKEY_SMART_ACCOUNT_ENABLED` | Backend | `false` ate contrato real estar pronto | Liga metadata de smart account como habilitada. Nao implanta contrato sozinho. |
| `PASSKEY_SMART_ACCOUNT_NETWORK` | Backend | `testnet` | Rede onde a metadata da smart account deve apontar. Use `testnet` ate auditoria/deploy real. |
| `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS` | Backend | Endereco Soroban `C...` do verifier WebAuthn/P-256 | Contrato que valida assinatura WebAuthn/P-256 para `Signer::External`. Precisa existir na mesma rede. |
| `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID` | Backend | ID numerico da context rule, ex. `1` | Rule ID que o cliente deve referenciar em `context_rule_ids` no `AuthPayload`. So preencha depois que a rule existir na smart account. |

## Por que a tela diz que OpenZeppelin nao esta pronto

A tela `/passkey-test` considera OpenZeppelin pronto quando:

```text
PASSKEY_SMART_ACCOUNT_ENABLED=true
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=<endereco C...>
```

Se um deles estiver ausente, aparece:

```text
OpenZeppelin ainda nao esta pronto para execucao
```

Isso e esperado quando voce esta apenas testando passkey. A tela ainda consegue:

1. Verificar se o navegador suporta WebAuthn.
2. Registrar passkey.
3. Validar login/autenticacao com passkey.
4. Salvar a chave publica P-256 extraida da credencial.
5. Mostrar metadata OpenZeppelin como `metadata_only`.

## O que falta para execucao on-chain real

Preencher env nao basta para executar on-chain. Para isso, precisa de workflow de contrato:

1. Implantar ou selecionar um verifier WebAuthn/P-256 em Soroban.
2. Implantar uma OpenZeppelin Stellar Smart Account ou usar uma ja criada.
3. Adicionar a passkey como signer externo:

```text
Signer::External(verifier_address, public_key_p256)
```

4. Criar uma context rule para o tipo de operacao permitido.
5. Salvar o `smart_account_address` do usuario.
6. Salvar o `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID` correto ou persistir rule por usuario.
7. Na hora de executar, construir o `AuthPayload` com:

```text
signers: Map<Signer, Bytes>
context_rule_ids: Vec<u32>
```

8. XDR-encodar os dados WebAuthn exigidos pelo verifier.
9. Simular, assinar e submeter a transacao Soroban usando a smart account.

No codigo atual, a migration tem coluna para `smart_account_address`, mas o registro de passkey salva `smart_account_address: null`. Isso confirma que ainda falta o workflow de deploy/vinculo da conta on-chain.

## Como obter o verifier address

`PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS` nao e issuer de asset, nao e public key `G...`, nao e URL. Deve ser um endereco de contrato Soroban, normalmente com prefixo `C...`, implantado na rede escolhida.

Voce tem tres caminhos:

1. Usar um verifier WebAuthn/P-256 ja implantado e auditado para a rede.
2. Implantar o verifier usando o pacote/accounts da OpenZeppelin Stellar Contracts.
3. Pedir ao time/provedor que opera a smart account o endereco oficial do verifier para testnet/mainnet.

Depois de obter o endereco:

```env
PASSKEY_SMART_ACCOUNT_ENABLED=true
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=C...
```

So coloque `PASSKEY_SMART_ACCOUNT_ENABLED=true` se o verifier existe e a integracao on-chain foi testada. Caso contrario, a UI pode parecer pronta mesmo sem execucao real.

## Context rule ID

OpenZeppelin Stellar Smart Account usa `context_rule_ids` no `AuthPayload`. A documentacao da OpenZeppelin explica que o cliente escolhe explicitamente uma rule por auth context.

Por isso, `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID` deve ser o ID real da rule criada na smart account.

Exemplo:

```env
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=1
```

Use vazio enquanto nao houver smart account/rule:

```env
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

Se o ID estiver errado, a assinatura pode ate ser valida, mas a smart account deve recusar a operacao porque a rule nao existe, expirou ou nao bate com o contexto.

## Migrations necessarias

Aplicar:

```text
backend/migrations/20260525_00_passkey_smart_accounts.sql
```

Essa migration adiciona em `user_passkeys`:

```text
credential_public_key_p256
smart_account_address
smart_account_signer
smart_account_verifier_address
smart_account_network
smart_account_type
smart_account_enabled
smart_account_context_rule_id
smart_account_metadata
```

Sem essa migration, o backend tenta fallback e salva passkey sem metadata de smart account.

## Como testar

1. Entre na conta pelo frontend.
2. Abra `/passkey-test`.
3. Confirme que a tela mostra sessao conectada.
4. Clique em registrar passkey.
5. Confirme biometria/senha do aparelho.
6. Clique em atualizar status OpenZeppelin.
7. Verifique:

```text
chave P-256: salva
modo: Somente metadata
```

Com smart account ainda desativada, esse e o estado correto.

Depois de configurar verifier:

```env
PASSKEY_SMART_ACCOUNT_ENABLED=true
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=C...
```

rode de novo:

```text
modo: Pronto para testar
verifier: C...
```

Mesmo assim, antes de dizer que "executa on-chain", valide tambem uma transacao Soroban real assinada por `AuthPayload` da smart account.

## Erros comuns

| Erro na tela | Causa provavel | Correcao |
| --- | --- | --- |
| `A passkey precisa abrir no dominio configurado...` | `PASSKEY_RP_ID` ou `PASSKEY_ORIGIN` nao batem com o dominio aberto | Ajustar para o dominio real do frontend |
| Browser cancela ou expira | Usuario nao confirmou biometria a tempo | Aumentar `PASSKEY_OPERATION_TIMEOUT_MS` ou tentar de novo |
| Status OpenZeppelin pede login | Sem cookie de sessao nesse navegador | Entrar na conta e voltar para `/passkey-test` |
| `OpenZeppelin ainda nao esta pronto para execucao` | Smart account desligada ou sem verifier | Preencher `PASSKEY_SMART_ACCOUNT_ENABLED=true` e verifier `C...` somente depois de deploy real |
| `chave P-256 ausente` | Passkey antiga salva antes da migration ou credencial nao P-256 | Registrar nova passkey depois da migration |
| Passkey funciona local mas falha em producao | Origin/RP ID de prod diferente | Usar HTTPS e dominio exato de producao |

## Checklist antes de ligar `PASSKEY_SMART_ACCOUNT_ENABLED=true`

1. `NEXT_PUBLIC_PASSKEY_ENABLED=true`.
2. Passkey registra e autentica em `/passkey-test`.
3. Migration `20260525_00_passkey_smart_accounts.sql` aplicada.
4. `credential_public_key_p256.public_key_uncompressed` aparece salvo.
5. Verifier WebAuthn/P-256 implantado na mesma rede.
6. Smart account do usuario existe.
7. Context rule existe e permite a operacao desejada.
8. `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID` aponta para essa rule.
9. Existe codigo de execucao que monta `AuthPayload`, XDR WebAuthn e submete Soroban.
10. Teste end-to-end em testnet passou.

## Fontes oficiais

- OpenZeppelin Stellar Smart Accounts: https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account
- OpenZeppelin Signers and Verifiers: https://docs.openzeppelin.com/stellar-contracts/accounts/signers-and-verifiers
- OpenZeppelin Authorization Flow: https://docs.openzeppelin.com/stellar-contracts/accounts/authorization-flow

Pontos importantes das fontes:

1. Smart accounts separam autenticacao, escopo de autorizacao e policies.
2. Signers externos usam verifier contracts para validar assinatura.
3. WebAuthn usa chave secp256r1/P-256 em formato nao comprimido de 65 bytes.
4. `context_rule_ids` e parte do `AuthPayload` e precisa alinhar com os auth contexts da operacao.
