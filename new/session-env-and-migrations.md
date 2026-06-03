# Env e migrations desta sessão

Este documento lista as variáveis e migrações relacionadas às mudanças feitas nesta sessão: URL `/yield`, rendimento multi-asset, PIX com chave dinâmica, passkey/smart account e Telegram.

## Requisitos mínimos para rodar

Para a experiência nova funcionar de ponta a ponta, o ambiente precisa ter:

1. Frontend público em HTTPS, com `/chat`, `/yield`, `/money-cycle`, `/convert`, `/pix-on` e `/pix-off` acessíveis.
2. Backend público com `/api/agent/query`, `/api/ramp/*`, `/api/external/*`, `/api/passkey/*` e CORS liberado para o domínio do frontend.
3. Supabase configurado com service role e todas as migrations listadas neste documento.
4. `AGENT_INGEST_SECRET` igual no backend, Telegram e qualquer adapter de chat.
5. `FRONTEND_URL`/`PUBLIC_APP_URL` apontando para o domínio real do frontend, porque as tool calls devolvem links públicos.
6. Assets visíveis configurados em `TTS_VISIBLE_ASSET_CODES`; em testnet use `TESOURO,USDC,CETES,XLM`, sem asset BRL separado.
7. Issuers, liquidez/rotas e setup dos assets extras antes de marcar uma moeda como operacional.
8. PIX/Etherfuse com API key, organização/conta habilitada e webhook configurado.
9. Defindex com vaults e API key para rendimento; execução deve ficar desligada até validação completa.
10. Passkey/WebAuthn com `PASSKEY_RP_ID` e `PASSKEY_ORIGIN` exatamente iguais ao domínio HTTPS do frontend.
11. Telegram com token, webhook e profile setup, caso o canal Telegram esteja ativo.
12. OpenAI API key no backend para o agente usar tool calls.

## Como obter APIs, chaves e valores externos

Use esta seção como checklist de aquisição antes de preencher os envs. Nunca coloque chaves reais no repo, em logs ou em variáveis `NEXT_PUBLIC_*`.

### OpenAI

1. Entre em `https://platform.openai.com/api-keys`.
2. Selecione o projeto correto e crie uma secret key.
3. Copie a chave no momento da criação; a OpenAI não mostra o valor completo de novo depois.
4. Configure no backend como `OPENAI_API_KEY`.

Fonte oficial: `https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key`

### Supabase

1. Abra o projeto no dashboard do Supabase.
2. Pegue a URL do projeto no Connect dialog ou em Data API.
3. Em Settings -> API Keys, copie:
   - `anon` ou publishable key para uso público/controlado.
   - `service_role` ou secret key para o backend.
4. `SUPABASE_SERVICE_ROLE_KEY` fica só no backend, porque bypassa RLS.

Fontes oficiais: `https://supabase.com/docs/guides/getting-started/api-keys` e `https://supabase.com/docs/guides/api/creating-routes`

### Telegram

1. No Telegram, abra `@BotFather`.
2. Use `/newbot`, escolha nome e username terminado em `bot`.
3. O BotFather retorna o token; configure em `TELEGRAM_BOT_TOKEN`.
4. Configure `TELEGRAM_AGENT_URL` apontando para o backend e use o mesmo `AGENT_INGEST_SECRET` no backend e no adapter.
5. Em modo webhook, `TELEGRAM_WEBHOOK_URL` precisa ser a URL pública HTTPS do serviço Telegram.
6. Teste o token com:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

Fonte oficial: `https://core.telegram.org/bots/features#botfather`

### Etherfuse PIX/ramp

1. Para sandbox, crie conta em `https://devnet.etherfuse.com`.
2. No menu Ramp -> API Keys, crie uma sandbox API key.
3. Use `ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com`.
4. Para produção, use `https://app.etherfuse.com`, complete KYC real e solicite/ative keys de produção.
5. A autenticação da API Etherfuse usa o header `Authorization` com a key direta, sem prefixo `Bearer`.

Fonte oficial: `https://docs.etherfuse.com/initial-setup`

### Defindex rendimento

