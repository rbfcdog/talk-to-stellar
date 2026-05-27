# Envs essenciais das novidades

Versao curta para deploy. Isto nao repete envs basicos que o projeto ja usava, como `SUPABASE_*`, `OPENAI_API_KEY`, `STELLAR_*`, `JWT_SECRET` e `PIN_PEPPER`.

## 0. O que ainda falta preencher para rendimento

Para a tela `/yield` deixar de mostrar "aguardando opção", confirme estes envs no backend do deploy:

```env
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=false
DEFINDEX_USDC_VAULT=CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN
DEFINDEX_CETES_VAULT=CBIS5TEMTNNOTBE3WXPQUAGUEDYZZVIWAKTXEQCOUJ34OJJ3FJ5NLF2P
DEFINDEX_XLM_VAULT=CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
```

O segredo que provavelmente ainda falta e `DEFINDEX_API_KEY`; ele vem da Defindex. Os vaults acima sao os contratos testnet encontrados/validados nesta sessao para USDC, CETES e XLM. Para executar deposito/saque em testnet, use `DEFINDEX_ENABLE_EXECUTION=true`. Mainnet continua bloqueada enquanto `DEFINDEX_ALLOW_MAINNET_EXECUTION=false`.

Nao preencha `DEFINDEX_EURC_VAULT` nem `DEFINDEX_TESOURO_VAULT` em testnet enquanto nao houver vault validado. Na UX, TESOURO aparece como real/reais; CETES aparece como rendimento Mexico. Nao recrie o asset `BRL`.

## 1. Obrigatorias agora

### Backend

```env
FRONTEND_URL=https://seu-frontend
PUBLIC_APP_URL=https://seu-frontend
PUBLIC_BACKEND_URL=https://seu-backend
CORS_ORIGINS=https://seu-frontend,http://localhost:3000,http://127.0.0.1:3000

AGENT_INGEST_SECRET=gere-com-openssl-rand-hex-32
INTERNAL_API_SECRET=mesmo-valor-do-agent-ingest-secret
TELEGRAM_NOTIFY_SECRET=mesmo-valor-do-agent-ingest-secret
TELEGRAM_NOTIFY_URL=https://seu-telegram-service/notify

ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
ENABLE_CETES_ASSET=true
ENABLE_EURC_ASSET=false
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM
```

EURC fica desligado em testnet porque nao ha issuer/vault EURC validado neste ambiente. Use CETES no lugar de EUR/EURC enquanto `STELLAR_NETWORK=TESTNET`.

Use `TESOURO` no env, nao `BRL`. TESOURO e o asset real do produto para reais; a interface pode exibir como real/reais quando for o melhor texto para usuario.

Gerar segredo:

```bash
openssl rand -hex 32
```

### Frontend

```env
NEXT_PUBLIC_BACKEND_URL=https://seu-backend
NEXT_PUBLIC_AGENT_API_URL=https://seu-backend/api/agent/query
NEXT_PUBLIC_FRONTEND_URL=https://seu-frontend
NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM
NEXT_PUBLIC_PASSKEY_ENABLED=true
```

### Telegram

```env
TELEGRAM_BOT_TOKEN=123456789:token-do-botfather
TELEGRAM_AGENT_URL=https://seu-backend/api/agent/query
TELEGRAM_WEBHOOK_URL=https://seu-telegram-service
AGENT_INGEST_SECRET=mesmo-valor-do-backend
TELEGRAM_NOTIFY_SECRET=mesmo-valor-do-backend
TELEGRAM_PROFILE_SETUP=true
```

O `AGENT_INGEST_SECRET` precisa ser identico no backend e no Telegram. Esse foi o erro que derrubou o bot.

Se o log mostrar `TelegramError: 401: Unauthorized` em `setWebhook`, `setMyProfilePhoto`, `setMyShortDescription`, `setMyDescription` ou `getMe`, o problema e o `TELEGRAM_BOT_TOKEN`: valor errado, token revogado/regenerado, username no lugar do token, prefixo `bot`, aspas ou espaco no valor. Teste no proprio ambiente do deploy:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

O resultado precisa ser `{"ok":true,...}`. Se vier `401 Unauthorized`, gere/copie novamente o token no `@BotFather` e atualize a env do Railway/servico Telegram. `TELEGRAM_PROFILE_SETUP=false` so desliga avatar/descricao; nao corrige token invalido.

## 2. Para rendimento real com Defindex

O backend agora usa o SDK oficial `@defindex/sdk`. Configure no backend quando for ligar rendimento de verdade:

```env
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
# Alias aceito pelo SDK/docs. Prefira DEFINDEX_BASE_URL no deploy.
# DEFINDEX_API_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=false
DEFINDEX_USDC_VAULT=CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN
DEFINDEX_CETES_VAULT=CBIS5TEMTNNOTBE3WXPQUAGUEDYZZVIWAKTXEQCOUJ34OJJ3FJ5NLF2P
DEFINDEX_XLM_VAULT=CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
```

Os valores `DEFINDEX_*_VAULT` sao enderecos de contrato Soroban do vault, no formato `C...`. Eles nao sao issuer do asset, nao sao a conta `G...` do usuario e nao sao o factory address.

Testnet validado agora: USDC, XLM e CETES. Nao configure yield de EURC ou TESOURO em testnet ate existir vault validado para esses assets.

