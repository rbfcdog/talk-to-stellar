# Envs essenciais das novidades

Versao curta para deploy. Isto nao repete envs basicos que o projeto ja usava, como `SUPABASE_*`, `OPENAI_API_KEY`, `STELLAR_*`, `JWT_SECRET` e `PIN_PEPPER`.

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
ENABLE_EURC_ASSET=true
EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,EURC,XLM
```

`EURC_ISSUER_PUBLIC` acima e o issuer publico da Circle para EURC na Stellar. Use com `STELLAR_NETWORK=PUBLIC`. Em testnet, nao existe issuer oficial equivalente validado aqui; nao use esse issuer publico para submeter transacoes na testnet.

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
NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,EURC,XLM
```

### Telegram

```env
TELEGRAM_AGENT_URL=https://seu-backend/api/agent/query
TELEGRAM_WEBHOOK_URL=https://seu-telegram-service
AGENT_INGEST_SECRET=mesmo-valor-do-backend
TELEGRAM_NOTIFY_SECRET=mesmo-valor-do-backend
TELEGRAM_PROFILE_SETUP=true
```

O `AGENT_INGEST_SECRET` precisa ser identico no backend e no Telegram. Esse foi o erro que derrubou o bot.

## 2. Para rendimento real com Defindex

O backend agora usa o SDK oficial `@defindex/sdk`. Configure no backend quando for ligar rendimento de verdade:

```env
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
# Alias aceito pelo SDK/docs. Prefira DEFINDEX_BASE_URL no deploy.
# DEFINDEX_API_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=false
DEFINDEX_USDC_VAULT=
DEFINDEX_EURC_VAULT=
DEFINDEX_TESOURO_VAULT=
DEFINDEX_XLM_VAULT=
```

Os valores `DEFINDEX_*_VAULT` sao enderecos de contrato Soroban do vault, no formato `C...`. Eles nao sao issuer do asset, nao sao a conta `G...` do usuario e nao sao o factory address.

Como obter os vaults:

1. Use o app/dashboard da Defindex para selecionar ou criar um vault e copie o endereco do vault (`C...`) para o asset/rede correta.
2. Ou crie via SDK/factory: `getFactoryAddress(SupportedNetworks.TESTNET)` mostra a factory; `createVault(...)` gera o XDR de criacao. Depois de assinar/submeter, use o endereco do vault criado em `DEFINDEX_USDC_VAULT`, `DEFINDEX_EURC_VAULT`, `DEFINDEX_TESOURO_VAULT` ou `DEFINDEX_XLM_VAULT`.
3. Se for usar vault curado por parceiro/Defindex, peca o endereco oficial do vault para o asset e rede desejados. Valide antes de expor ao usuario.

Script para buscar/preencher o bloco de env automaticamente:

```bash
npm --prefix backend run defindex:env -- --network testnet
```

Para gerar um arquivo separado:

```bash
npm --prefix backend run defindex:env -- --network testnet --write .env.defindex.testnet
```

O script usa `@defindex/sdk` para health/factory, consulta o registry publico da Defindex e tenta descobrir vaults em `/vault/discover`. Se `DEFINDEX_EURC_VAULT` ou `EURC_ISSUER_TESTNET` sair vazio, nao invente valor: significa que nenhum vault/issuer EURC testnet validado foi encontrado automaticamente. Nesse caso, crie um vault EURC testnet na Defindex ou peca ao time Defindex/PaltaLabs o vault e issuer de teste.

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

Mantenha `DEFINDEX_ENABLE_EXECUTION=false` ate validar API key, vaults, APY, balance, XDR de deposito, XDR de saque, assinatura pela wallet e saque real em testnet. So depois disso mude para `true`.

Para EURC funcionar em producao:

```env
STELLAR_NETWORK=PUBLIC
ENABLE_EURC_ASSET=true
EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,EURC,XLM
DEFINDEX_NETWORK=mainnet
DEFINDEX_EURC_VAULT=C... # vault EURC mainnet validado
```

Para testnet, use `DEFINDEX_NETWORK=testnet` e so preencha `EURC_ISSUER_TESTNET`/`DEFINDEX_EURC_VAULT` se voce tiver issuer e vault EURC de teste realmente validados. Nao use o issuer publico da Circle para transacao em testnet.

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
```

Se o banco for novo, aplique tambem as migrations base listadas em `new/session-env-and-migrations.md`.