1. Tente o fluxo atual da documentação em `https://docs.defindex.io/api-integration-guide/quickstart`.
2. Se o botão/fluxo de gerar key não estiver disponível, solicite acesso ao time DeFindex/PaltaLabs pelo Discord indicado na documentação.
3. A key normalmente começa com `sk_`.
4. Configure `DEFINDEX_API_KEY` apenas no backend.
5. Configure `DEFINDEX_BASE_URL=https://api.defindex.io`.
6. Use `Authorization: Bearer <key>` para chamadas diretas.
7. Configure vaults reais por asset (`DEFINDEX_USDC_VAULT`, `DEFINDEX_CETES_VAULT`, `DEFINDEX_XLM_VAULT`, `DEFINDEX_EURC_VAULT`, `DEFINDEX_TESOURO_VAULT` ou `DEFINDEX_VAULTS_JSON`).
8. Cada vault deve ser um endereco de contrato Soroban `C...`; nao use issuer do asset, conta `G...` de usuario ou factory address.
9. Obtenha vaults pelo app/dashboard da Defindex, criando via `@defindex/sdk` factory operations, ou pedindo ao time Defindex/PaltaLabs o vault curado para o asset e rede.
10. Para gerar um bloco automaticamente com execucao testnet, rode `npm --prefix backend run defindex:env -- --network testnet --enable-execution`; para gravar arquivo separado, adicione `--write .env.defindex.testnet`.
11. O script usa `@defindex/sdk`, registry publico e `/vault/discover`. Ele so imprime `DEFINDEX_<ASSET>_VAULT` quando existe vault. Em testnet, use CETES no lugar de EURC; se EURC/TESOURO nao aparecerem, nao configure yield desses assets.
12. Valide com `healthCheck()`, `getVaultInfo()`, `getVaultAPY()` e `getVaultBalance()` antes de expor ao usuario.
13. Use `DEFINDEX_ENABLE_EXECUTION=true` para permitir execucao tecnica em testnet depois de testar assinatura e liquidez. O backend so envia transacoes se `DEFINDEX_COMPLIANCE_APPROVED=true` tambem estiver definido apos aprovacao juridica/compliance. Mainnet exige tambem `DEFINDEX_ALLOW_MAINNET_EXECUTION=true`.

Fontes oficiais: `https://docs.defindex.io/api-integration-guide/quickstart`, `https://docs.defindex.io/wallet-developer/api-reference/api` e `https://docs.defindex.io/api-integration-guide/creating-a-defindex-vault`

### Stellar keys e issuers

1. Para testnet, gere keypair no Stellar Lab ou via SDK/CLI.
2. Fund account com Friendbot apenas em testnet/futurenet.
3. Em produção, `STELLAR_SECRET_KEY`, distributor keys e issuer keys devem seguir política de custody/rotação, não serem keys pessoais.
4. Para assets extras, preencha `CODE_ISSUER` só quando issuer, trustline, path payment/liquidez e UX estiverem validados.

Fonte oficial: `https://developers.stellar.org/docs/tools/lab/account`

### Passkey / OpenZeppelin smart account

Passkey/WebAuthn não exige API key externa. Exige domínio público HTTPS correto:

1. `PASSKEY_RP_ID` deve ser só o domínio, por exemplo `app.exemplo.com`.
2. `PASSKEY_ORIGIN` deve ser a origem completa, por exemplo `https://app.exemplo.com`.
3. O navegador só valida passkey se a origem real bater com esses valores.
4. Para smart account on-chain, use o framework de smart account da OpenZeppelin Stellar Contracts e configure o endereço do verifier P-256/WebAuthn em `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS` quando houver contrato implantado e auditado.
5. Enquanto não houver verifier/rules on-chain implantados, deixe `PASSKEY_SMART_ACCOUNT_ENABLED=false`.

Fontes oficiais: `https://docs.openzeppelin.com/stellar-contracts/accounts/smart-account` e `https://docs.openzeppelin.com/stellar-contracts/accounts/signers-and-verifiers`

### Circle / Bridge payout opcional

Só precisa se `PAYOUT_PROVIDER` sair de `mock` e `ENABLE_REAL_PAYOUT_EXECUTION=true`.

