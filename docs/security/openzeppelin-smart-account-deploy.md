# OpenZeppelin smart account: deploy e registro

Este guia mostra o caminho mais curto para ligar a passkey ja cadastrada a uma smart account OpenZeppelin Stellar.

## O que o script faz

O comando novo:

```bash
npm run passkey:smart-account -- --help
```

consegue:

- usar um verifier `C...` ja implantado;
- usar uma smart account `C...` ja implantada;
- implantar WASMs locais com Stellar CLI quando voce passar `--verifier-wasm` e `--account-wasm`;
- salvar `smart_account_address`, `smart_account_verifier_address` e `smart_account_context_rule_id` em `user_passkeys`;
- gerar um arquivo `.env.passkey`;
- salvar um template de `AuthPayload` em `smart_account_metadata`.

## Antes de rodar

1. Aplique a migration:

```text
backend/migrations/20260525_00_passkey_smart_accounts.sql
```

2. Entre no app e cadastre uma passkey em `/passkey-test`.

3. Garanta estas envs no backend:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
PASSKEY_RP_ID=localhost
PASSKEY_ORIGIN=http://localhost:3000
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
```

## Caso 1: contratos ja implantados

Use quando voce ja tem o verifier e a smart account:

```bash
npm run passkey:smart-account -- \
  --user-id USER_ID_DA_CONTA \
  --smart-account CSMARTACCOUNT... \
  --verifier CVERIFIER... \
  --context-rule-id 1 \
  --write-env .env.passkey
```

Isso atualiza o banco e gera:

```env
PASSKEY_SMART_ACCOUNT_ENABLED=true
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=CVERIFIER...
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=1
PASSKEY_SMART_ACCOUNT_ADDRESS=CSMARTACCOUNT...
```

Depois copie esses valores para o ambiente do backend e reinicie o servico.

## Caso 2: voce tem os WASMs locais

Instale e configure a Stellar CLI com uma conta source de testnet. Depois rode:

```bash
npm run passkey:smart-account -- \
  --user-id USER_ID_DA_CONTA \
  --source MINHA_CONTA_STELLAR_CLI \
  --verifier-wasm ./contracts/webauthn_p256_verifier.wasm \
  --account-wasm ./contracts/openzeppelin_smart_account.wasm \
  --context-rule-id 1 \
  --write-env .env.passkey
```

O script tenta implantar os dois contratos, captura os ids `C...`, atualiza o Supabase e escreve o bloco de env.

Se o projeto dos contratos estiver local e precisar compilar antes:

```bash
npm run passkey:smart-account -- \
  --user-id USER_ID_DA_CONTA \
  --source MINHA_CONTA_STELLAR_CLI \
  --build-command "stellar contract build" \
  --verifier-wasm ./target/wasm32-unknown-unknown/release/webauthn_p256_verifier.wasm \
  --account-wasm ./target/wasm32-unknown-unknown/release/openzeppelin_smart_account.wasm \
  --context-rule-id 1 \
  --write-env .env.passkey
```

## Se quiser testar sem gravar

```bash
npm run passkey:smart-account -- \
  --user-id USER_ID_DA_CONTA \
  --smart-account CSMARTACCOUNT... \
  --verifier CVERIFIER... \
  --context-rule-id 1 \
  --dry-run
```

## O que ainda depende do ABI do contrato

O script nao inventa nomes de metodos do contrato. Para a execucao on-chain completa, o contrato implantado precisa ter um fluxo claro para:

1. inicializar a smart account;
2. adicionar `Signer::External(verifier_address, public_key_p256)`;
3. criar a context rule;
4. aceitar o `AuthPayload` com `context_rule_ids`;
5. simular, assinar e submeter a transacao Soroban.

Quando esses nomes de metodos e parametros estiverem definidos pelo WASM usado, o proximo passo e adicionar um segundo script de `invoke` especifico para esse ABI.

## Como descobrir o `USER_ID_DA_CONTA`

No Supabase, busque a conta usada no app. A tabela que precisa ter passkey cadastrada e:

```text
user_passkeys
```

Use o valor da coluna:

```text
user_id
```

Se houver mais de uma passkey para o mesmo usuario, passe tambem:

```bash
--credential-id CREDENTIAL_ID
```

## Resultado esperado

Depois de rodar, `/passkey-test` deve mostrar:

```text
modo: Pronto para testar
verifier: C...
smart account: C...
```

Se aparecer `Somente metadata`, faltou preencher verifier, smart account ou context rule id.
