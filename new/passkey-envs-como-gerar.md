# Passkey/OpenZeppelin: como gerar as envs

Guia curto para preencher as variaveis novas de passkey. Para testar passkey simples, voce nao precisa de contrato OpenZeppelin.

## 1. Localhost

Use quando abrir o frontend em `http://localhost:3000`:

```env
NEXT_PUBLIC_PASSKEY_ENABLED=true

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

## 2. Producao

Pegue o dominio exato onde o usuario abre o frontend no navegador.

Exemplo: se o app abre em:

```text
https://talk-to-stellar-owxg.vercel.app
```

use:

```env
NEXT_PUBLIC_PASSKEY_ENABLED=true

PASSKEY_RP_ID=talk-to-stellar-owxg.vercel.app
PASSKEY_ORIGIN=https://talk-to-stellar-owxg.vercel.app
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

Regra: `PASSKEY_RP_ID` e apenas o dominio, sem `https://`. `PASSKEY_ORIGIN` e a origin completa, com protocolo.

## 3. Como gerar cada valor

| Env | Como gerar/preencher |
| --- | --- |
| `NEXT_PUBLIC_PASSKEY_ENABLED` | Coloque `true` para mostrar a UX de passkey. |
| `PASSKEY_RP_ID` | Copie o dominio do frontend sem protocolo. Local: `localhost`. Producao: `app.seu-dominio.com`. |
| `PASSKEY_ORIGIN` | Copie a URL base do frontend com protocolo. Local: `http://localhost:3000`. Producao: `https://app.seu-dominio.com`. |
| `PASSKEY_RP_NAME` | Nome exibido no prompt do navegador. Use `TalkToStellar`. |
| `PASSKEY_CHALLENGE_TTL_SECONDS` | Use `900`. Aumente so se o usuario demora muito para concluir. |
| `PASSKEY_OPERATION_TIMEOUT_MS` | Use `180000`. Aumente so se biometria expirar com frequencia. |
| `PASSKEY_USER_VERIFICATION` | Use `preferred`. Use `required` se quiser exigir biometria/senha local sempre. |
| `PASSKEY_SMART_ACCOUNT_ENABLED` | Use `false` ate ter verifier, smart account e teste on-chain real. |
| `PASSKEY_SMART_ACCOUNT_NETWORK` | Use `testnet` ate producao/auditoria. |
| `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS` | So preencha com contrato Soroban `C...` do verifier WebAuthn/P-256 implantado na rede. |
| `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID` | So preencha com o ID real da rule criada na smart account, por exemplo `1`. |

## 4. Como obter o verifier `C...`

Voce tem tres opcoes:

1. Usar um verifier WebAuthn/P-256 ja implantado e auditado para a rede.
2. Implantar o verifier com OpenZeppelin Stellar Contracts.
3. Pedir ao provedor/time que opera a smart account o endereco oficial.

O valor correto parece com:

```env
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=C...
```

Nao use issuer `G...`, chave publica de usuario, URL, dominio ou token.

## 5. Quando ligar OpenZeppelin

So mude para:

```env
PASSKEY_SMART_ACCOUNT_ENABLED=true
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=C...
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=1
```

depois de validar:

1. migration `20260525_00_passkey_smart_accounts.sql` aplicada;
2. passkey registra e autentica em `/passkey-test`;
3. chave P-256 salva em `user_passkeys`;
4. verifier `C...` existe na mesma rede;
5. smart account do usuario existe;
6. context rule existe;
7. uma transacao Soroban real passou em testnet.

## 6. Teste rapido

1. Entre na conta.
2. Abra `/passkey-test`.
3. Clique em registrar passkey.
4. Confirme biometria/senha local.
5. Clique em atualizar status OpenZeppelin.

Resultado esperado sem smart account:

```text
modo: Somente metadata
chave P-256: salva
```

Resultado esperado com smart account configurada:

```text
modo: Pronto para testar
verifier: C...
```