- Circle: crie key no Circle developer dashboard, sandbox ou production conforme o ambiente.
- Bridge: use o dashboard/API docs da Bridge e envie a key no header esperado pelo provider.

Fontes oficiais: `https://developers.circle.com/circle-mint/api-keys` e `https://apidocs.bridge.xyz/api-reference`

### Segredos internos

Gere valores longos e diferentes por ambiente para `JWT_SECRET`, `PIN_PEPPER`, `AGENT_INGEST_SECRET`, `INTERNAL_API_SECRET`, `TELEGRAM_NOTIFY_SECRET` e webhooks:

```bash
openssl rand -hex 32
```

`AGENT_INGEST_SECRET` precisa ser exatamente igual no backend e nos adapters que chamam `/api/agent/query`.

## Backend env

```env
# Core backend
PORT=3001
NODE_ENV=production
JWT_SECRET=troque-por-um-segredo-longo
PIN_PEPPER=troque-por-um-segredo-longo
OPENAI_API_KEY=sk-...

# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# Frontend usado pelos links que a LLM devolve nas tool calls
FRONTEND_URL=https://seu-frontend
PUBLIC_APP_URL=https://seu-frontend
CREATE_ACCOUNT_BASE=https://seu-frontend
PAYMENT_CONFIRM_BASE=https://seu-frontend
PUBLIC_BACKEND_URL=https://seu-backend
CORS_ORIGINS=https://seu-frontend,http://localhost:3000,http://127.0.0.1:3000

# Ingestão de Telegram/WhatsApp para o agente
AGENT_INGEST_SECRET=mesmo-valor-no-backend-e-no-adapter
INTERNAL_API_SECRET=mesmo-valor-ou-fallback
TELEGRAM_NOTIFY_SECRET=mesmo-valor-ou-fallback
TELEGRAM_NOTIFY_URL=https://seu-telegram-service/notify
TELEGRAM_BOT_TOKEN=123456:replace-me

# Stellar/runtime do app
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=
STELLAR_PUBLIC_KEY=
USDC_ISSUER=
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=
STELLAR_ENFORCE_TRUSTED_PATH_ASSETS=false
ONBOARDING_AUTO_CONVERT_TO_USDC=false
ENABLE_USDC_DEFAULT_TRUSTLINE=false
QUOTE_TTL_SECONDS=30
TALKTOSTELLAR_SPREAD_BPS=30
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=
BRL_USDC_QUOTE_SOURCE=binance
BRL_USDC_QUOTE_SYMBOL=USDCBRL
BRL_USDC_QUOTE_TIMEOUT_MS=8000

# Assets visíveis. TESOURO e o asset real do produto para reais; nao use BRL aqui.
ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
TESOURO_DISTRIBUTOR_PUBLIC=
TESOURO_DISTRIBUTOR_SECRET=
ENABLE_CETES_ASSET=true
ENABLE_EURC_ASSET=false
EURC_ISSUER=
EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
EURC_ISSUER_TESTNET=
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM

# Assets extras opcionais, só quando houver issuer/liquidez/configuração real
GBP_ISSUER=
MXN_ISSUER=
ARS_ISSUER=
CAD_ISSUER=
AUD_ISSUER=
CHF_ISSUER=
JPY_ISSUER=

# PIX / ramp
ETHERFUSE_API_KEY=api_sand:...
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
ETHERFUSE_WEBHOOK_SECRET=

# Defindex / rendimento
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
# Alias aceito pelo backend/SDK. Prefira DEFINDEX_BASE_URL no deploy.
# DEFINDEX_API_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_COMPLIANCE_APPROVED=false
DEFINDEX_ALLOW_MAINNET_EXECUTION=false
DEFINDEX_USDC_VAULT=
DEFINDEX_CETES_VAULT=
DEFINDEX_XLM_VAULT=
CETES_ISSUER_TESTNET=
# So quando houver vault validado na rede ativa.
# DEFINDEX_EURC_VAULT=
# DEFINDEX_TESOURO_VAULT=
DEFINDEX_VAULTS_JSON=

# Passkey / smart account
PASSKEY_RP_ID=seu-dominio-frontend.com
PASSKEY_ORIGIN=https://seu-dominio-frontend.com
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=

# Payout internacional opcional
PAYOUT_PROVIDER=mock
CIRCLE_API_KEY=
CIRCLE_PAYOUT_CREATE_URL=
BRIDGE_API_KEY=
BRIDGE_PAYOUT_CREATE_URL=
ENABLE_REAL_PAYOUT_EXECUTION=false
```

