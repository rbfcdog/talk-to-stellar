# Env e migrations da sessao 2026-05-25

Este documento consolida as variaveis e migrations adicionadas ou exigidas pelas mudancas desta sessao: Telegram ingest secret, TESOURO como representacao interna de real, EURC, PIX off-ramp com chave dinamica, Defindex yield e passkey preparada para OpenZeppelin Stellar Smart Account.

## Ordem recomendada

1. Fazer pull da `main` atual.
2. Aplicar as migrations listadas abaixo no Supabase/Postgres.
3. Configurar os envs do backend.
4. Configurar os envs do Telegram com o mesmo `AGENT_INGEST_SECRET` do backend.
5. Deployar backend, frontend e Telegram.
6. Testar: login/passkey, Telegram `/api/agent/query`, PIX on-ramp/off-ramp, assets TESOURO/USDC/EURC e Defindex em modo preview.
7. So ligar execucao real de Defindex e smart account quando os contratos/vaults/verifiers estiverem validados.

## Migrations

Aplicar em ambientes existentes:

```bash
psql "$DATABASE_URL" -f backend/migrations/20260525_00_passkey_smart_accounts.sql
```

Essa migration adiciona em `user_passkeys` os campos:

- `credential_public_key_p256`
- `smart_account_address`
- `smart_account_signer`
- `smart_account_verifier_address`
- `smart_account_network`
- `smart_account_type`
- `smart_account_enabled`
- `smart_account_context_rule_id`
- `smart_account_metadata`

Tambem adiciona indices para consulta por smart account, rede e status.

Para banco novo, `backend/migrations/20260513_99_full_setup_from_zero.sql` e `backend/migrations/supabase_full_setup.sql` ja foram atualizados com essas colunas. Depois do bootstrap, aplique tambem as migrations cronologicamente posteriores que o ambiente ainda nao tiver.

Nao ha migration nova para:

- Telegram ingest secret: apenas env.
- TESOURO/EURC assets: configuracao por env e codigo.
- PIX off-ramp com chave PIX dinamica: usa o fluxo/tabelas existentes.
- Defindex yield: usa operacoes/contexto existentes e configuracao por env.

Migrations existentes que precisam estar aplicadas para fluxos relacionados:

- `backend/migrations/20260514_01_external_bank_accounts.sql`: contas externas/PIX.
- `backend/migrations/20260520_00_international_usd_transfers.sql`: rail BRL -> USDC -> USD.
- `backend/migrations/20260523_01_payment_logs_operation_fingerprint_unique.sql`: idempotencia de logs de operacao.

## Backend envs

### Telegram e canais externos

```bash
AGENT_INGEST_SECRET=use-um-segredo-longo-e-igual-no-telegram
TELEGRAM_NOTIFY_URL=https://seu-telegram-service/notify
TELEGRAM_NOTIFY_SECRET=use-um-segredo-longo
TELEGRAM_BOT_TOKEN=
```

`AGENT_INGEST_SECRET` e obrigatorio para o bot Telegram iniciar e deve bater com o valor aceito pelo backend no header `x-agent-ingest-secret`.

### Stellar, USDC, TESOURO e EURC

```bash
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
USDC_ASSET_CODE=USDC

ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
TESOURO_DISTRIBUTOR_PUBLIC=
TESOURO_DISTRIBUTOR_SECRET=

ENABLE_EURC_ASSET=true
EURC_ISSUER=
EURC_ISSUER_PUBLIC=
EURC_ISSUER_TESTNET=
```

Nao configurar nem depender de asset `BRL_*` novo. No produto, real/BRL deve aparecer para o usuario; internamente a rail PIX/Etherfuse usa TESOURO como asset de liquidacao sandbox e converte/exibe como real quando aplicavel.

Remover dos ambientes antigos, se existirem:

```bash
BRL_ISSUER=
BRL_ISSUER_PUBLIC=
BRL_ISSUER_TESTNET=
BRL_ISSUER_SECRET=
BRL_DISTRIBUTOR_PUBLIC=
BRL_DISTRIBUTOR_SECRET=
BRL_MARKET_MAKER_PUBLIC=
BRL_MARKET_MAKER_SECRET=
```

### Quotes BRL/USDC