Como obter os vaults:

1. Use o app/dashboard da Defindex para selecionar ou criar um vault e copie o endereco do vault (`C...`) para o asset/rede correta.
2. Ou crie via SDK/factory: `getFactoryAddress(SupportedNetworks.TESTNET)` mostra a factory; `createVault(...)` gera o XDR de criacao. Depois de assinar/submeter, use o endereco do vault criado em um env `DEFINDEX_<ASSET>_VAULT`.
3. Se for usar vault curado por parceiro/Defindex, peca o endereco oficial do vault para o asset e rede desejados. Valide antes de expor ao usuario.

Script para buscar/preencher o bloco de env automaticamente:

```bash
npm --prefix backend run defindex:env -- --network testnet --enable-execution
```

Para gerar um arquivo separado:

```bash
npm --prefix backend run defindex:env -- --network testnet --enable-execution --write .env.defindex.testnet
```

O script usa `@defindex/sdk` para health/factory, consulta o registry publico da Defindex e tenta descobrir vaults em `/vault/discover`. Ele so imprime `DEFINDEX_<ASSET>_VAULT` quando encontrou vault real. Se EURC ou TESOURO nao aparecerem, nao invente valor: significa que nenhum vault testnet validado foi encontrado automaticamente.

Validacao minima antes de ligar execucao:

```ts
import { DefindexSDK, SupportedNetworks } from '@defindex/sdk';

const sdk = new DefindexSDK({
  apiKey: process.env.DEFINDEX_API_KEY,
  baseUrl: process.env.DEFINDEX_BASE_URL || 'https://api.defindex.io',
  defaultNetwork: SupportedNetworks.TESTNET,
});

await sdk.healthCheck();
await sdk.getVaultInfo(process.env.DEFINDEX_USDC_VAULT!, SupportedNetworks.TESTNET);
await sdk.getVaultAPY(process.env.DEFINDEX_USDC_VAULT!, SupportedNetworks.TESTNET);
```

Para testnet com execucao real, use `DEFINDEX_ENABLE_EXECUTION=true` depois de validar API key, vaults, APY, balance, XDR de deposito, XDR de saque e assinatura pela wallet. O backend so executa se `DEFINDEX_NETWORK` e `STELLAR_NETWORK` apontarem para a mesma rede. Para mainnet, alem disso, exige `DEFINDEX_ALLOW_MAINNET_EXECUTION=true`.

Para EURC funcionar futuramente em producao/mainnet:

```env
STELLAR_NETWORK=PUBLIC
ENABLE_EURC_ASSET=true
EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,EURC,XLM
DEFINDEX_NETWORK=mainnet
DEFINDEX_EURC_VAULT=C... # vault EURC mainnet validado
```

Para testnet agora, mantenha EURC desligado e use CETES: `ENABLE_CETES_ASSET=true`, `ENABLE_EURC_ASSET=false`, `DEFINDEX_CETES_VAULT=...`. So preencha `EURC_ISSUER_TESTNET`/`DEFINDEX_EURC_VAULT` no futuro se voce tiver issuer e vault de teste realmente validados. Nao use o issuer publico da Circle para transacao em testnet.

## 3. Para passkey

Configure no backend:

```env
PASSKEY_RP_ID=seu-dominio-frontend.com
PASSKEY_ORIGIN=https://seu-dominio-frontend.com
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
```

Deixe `PASSKEY_SMART_ACCOUNT_ENABLED=false` ate existir verifier P-256/WebAuthn implantado e testado.

No frontend, deixe `NEXT_PUBLIC_PASSKEY_ENABLED=true` para mostrar cadastro, login e confirmação com Passkey. Se precisar desativar temporariamente a UX, use `NEXT_PUBLIC_PASSKEY_ENABLED=false`.

## 4. So preencher depois

```env
# So para liquidacao on-chain de TESOURO no sandbox/producao.
# A demo sandbox atual nao precisa disso para concluir PIX.
TESOURO_DISTRIBUTOR_PUBLIC=
TESOURO_DISTRIBUTOR_SECRET=

# So se houver issuer EURC confiavel para testnet.
EURC_ISSUER_TESTNET=

# Fora do escopo por enquanto. Nao exponha sem issuer/codigo correto,
# trustline, rota e liquidez validados.
GBP_ISSUER=
MXN_ISSUER=
ARS_ISSUER=
CAD_ISSUER=
AUD_ISSUER=
CHF_ISSUER=
JPY_ISSUER=

# So quando houver vaults extras alem dos envs diretos acima.
DEFINDEX_VAULTS_JSON=

# So quando smart account on-chain estiver implantada.
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

## 5. Migrations novas

Aplicar nesta ordem:

```text
backend/migrations/20260510_wallet_pix_and_assets.sql
backend/migrations/20260514_01_external_bank_accounts.sql
backend/migrations/20260525_00_passkey_smart_accounts.sql
backend/migrations/20260527_00_external_identity_indexes_sanitized.sql
```

A migration de `20260527` evita que indices antigos de identidade exponham constraint do banco e corrige aliases WhatsApp/phone que duplicavam telefone em `external_accounts`.

Se o banco for novo, aplique tambem as migrations base listadas em `new/session-env-and-migrations.md`.