Os `DEFINDEX_*_VAULT` sao enderecos de contrato Soroban do vault, no formato `C...`. `getFactoryAddress()` retorna a factory usada para criar vaults; o valor que vai no env e o endereco do vault criado/selecionado, nao a factory.

Em testnet, o registry/API validou USDC, XLM e CETES. Nao configure yield de EURC/TESOURO em testnet ate existir vault validado para esses assets.

`DEFINDEX_VAULTS_JSON` aceita assets extras além de USDC/CETES/TESOURO, mas por enquanto mantenha vazio ate validar codigo real, issuer, path/liquidez e vault do asset novo.

Use `DEFINDEX_ENABLE_EXECUTION=true` para execucao tecnica em testnet depois de validar API key, vaults, issuers, liquidez e assinatura. O backend ainda bloqueia envio ate `DEFINDEX_COMPLIANCE_APPROVED=true`; mantenha `false` ate haver aprovacao juridica/compliance, termos, disclosures e controles por jurisdicao. Mainnet exige tambem `DEFINDEX_ALLOW_MAINNET_EXECUTION=true`.

## Frontend env

```env
AGENT_API_URL=https://seu-backend/api/agent/query
NEXT_PUBLIC_BACKEND_URL=https://seu-backend
NEXT_PUBLIC_AGENT_API_URL=https://seu-backend/api/agent/query
NEXT_PUBLIC_FRONTEND_URL=https://seu-frontend
NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM
NEXT_PUBLIC_PASSKEY_ENABLED=true
```

O domínio público do frontend precisa bater com `PASSKEY_RP_ID` e `PASSKEY_ORIGIN`.

## Telegram env

```env
TELEGRAM_BOT_TOKEN=123456:replace-me
TELEGRAM_AGENT_URL=https://seu-backend/api/agent/query
TELEGRAM_BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://seu-telegram-service
TELEGRAM_BOT_USERNAME=talktostellar_bot
TELEGRAM_HEALTH_PORT=3005
TELEGRAM_SESSION_PREFIX=telegram
TELEGRAM_WEBHOOK_PATH=/webhook/telegram
TELEGRAM_PROFILE_SETUP=true
TELEGRAM_PROFILE_PHOTO_PATH=
TELEGRAM_SHORT_DESCRIPTION=TalkToStellar account assistant for balance, PIX, conversion, yield, and withdrawals.
TELEGRAM_DESCRIPTION=TalkToStellar helps you check your balance, add or withdraw with PIX, convert currencies, keep money earning, manage contacts, and send payments from Telegram.
AGENT_INGEST_SECRET=mesmo-valor-do-backend
TELEGRAM_NOTIFY_SECRET=mesmo-valor-ou-fallback
```

O erro `AGENT_INGEST_SECRET is required` significa que o adapter Telegram subiu sem esse segredo ou com valor diferente do backend.

## O que cada env significa

### Core backend

| Variável | Onde | Significado |
| --- | --- | --- |
| `PORT` | Backend | Porta HTTP do backend. |
| `NODE_ENV` | Backend | Ambiente de execução; use `production` em deploy real. |
| `JWT_SECRET` | Backend | Segredo para assinar/verificar JWT de sessão. Gere valor longo. |
| `PIN_PEPPER` | Backend | Pepper server-side usado no hash de PIN. Não pode ir para frontend. |
| `OPENAI_API_KEY` | Backend | Chave da OpenAI usada pelo agente para interpretar mensagens e emitir tool calls. |

### Supabase

