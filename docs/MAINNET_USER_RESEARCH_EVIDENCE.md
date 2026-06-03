# User Research Evidence Export

Infra para coletar e exportar evidencias reais de sessoes de usuarios.

Regra principal: nao crie wallets falsas, nao simule feedback e nao complete a lista com usuarios inventados. Se houver 8 usuarios reais, exporte 8.

## O que fica registrado

A tabela `public.user_research_events` guarda:

- usuario/sessao autenticada
- canal: Web, WhatsApp ou Telegram
- acao feita
- status: observado, sucesso, travou, erro ou feedback
- feedback literal, quando o usuario realmente falou algo
- URL/tela
- comprovante, hash ou evidencia anexada
- rede Stellar normalizada

O exportador tambem enriquece o log com `agent_sessions`, `agent_messages` e `payment_logs`. Por enquanto, o comando padrao recomendado filtra `TESTNET`.

## Migration

Aplicar no Supabase:

```bash
cd backend
npm run migrate:required
```

Em producao, aplique `backend/migrations/20260602_03_user_research_evidence.sql` pelo fluxo seguro do Supabase/CI. O runner `migrate:required` e apenas local/legacy.

## Tracking automatico

O frontend ja registra eventos reais em:

- login concluido
- PIX on-ramp concluido
- PIX off-ramp concluido
- PIX financiando transferencia concluida

Para registrar outro evento no frontend:

```ts
import { trackUserResearchEvent } from "@/lib/user-research"

trackUserResearchEvent({
  eventName: "profile_opened",
  eventGroup: "Perfil",
  taskLabel: "Abriu perfil global",
  status: "success",
  evidenceUrl: "https://talktostellar.com/profile/...",
})
```

## Export CSV/Markdown manual em TESTNET

```bash
cd backend
npm run research:export-testnet -- --since=2026-06-01 --limit=25
```

Saidas:

- `exports/user-research/testnet-user-research-log-*.json`
- `exports/user-research/testnet-user-research-log-*.csv`
- `exports/user-research/testnet-user-research-log-*.md`

O CSV pode ser importado no Notion. O Markdown ja vem no formato para colar manualmente no Notion.

Para exportar outra rede:

```bash
npm run research:export-user-log -- --network=mainnet --since=2026-06-01 --limit=25
npm run research:export-user-log -- --network=all --since=2026-06-01 --limit=25
```

## Sync Notion

Crie uma integration no Notion, compartilhe a pagina com ela e configure:

```bash
NOTION_API_KEY=secret_...
NOTION_USER_RESEARCH_PAGE_ID=<page-id>
NOTION_VERSION=2022-06-28
```

Depois rode:

```bash
cd backend
npm run research:sync-notion -- --since=2026-06-01 --limit=25
```

O script anexa um snapshot na pagina configurada. Publique essa pagina com `Share -> Publish to web` e use esse link no formulario.

## Campos esperados no Notion

Tabela resumida:

`Usuario | Data | Canal | O que fez | Resultado | Feedback literal | Evidencia`

Detalhes por usuario:

- frase exata digitada
- o que o produto fez/respondeu
- onde travou/confundiu
- recibo, hash, URL ou print

## Variaveis uteis

```env
USER_RESEARCH_EXPORT_DIR=exports/user-research
USER_RESEARCH_NETWORK=TESTNET
USER_RESEARCH_MAINNET_ONLY=false
USER_RESEARCH_LIMIT=25
USER_RESEARCH_SINCE=
USER_RESEARCH_UNTIL=
USER_RESEARCH_INCLUDE_SUSPECTED_TEST_USERS=false
USER_RESEARCH_SYNC_NOTION=false
NOTION_API_KEY=
NOTION_USER_RESEARCH_PAGE_ID=
NOTION_VERSION=2022-06-28
```
