# Telegram 401 runbook

## O que aconteceu

Se o log mostra algo assim:

```text
[telegram-profile] could not set profile photo: ... status=401 ... "Unauthorized"
[telegram-profile] could not set short description: ... status=401 ... "Unauthorized"
[telegram-profile] could not set description: ... status=401 ... "Unauthorized"
[telegram] failed to start bot: TelegramError: 401: Unauthorized
method: "setWebhook"
```

o Telegram rejeitou o `TELEGRAM_BOT_TOKEN` que chegou no container.

Isso nao e erro de `AGENT_INGEST_SECRET`, nao e erro da URL do webhook e nao e erro do perfil do bot. Todas essas chamadas (`getMe`, `setMyProfilePhoto`, `setMyShortDescription`, `setMyDescription`, `setWebhook`) usam o mesmo token. Quando todas voltam `401 Unauthorized`, a causa raiz e token invalido para o Bot API.

## Por que pode quebrar sem voce "mudar env"

O valor da variavel no painel pode parecer igual, mas o token pode deixar de ser aceito por motivos externos:

1. O token foi regenerado no `@BotFather`. Quando isso acontece, o token antigo para de funcionar imediatamente.
2. O token que esta no deploy e antigo, mesmo que o nome da env nao tenha mudado.
3. O token foi copiado com caractere extra: aspas, espaco, quebra de linha, prefixo `bot`, URL completa ou username do bot.
4. O deploy esta lendo envs de outro escopo/servico. Exemplo: backend tem uma env correta, mas o servico `telegram` no Railway tem outra.
5. O container foi reiniciado e passou a validar o token no boot. Um token ja invalido pode so aparecer depois do restart/deploy.
6. `TELEGRAM_PROFILE_SETUP=true` adiciona chamadas de avatar/descricao no boot. Isso pode mostrar o `401` antes do `setWebhook`, mas nao e a causa. Se o token esta invalido, o `setWebhook` tambem falha.
7. O log `injected env (0) from .env` quer dizer que aquele arquivo nao injetou variaveis no container. Nesse caso, o valor real precisa estar no provider de deploy, nao apenas em `.env` local.

## Como confirmar em 30 segundos

Rode no mesmo ambiente do servico Telegram, nao no backend e nao no seu terminal local se ele tiver outra env:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

Resultado bom:

```json
{"ok":true,"result":{"id":123456789,"is_bot":true,"username":"..."}}
```

Resultado ruim:

```json
{"ok":false,"error_code":401,"description":"Unauthorized"}
```

Se vier `401`, pare de testar webhook. Corrija `TELEGRAM_BOT_TOKEN` primeiro.

## Checagens seguras

Nao printe o token completo em logs. Use checagens sem expor segredo:

```bash
node -e 'const t=(process.env.TELEGRAM_BOT_TOKEN||"").trim(); console.log({present:!!t,length:t.length,shape:/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(t),preview:t?t.slice(0,3)+"..."+t.slice(-4):""})'
```

O formato esperado e:

```text
123456789:ABCdef_...
```

Valores errados comuns:

```text
bot123456789:ABC...
https://api.telegram.org/bot123456789:ABC...
@nome_do_bot
"123456789:ABC..."
123456789:ABC... 
```

## Como corrigir

1. Abra o Telegram e fale com `@BotFather`.
2. Use `/mybots`.
3. Selecione o bot correto.
4. Abra `API Token`.
5. Copie o token atual. Se tiver duvida, regenere.
6. No Railway/provider, atualize `TELEGRAM_BOT_TOKEN` no servico `telegram`.
7. Confirme que voce nao atualizou apenas o backend. O adapter Telegram e um servico separado.
8. Redeploy/restart do servico Telegram.
9. Rode:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

10. Depois do boot, o log esperado e algo parecido com:

```text
[telegram] token verified for @seu_bot
Telegram bot started in webhook mode as @seu_bot
Webhook: https://seu-servico/webhook/telegram
```

## Env minima do servico Telegram

```env
TELEGRAM_BOT_TOKEN=token-atual-do-botfather
TELEGRAM_AGENT_URL=https://seu-backend/api/agent/query
TELEGRAM_BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://seu-servico-telegram
TELEGRAM_WEBHOOK_PATH=/webhook/telegram
AGENT_INGEST_SECRET=mesmo-valor-do-backend
TELEGRAM_NOTIFY_SECRET=mesmo-valor-do-backend-ou-internal
TELEGRAM_PROFILE_SETUP=true
```

Para isolar problema de perfil, voce pode temporariamente usar:

```env
TELEGRAM_PROFILE_SETUP=false
```

Mas isso so pula avatar/descricao. Se `setWebhook` ou `getMe` ainda retorna `401`, o token continua invalido.

## Diferenca entre erros

| Log | Causa mais provavel | Onde corrigir |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN is required` | Env ausente | Servico Telegram |
| `TELEGRAM_BOT_TOKEN is malformed` | Token em formato errado | Servico Telegram |
| `401 Unauthorized` em `getMe`/`setWebhook` | Token rejeitado pelo Telegram | BotFather + servico Telegram |
| `AGENT_INGEST_SECRET is required` | Segredo interno ausente | Backend e Telegram |
| Bot sobe mas nao responde | Webhook errado, outro deploy usando mesmo token, ou backend recusando chamadas | Telegram service + backend |
| `409 Conflict` em polling | Mais de um processo usando polling no mesmo bot | Usar webhook em producao |

## Observacao de seguranca

Se um token real apareceu em `.env`, print de terminal, screenshot, chat ou repo, trate como exposto. Mesmo se o arquivo estiver no `.gitignore`, qualquer pessoa com acesso ao ambiente pode copiar o token. A resposta correta e regenerar no `@BotFather`, atualizar o deploy e nunca commitar `.env` real.

## Diagnostico para este caso

Pelos logs vistos nesta sessao, o erro atual e:

```text
TelegramError: 401: Unauthorized
method: setWebhook
```

Como as chamadas de perfil tambem retornam `401`, o bot nao esta falhando por causa de perfil. O Telegram esta recusando o token que o container recebeu. A correcao pratica e atualizar `TELEGRAM_BOT_TOKEN` no servico Telegram com o token atual do `@BotFather` e redeployar.