| Variável | Onde | Significado |
| --- | --- | --- |
| `SUPABASE_URL` | Backend | URL do projeto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend | Key server-side com privilégios elevados. Nunca expor no browser. |
| `SUPABASE_ANON_KEY` | Backend/cliente controlado | Key pública/legacy anon. Use com RLS e sem privilégios administrativos. |

### URLs públicas e CORS

| Variável | Onde | Significado |
| --- | --- | --- |
| `FRONTEND_URL` | Backend | Base principal para links que o backend/agente devolvem ao usuário. |
| `PUBLIC_APP_URL` | Backend | Fallback público para links do app. Mantenha igual ao frontend real. |
| `CREATE_ACCOUNT_BASE` | Backend | Base dos links de criação/onboarding de conta. |
| `PAYMENT_CONFIRM_BASE` | Backend | Base dos links de confirmação/checkout. |
| `PUBLIC_BACKEND_URL` | Backend | URL pública do backend para webhooks, callbacks e links internos. |
| `CORS_ORIGINS` | Backend | Lista de origins autorizadas a chamar o backend pelo browser. |

### Ingestão do agente, Telegram e notificações

| Variável | Onde | Significado |
| --- | --- | --- |
| `AGENT_INGEST_SECRET` | Backend + adapters | Segredo preferencial enviado no header `x-agent-ingest-secret` por Telegram/WhatsApp. Deve bater entre serviços. |
| `INTERNAL_API_SECRET` | Backend/adapters | Fallback compatível para integrações internas antigas. |
| `TELEGRAM_NOTIFY_SECRET` | Backend + Telegram | Segredo para `POST /notify` no adapter Telegram e fallback de ingestão. |
| `TELEGRAM_NOTIFY_URL` | Backend | Endpoint público do serviço Telegram para notificações pós-confirmação. |
| `TELEGRAM_BOT_TOKEN` | Backend opcional + Telegram | Token do bot criado no BotFather. No backend é fallback direto; no adapter é obrigatório. |
| `TELEGRAM_AGENT_URL` | Telegram | Endpoint `/api/agent/query` do backend. |
| `TELEGRAM_BOT_MODE` | Telegram | `webhook` em produção; polling apenas para desenvolvimento. |
| `TELEGRAM_WEBHOOK_URL` | Telegram | Base pública HTTPS onde o Telegram entregará updates. |
| `TELEGRAM_BOT_USERNAME` | Telegram | Username público do bot, usado em links e textos. |
| `TELEGRAM_HEALTH_PORT` | Telegram | Porta local do health server do adapter. |
| `TELEGRAM_SESSION_PREFIX` | Telegram | Prefixo para IDs de sessão vindos do Telegram. |
| `TELEGRAM_WEBHOOK_PATH` | Telegram | Path que recebe updates do Telegram, normalmente `/webhook/telegram`. |
| `TELEGRAM_PROFILE_SETUP` | Telegram | Quando `true`, o adapter tenta atualizar perfil/descrição do bot no boot. |
| `TELEGRAM_PROFILE_PHOTO_PATH` | Telegram | Caminho opcional da foto de perfil do bot. |
| `TELEGRAM_SHORT_DESCRIPTION` | Telegram | Descrição curta do bot exibida pelo Telegram. |
| `TELEGRAM_DESCRIPTION` | Telegram | Descrição longa do bot exibida pelo Telegram. |

### Stellar, conversão e taxas

