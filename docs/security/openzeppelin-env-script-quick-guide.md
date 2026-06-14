# Script rapido: envs Passkey/OpenZeppelin

Use este script para gerar as envs de passkey a partir da URL exata do frontend:

```bash
npm run passkey:env -- --origin http://localhost:3000
```

Producao:

```bash
npm run passkey:env -- --origin https://seu-frontend.com
```

Salvar em arquivo:

```bash
npm run passkey:env -- --origin https://seu-frontend.com --write .env.passkey
```

Gerar somente as tres envs de smart account:

```bash
npm run passkey:env -- --smart-account-only --network testnet
```

Saida:

```env
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

Se voce ja tiver verifier e rule:

```bash
npm run passkey:env -- \
  --smart-account-only \
  --network testnet \
  --verifier C... \
  --context-rule-id 1 \
  --write .env.openzeppelin
```

Com OpenZeppelin smart account ja implantada:

```bash
npm run passkey:env -- \
  --origin https://seu-frontend.com \
  --verifier C... \
  --context-rule-id 1 \
  --write .env.passkey
```

O script gera:

```env
NEXT_PUBLIC_PASSKEY_ENABLED=true
PASSKEY_RP_ID=...
PASSKEY_ORIGIN=...
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

Ele so coloca `PASSKEY_SMART_ACCOUNT_ENABLED=true` quando voce passa `--verifier C...` e `--context-rule-id`. Esses dois valores nao sao gerados automaticamente: precisam vir do contrato/verifier OpenZeppelin ja implantado e da rule criada na smart account.

Regra importante:

- `PASSKEY_RP_ID` e apenas o dominio, sem `https://`.
- `PASSKEY_ORIGIN` e a URL base completa, com protocolo.
- Producao precisa usar `https://`.
- `http://` so funciona para `localhost`.