```bash
BRL_USDC_REFERENCE_SAMPLE_USDC=100
USD_BRL_SANITY_MIN=3
USD_BRL_SANITY_MAX=10
```

### Etherfuse PIX/TESOURO

```bash
ETHERFUSE_API_KEY=api_sand:...
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
ETHERFUSE_WEBHOOK_SECRET=
```

Para testes mockados controlados:

```bash
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=false
ETHERFUSE_SANDBOX_PIX_FALLBACK=false
```

So ligar esses flags em demo/teste onde fallback local seja aceitavel.

### Defindex yield

```bash
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=false
DEFINDEX_USDC_VAULT=
DEFINDEX_EURC_VAULT=
DEFINDEX_XLM_VAULT=
DEFINDEX_VAULTS_JSON=
```

Manter `DEFINDEX_ENABLE_EXECUTION=false` ate confirmar API key, vault addresses, asset issuers e assinatura/submissao de XDR em testnet. `DEFINDEX_VAULTS_JSON` aceita uma lista para assets extras, por exemplo:

```json
[{"asset_code":"USDC","vault_address":"C...","label":"USDC Blend Autocompound","network":"testnet"}]
```

### Passkey e OpenZeppelin Stellar Smart Account

```bash
PASSKEY_RP_ID=seu-dominio-frontend.com
PASSKEY_ORIGIN=https://seu-dominio-frontend.com
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_USER_VERIFICATION=preferred

PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

A implementacao atual salva, no registro da passkey, a chave publica WebAuthn P-256 em formato util para `Signer::External(Address, Bytes)` da OpenZeppelin. O status fica em `metadata_only` porque este repo ainda nao tem workspace Soroban/Rust para deployar o contrato smart account/verifier.

Para ativacao real depois:

1. Deployar o verifier P-256/WebAuthn em Soroban.
2. Configurar `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS`.
3. Criar/deployar a smart account OpenZeppelin para o usuario.
4. Gravar o endereco em `user_passkeys.smart_account_address`.
5. Configurar/criar context rules e preencher `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID` ou salvar o rule id por usuario.
6. So entao ligar `PASSKEY_SMART_ACCOUNT_ENABLED=true`.

Referencias usadas:

- https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account
- https://docs.openzeppelin.com/stellar-contracts/accounts/signers-and-verifiers

## Telegram envs

No servico Telegram:

```bash
TELEGRAM_BOT_TOKEN=123456:replace-me
TELEGRAM_AGENT_URL=https://seu-backend/api/agent/query
TELEGRAM_BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://seu-telegram-service
TELEGRAM_NOTIFY_SECRET=mesmo-ou-compatibilizado-com-backend
AGENT_INGEST_SECRET=mesmo-valor-do-backend
```

O erro `AGENT_INGEST_SECRET is required (must match the backend value)` significa que o servico Telegram subiu sem esse env resolvido. Corrigir no provider de deploy e redeployar.

## Frontend envs relevantes

O frontend nao precisa de secret novo para Defindex/smart account. Ele precisa apontar para o backend correto:

```bash
BACKEND_URL=https://seu-backend
NEXT_PUBLIC_BACKEND_URL=https://seu-backend
NEXT_PUBLIC_FRONTEND_URL=https://seu-frontend
```

Para passkeys, o dominio publico do frontend deve bater com `PASSKEY_RP_ID` e `PASSKEY_ORIGIN` no backend. Em producao, usar HTTPS.

## Checklist de validacao

1. `npm ci` deve rodar na raiz e nos workspaces/servicos corretos usando lockfiles sincronizados.
2. Backend sobe sem erro de env obrigatorio.
3. Telegram sobe sem erro de `AGENT_INGEST_SECRET`.
4. Registrar passkey retorna `smartAccount.deploymentStatus=metadata_only`.
5. `POST /api/passkeys/smart-account-status` retorna `migrated=true` depois da migration.
6. Tela PIX off-ramp aceita chave PIX digitada pelo usuario.
7. Assets disponiveis nao exibem asset BRL emitido proprio; real aparece como UX/fiat e TESOURO fica interno.
8. EUR/EURC aparece apenas quando issuer/config estiver pronto.
9. Defindex mostra preview de yield/vaults; execucao fica bloqueada enquanto `DEFINDEX_ENABLE_EXECUTION=false`.