| Variável | Onde | Significado |
| --- | --- | --- |
| `STELLAR_NETWORK` | Backend | Rede Stellar: `TESTNET` ou `PUBLIC`. |
| `STELLAR_HORIZON_URL` | Backend | Horizon usado pelo backend para leitura/submissão clássica. |
| `STELLAR_SECRET_KEY` | Backend | Secret key operacional usada para assinar operações server-side configuradas. Proteger como custody. |
| `STELLAR_PUBLIC_KEY` | Backend | Public key correspondente à conta operacional. |
| `USDC_ISSUER` | Backend | Issuer padrão de USDC quando `USDC_ASSET_ISSUER` não estiver definido. |
| `USDC_ASSET_CODE` | Backend | Código do asset USDC, normalmente `USDC`. |
| `USDC_ASSET_ISSUER` | Backend | Issuer explícito de USDC para trustlines/path payments. |
| `STELLAR_ENFORCE_TRUSTED_PATH_ASSETS` | Backend | Quando `true`, restringe path assets a issuers confiáveis configurados. |
| `ONBOARDING_AUTO_CONVERT_TO_USDC` | Backend | Opt-in para converter automaticamente saldo inicial/onboarding para USDC. Deixe `false` quando PIX deve entrar como TESOURO/BRL. |
| `ENABLE_USDC_DEFAULT_TRUSTLINE` | Backend | Opt-in para criar trustline USDC por padrão. Deixe `false` para não recriar issuer USDC antigo/deprecated automaticamente. |
| `QUOTE_TTL_SECONDS` | Backend | Tempo de validade de cotações antes de exigir nova cotação. |
| `TALKTOSTELLAR_SPREAD_BPS` | Backend | Spread da plataforma em basis points. `30` = 0,30%. |
| `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY` | Backend | Conta treasury que recebe fee/spread quando configurada. |
| `BRL_USDC_QUOTE_SOURCE` | Backend | Fonte de preço BRL/USDC; nesta sessão usada como `binance`. |
| `BRL_USDC_QUOTE_SYMBOL` | Backend | Símbolo do par usado na fonte de preço, ex. `USDCBRL`. |
| `BRL_USDC_QUOTE_TIMEOUT_MS` | Backend | Timeout para buscar cotação BRL/USDC. |

### Assets e TESOURO = Real

| Variável | Onde | Significado |
| --- | --- | --- |
| `ENABLE_TESOURO_ASSET` | Backend | Liga TESOURO como asset real do produto para reais. |
| `TESOURO_ISSUER` | Backend | Issuer do asset TESOURO. O usuário vê Real/BRL; não criar asset BRL separado. |
| `TESOURO_DISTRIBUTOR_PUBLIC` | Backend | Conta distributor pública para TESOURO, quando emissão/distribuição real estiver habilitada. |
| `TESOURO_DISTRIBUTOR_SECRET` | Backend | Secret da distributor TESOURO. Só backend/custody. |
| `ENABLE_CETES_ASSET` | Backend | Liga CETES em testnet como substituto operacional de EUR/EURC. |
| `ENABLE_EURC_ASSET` | Backend | Liga suporte a euro/EURC apenas quando houver issuer/liquidez/vault validado, normalmente public/mainnet. Em testnet atual fica `false`. |
| `EURC_ISSUER` | Backend | Issuer EURC genérico/fallback. |
| `EURC_ISSUER_PUBLIC` | Backend | Issuer EURC em public/mainnet. |
| `EURC_ISSUER_TESTNET` | Backend | Issuer EURC em testnet. Deixe vazio ate existir issuer/vault validado. |
| `CETES_ISSUER_TESTNET` | Backend | Issuer CETES usado no ambiente testnet atual. |
| `TTS_VISIBLE_ASSET_CODES` | Backend | Lista canônica de assets expostos pela UX e agente. Em testnet use `TESOURO,USDC,CETES,XLM`. |
| `NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES` | Frontend | Mesma lista para renderização no frontend: `TESOURO,USDC,CETES,XLM`. Não torna asset operacional sozinho. |
| `GBP_ISSUER`, `MXN_ISSUER`, `ARS_ISSUER`, `CAD_ISSUER`, `AUD_ISSUER`, `CHF_ISSUER`, `JPY_ISSUER` | Backend | Issuers opcionais para moedas extras. Preencher só com liquidez/path/vault validados. |

### PIX / Etherfuse

| Variável | Onde | Significado |
| --- | --- | --- |
| `ETHERFUSE_API_KEY` | Backend | API key do Etherfuse para PIX/ramp. Server-side only. |
| `ETHERFUSE_BASE_URL` | Backend | Base da API Etherfuse: sandbox `https://api.sand.etherfuse.com`, produção `https://api.etherfuse.com`. |
| `ETHERFUSE_BLOCKCHAIN` | Backend | Blockchain usada na integração, aqui `stellar`. |
| `ETHERFUSE_WEBHOOK_SECRET` | Backend | Segredo para validar webhooks Etherfuse quando configurado. |

### Defindex / rendimento

| Variável | Onde | Significado |
| --- | --- | --- |
| `DEFINDEX_API_KEY` | Backend | API key DeFindex, usada com `Authorization: Bearer`. |
| `DEFINDEX_BASE_URL` | Backend | Base da API DeFindex, normalmente `https://api.defindex.io`. |
| `DEFINDEX_API_URL` | Backend | Alias aceito por compatibilidade com docs/SDK; prefira `DEFINDEX_BASE_URL`. |
| `DEFINDEX_NETWORK` | Backend | `testnet` ou `mainnet`; deve bater com Stellar runtime e vaults. |
| `DEFINDEX_TIMEOUT_MS` | Backend | Timeout de chamadas DeFindex. |
| `DEFINDEX_ENABLE_EXECUTION` | Backend | Guarda tecnica. Quando `true`, permite preparar execucao; o envio real ainda exige `DEFINDEX_COMPLIANCE_APPROVED=true`. Quando `false`, fica em modo preview/revisao. |
| `DEFINDEX_COMPLIANCE_APPROVED` | Backend | Guarda de produto/compliance. Deve ficar `false` ate haver aprovacao juridica/compliance formal para executar rendimento nas jurisdicoes atendidas. |
| `DEFINDEX_ALLOW_MAINNET_EXECUTION` | Backend | Guarda adicional para mainnet. Mantenha `false` em testnet; mainnet so executa quando esta flag tambem for `true`. |
| `DEFINDEX_USDC_VAULT` | Backend | Endereco `C...` do vault para rendimento em USDC. |
| `DEFINDEX_CETES_VAULT` | Backend | Endereco `C...` do vault para rendimento em CETES testnet. |
| `DEFINDEX_EURC_VAULT` | Backend | Endereco `C...` do vault para rendimento em EURC/euro. Nao usar em testnet atual; CETES substitui EURC. |
| `DEFINDEX_TESOURO_VAULT` | Backend | Endereco `C...` do vault para rendimento em TESOURO/Real. |
| `DEFINDEX_XLM_VAULT` | Backend | Endereco `C...` do vault para rendimento em XLM. |
| `DEFINDEX_VAULTS_JSON` | Backend | Lista/objeto JSON para vaults extras, labels, network e enable por asset. |

### Passkey / smart account

| Variável | Onde | Significado |
| --- | --- | --- |
| `PASSKEY_RP_ID` | Backend | Relying Party ID do WebAuthn. Deve ser o domínio, sem protocolo. |
| `PASSKEY_ORIGIN` | Backend | Origin completa esperada pelo WebAuthn, com `https://`. |
| `PASSKEY_RP_NAME` | Backend | Nome mostrado no prompt de passkey. |
| `PASSKEY_OPERATION_TIMEOUT_MS` | Backend | Janela para a operação passkey/QR ser concluída. |
| `PASSKEY_CHALLENGE_TTL_SECONDS` | Backend | TTL do challenge WebAuthn salvo no backend. Default do código: 900 segundos. |
| `PASSKEY_USER_VERIFICATION` | Backend | Política WebAuthn: `preferred`, `required` ou `discouraged`. |
| `PASSKEY_SMART_ACCOUNT_ENABLED` | Backend | Liga metadata/uso de smart account passkey. Deixe `false` até contrato/verifier reais. |
| `PASSKEY_SMART_ACCOUNT_NETWORK` | Backend | Rede do smart account, normalmente `testnet` até auditoria. |
| `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS` | Backend | Endereço do verifier WebAuthn/P-256 em Soroban. |
| `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID` | Backend | Rule ID padrão usado pelo cliente para autorizações smart account. |

### Frontend

| Variável | Onde | Significado |
| --- | --- | --- |
| `AGENT_API_URL` | Frontend server-side | Endpoint interno usado por server actions/API routes do frontend para chamar o agente. |
| `NEXT_PUBLIC_BACKEND_URL` | Frontend público | Base pública do backend para chamadas do browser. |
| `NEXT_PUBLIC_AGENT_API_URL` | Frontend público | Endpoint público do agente quando chamadas partem do browser/chat. |
| `NEXT_PUBLIC_FRONTEND_URL` | Frontend público | URL pública do próprio frontend, usada em links e redirects. |
| `NEXT_PUBLIC_PASSKEY_ENABLED` | Frontend público | Liga a UX de cadastro, login e confirmação com Passkey. Use `true`; `false` esconde a opção sem remover PIN. |

### Payout internacional opcional

| Variável | Onde | Significado |
| --- | --- | --- |
| `PAYOUT_PROVIDER` | Backend | Provider de payout: `mock` enquanto não houver integração real. |
| `CIRCLE_API_KEY` | Backend | API key Circle se o payout real usar Circle. |
| `CIRCLE_PAYOUT_CREATE_URL` | Backend | Endpoint custom/configurado para criar payout via Circle. |
| `BRIDGE_API_KEY` | Backend | API key Bridge se o payout real usar Bridge. |
| `BRIDGE_PAYOUT_CREATE_URL` | Backend | Endpoint custom/configurado para criar payout via Bridge. |
| `ENABLE_REAL_PAYOUT_EXECUTION` | Backend | Guarda de segurança; só `true` depois de provider, compliance e testes reais. |

## Migrations para aplicar

Aplicar pelo runner do projeto ou diretamente no Supabase, na ordem:

```text
backend/migrations/20260510_wallet_pix_and_assets.sql
backend/migrations/20260514_01_external_bank_accounts.sql
backend/migrations/20260525_00_passkey_smart_accounts.sql
backend/migrations/20260527_00_external_identity_indexes_sanitized.sql
```

Também confirme que as migrations base do assistente financeiro já existem no ambiente:

```text
backend/migrations/20260512_00_payment_infra_prereqs.sql
backend/migrations/20260512_01_smart_contacts_and_treasury.sql
backend/migrations/20260512_02_activity_feed_insights_economy.sql
backend/migrations/20260512_03_financial_assistant_modules.sql
backend/migrations/20260513_00_payment_confirmation_single_use.sql
backend/migrations/20260513_02_receipt_images.sql
backend/migrations/20260513_03_payment_link_expiry_and_transaction_nickname.sql
backend/migrations/20260523_01_agent_messages_intro_dedupe.sql
```

## Checklist de deploy

1. `/yield` é a URL pública de rendimento; `/money-cycle` é a URL pública do ciclo consolidado PIX entrada -> rendimento -> PIX saída; `/convert` é a URL pública de conversão multi-asset. `/rendimentos` e `/rendimento` só redirecionam.
2. A LLM usa tool calls para abrir interfaces:
   - `open_asset_interface` para trazer/manter/mandar para PIX.
   - `open_money_cycle` para o ciclo completo de injetar dinheiro, render e sair.
   - `get_yield_options`, `get_yield_balance`, `prepare_yield_action`, `confirm_yield_action` para rendimento.
3. PIX off-ramp aceita `destination_pix_key`/`pix_key` na URL e também permite a pessoa digitar a chave na tela.
4. `TTS_VISIBLE_ASSET_CODES` controla os assets mostrados em saldo e UX multi-asset.
5. Assets extras precisam de `CODE_ISSUER`, liquidez/path e vault em `DEFINDEX_VAULTS_JSON` antes de aparecerem como operacionais.
6. Antes do deploy, rodar:
   - `npm --prefix backend run eval:agent`
   - `npm --prefix backend run build`
   - `npm --prefix frontend test`
   - `npm --prefix frontend run build`
7. Smoke test manual depois do deploy:
   - Chat: “o que você pode fazer?”
   - Chat: “converter 500 reais para CETES”
   - Chat: “deixar 200 dólares rendendo”
   - Chat: “injetar 500 reais, deixar render e sair para user@example.com”
   - Abrir `/yield?lang=pt-BR&asset=CETES&amount=200`
   - Abrir `/money-cycle?cycle=1&asset=BRL&amount=500&destination_pix_key=user%40example.com`
   - Abrir `/pix-off?asset=USDC&amount=80&destination_pix_key=user%40example.com`
