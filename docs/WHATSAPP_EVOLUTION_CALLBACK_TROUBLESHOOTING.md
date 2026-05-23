# WhatsApp/Evolution callback troubleshooting

Data: 2026-05-23

Este runbook explica como debugar o callback de WhatsApp/Evolution quando uma operacao termina e o usuario nao recebe a mensagem final no WhatsApp.

Casos cobertos:

- pagamento confirmado pela tela web;
- conversao concluida;
- PIX on-ramp concluido;
- PIX fund-and-pay concluido;
- qualquer fluxo que finalize no backend e precise avisar o canal externo.

## Diagnostico curto

Se o usuario consegue mandar mensagem para o bot e o bot responde, a entrada do webhook esta funcionando.

Se depois de confirmar uma transacao no browser o WhatsApp nao recebe a mensagem final, o problema esta em uma destas camadas:

1. o backend finalizou a operacao, mas nao chamou `TransferNotificationService`;
2. o backend chamou `TransferNotificationService`, mas nao encontrou mapping WhatsApp para aquele usuario/sessao;
3. o mapping existe, mas nao tem `instance`, `remote_jid` ou numero recuperavel;
4. a Evolution esta configurada com URL/API key/instance errada;
5. a Evolution esta conectada para receber webhook, mas nao consegue enviar mensagem ativa;
6. o link usado foi gerado antes do deploy/correcao e nao carregou o contexto atualizado.

## Fluxo esperado

```text
Usuario manda mensagem no WhatsApp
-> Evolution chama webhook do backend
-> backend chama agent
-> agent gera link de confirmacao
-> usuario abre link e confirma com PIN
-> backend executa operacao
-> PaymentReceiptService cria comprovante/resultado
-> TransferNotificationService encontra o mapping externo do usuario
-> TransferNotificationService escolhe instancia Evolution
-> EvolutionService chama /message/sendText/:instance
-> usuario recebe mensagem final no WhatsApp
```

## Correcao ja implementada

Antes, a camada de callback dependia quase sempre da instancia global:

```text
EVOLUTION_INSTANCE
EVOLUTION_NOTIFY_INSTANCE
EVOLUTION_DEFAULT_INSTANCE
```

Isso falhava quando a instancia real que recebeu a mensagem era diferente da env global. O webhook de entrada podia funcionar, mas o callback de finalizacao saia pela instancia errada ou nem tentava enviar.

Agora o backend:

- salva `instance`, `remote_jid`, `whatsapp_number` e dados correlatos em `external_accounts.data`;
- preserva esses dados em links de onboarding/login gerados a partir do WhatsApp;
- usa primeiro a instancia salva no mapping do WhatsApp;
- usa a instancia configurada no env apenas como fallback;
- recupera numero a partir de `remote_jid`;
- tenta enviar para `5519...`, `+5519...` e `5519...@s.whatsapp.net`;
- tenta payloads Evolution `v2`, `v1` e `hybrid`;
- retorna relatorio de entrega em `/api/evolution/test-notify`.

Correcao adicional aplicada depois:

- quando um link de confirmacao carrega `provider/provider_user_id`, o backend tambem cria um mapping direto temporario para aquele canal;
- antes, esse mapping direto podia ter o mesmo `provider_user_id` do mapping salvo no Supabase, mas sem `instance` e sem `remote_jid`;
- o dedupe mantinha o mapping direto e descartava o mapping salvo mais rico;
- com isso, o envio dependia da instancia global do env e podia falhar mesmo com `external_accounts.data.instance` correto;
- agora mappings duplicados sao mesclados, preservando `instance`, `remote_jid`, `whatsapp_number` e demais dados do mapping salvo;
- `/api/evolution/test-notify` tambem busca mapping por `user_id` mesmo quando nao recebe `session_id`.

Correcao de instancia aplicada depois dos logs de Railway:

- os logs da Evolution podem mostrar `instanceId` como UUID, por exemplo `635afaa8-b4d2-4e04-8b35-3093d16ba1af`;
- esse UUID e util para diagnostico, mas normalmente o endpoint `/message/sendText/:instance` espera o nome da instancia, por exemplo `TalkToStellar`;
- agora o backend salva `instance_id` separadamente como metadata;
- se existir `EVOLUTION_INSTANCE=TalkToStellar`, o backend usa esse nome para enviar e nao troca pelo UUID;
- os logs do backend agora mostram entrada do webhook assim:

```text
[evolution-webhook] received message from ***4114 on instance TalkToStellar instance_id=635afaa8-b4d2-4e04-8b35-3093d16ba1af message_id=...
```

Os logs da Evolution so provam que a instancia esta conectada e recebeu/enviou algo internamente. Para confirmar callback de pagamento, procure logs no backend com:

```text
[receipt]
[whatsapp-notify]
[evolution-send]
[evolution-webhook]
```

## Arquivos relevantes

```text
backend/src/api/controllers/evolution.controller.ts
backend/src/api/controllers/external.controller.ts
backend/src/api/controllers/external-finalize.controller.ts
backend/src/agent/routes.ts
backend/src/api/services/evolution.service.ts
backend/src/api/services/transfer-notification.service.ts
backend/tests/evolution.service.test.ts
backend/tests/transfer-notification.service.test.ts
```

## Variaveis necessarias no backend

Minimo para envio ativo pelo WhatsApp:

```text
EVOLUTION_API_URL=https://sua-evolution.up.railway.app
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=nome-da-instancia-conectada
```

Aliases aceitos para API key:

```text
AUTHENTICATION_API_KEY=...
EVOLUTION_GLOBAL_API_KEY=...
EVOLUTION_APIKEY=...
```

Aliases aceitos para instancia:

```text
EVOLUTION_INSTANCE_NAME=nome-da-instancia-conectada
EVOLUTION_NOTIFY_INSTANCE=nome-da-instancia-conectada
EVOLUTION_DEFAULT_INSTANCE=nome-da-instancia-conectada
EVOLUTION_INSTANCE_ID=uuid-da-instancia-apenas-se-voce-nao-tiver-o-nome
```

Diagnostico protegido:

```text
INTERNAL_API_SECRET=...
EVOLUTION_DIAGNOSTIC_SECRET=...
```

Webhook de entrada:

```text
EVOLUTION_WEBHOOK_SECRET=...
PUBLIC_BACKEND_URL=https://seu-backend.up.railway.app
```

Timeout/retry opcionais:

```text
EVOLUTION_NOTIFY_SEND_ATTEMPTS=3
EVOLUTION_NOTIFY_SEND_TIMEOUT_MS=45000
EVOLUTION_AGENT_TIMEOUT_MS=120000
EVOLUTION_SEND_TEXT_BODY_VERSION=v2
```

Observacoes:

- `EVOLUTION_API_URL` deve apontar para a Evolution, nao para o backend.
- `EVOLUTION_INSTANCE` deve ser exatamente o nome da instancia conectada na Evolution.
- No seu caso atual, pelos logs, o nome da instancia e `TalkToStellar`. Use esse valor em `EVOLUTION_INSTANCE`.
- Nao use o UUID de `instanceId` como `EVOLUTION_INSTANCE` se voce tem o nome da instancia.
- O nome da instancia pode ser case-sensitive dependendo da Evolution.
- Se `EVOLUTION_SEND_TEXT_BODY_VERSION` ficar vazio, o backend tenta `v2`, depois `v1`, depois `hybrid`.

## Passo obrigatorio depois de deploy

Depois de subir a correcao:

1. mande uma nova mensagem pelo WhatsApp para o bot;
2. espere o bot responder;
3. gere um novo link de pagamento/PIX;
4. confirme a transacao por esse novo link.

Mensagem recomendada:

```text
saldo
```

Motivo: a nova mensagem atualiza `external_accounts.data` com a instancia real e o `remote_jid`. Links antigos podem nao carregar esse contexto.

## Arvore de decisao

### 1. O bot responde no WhatsApp?

Teste no WhatsApp:

```text
saldo
```

Se nao responde:

- o problema esta no webhook de entrada;
- verifique `EVOLUTION_WEBHOOK_SECRET`;
- verifique a URL configurada na Evolution;
- verifique se o backend esta publico;
- verifique logs `[evolution-webhook]`.

Se responde:

- a entrada funciona;
- prossiga para teste de saida.

### 2. O backend consegue enviar mensagem direta pela Evolution?

Use `/api/evolution/test-send`.

Se falha:

- problema em `EVOLUTION_API_URL`, API key, instancia ou conexao da Evolution;
- ainda nao e problema de pagamento.

Se funciona:

- Evolution consegue enviar;
- prossiga para teste da camada de callback.

### 3. A camada `TransferNotificationService` consegue notificar por numero?

Use `/api/evolution/test-notify` com `provider_user_id`.

Se falha:

- o problema esta na camada de notificador ou provider.

Se funciona:

- envio por numero esta OK;
- prossiga para teste por `session_id` ou `user_id`.

### 4. A camada consegue notificar usando a sessao real?

Use `/api/evolution/test-notify` com `session_id` ou `user_id`.

Se falha:

- o mapping `external_accounts` esta ausente ou incompleto;
- mande uma nova mensagem pelo WhatsApp e gere novo link;
- verifique a query SQL de mapping neste documento.

Se funciona:

- notificador e mapping estao OK;
- se o pagamento ainda nao manda callback, o fluxo de finalizacao nao esta chamando/notificando com o contexto correto.

## Teste 1 - envio direto pela Evolution

Use este teste para verificar se a Evolution consegue enviar mensagem sem passar pela camada de pagamentos.

```bash
curl -s -X POST "$BACKEND_URL/api/evolution/test-send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -d '{
    "number": "5519981808102",
    "text": "Teste direto Evolution TalkToStellar"
  }' | jq
```

Resultado esperado:

```json
{
  "success": true,
  "instance": "nome-da-instancia",
  "recipient_tail": "8102",
  "response": {}
}
```

Se isso falhar, leia `message`.

Falhas comuns:

| Erro | Causa provavel | Acao |
| --- | --- | --- |
| `EVOLUTION_API_URL is required` | Env ausente no backend | Configure a URL publica da Evolution. |
| `EVOLUTION_API_KEY or AUTHENTICATION_API_KEY is required` | API key ausente | Configure a global API key da Evolution. |
| `EVOLUTION_INSTANCE is required` | Instancia ausente | Configure `EVOLUTION_INSTANCE` ou passe `instance` no body. |
| `401` ou `403` | API key errada | Confira key no painel Evolution. |
| `404` | URL base ou instance errada | Confira URL publica e nome exato da instancia. |
| `400` ou `422` | Formato de payload diferente | Tente `EVOLUTION_SEND_TEXT_BODY_VERSION=v1` ou `hybrid`. |
| timeout/aborted | Evolution lenta ou indisponivel | Aumente timeout e cheque logs da Evolution. |

## Teste 2 - callback por numero

Use este teste para exercitar o mesmo caminho usado por pagamento, mas ainda informando o numero diretamente.

```bash
curl -s -X POST "$BACKEND_URL/api/evolution/test-notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -d '{
    "provider": "whatsapp",
    "provider_user_id": "5519981808102",
    "text": "Teste callback TalkToStellar por numero"
  }' | jq
```

Resultado bom:

```json
{
  "success": true,
  "delivery": {
    "whatsapp": {
      "attempted": true,
      "delivered": 1,
      "recipients": 1
    }
  }
}
```

Resultado ruim:

```json
{
  "success": false,
  "delivery": {
    "whatsapp": {
      "attempted": true,
      "delivered": 0,
      "attempts": [
        {
          "phone_tail": "8102",
          "instance": "nome-da-instancia",
          "delivered": false,
          "error": "Evolution sendText failed: ..."
        }
      ]
    }
  }
}
```

Nesse caso, leia:

```text
delivery.whatsapp.attempts[0].error
```

## Teste 3 - callback pela sessao real

Este e o teste mais importante para o caso "pagamento finalizou, mas nao avisou no WhatsApp".

Use o mesmo `session_id` do link/login/pagamento:

```bash
curl -s -X POST "$BACKEND_URL/api/evolution/test-notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -d '{
    "session_id": "SESSION_ID_DA_CONTA",
    "text": "Teste callback TalkToStellar por sessao"
  }' | jq
```

Ou use `user_id`:

```bash
curl -s -X POST "$BACKEND_URL/api/evolution/test-notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -d '{
    "user_id": "USER_ID_DA_CONTA",
    "text": "Teste callback TalkToStellar por usuario"
  }' | jq
```

Interpretação:

- Se `test-notify` por numero funciona, mas por `session_id` falha, o problema e mapping.
- Se por `session_id` funciona, mas a transacao real nao avisa, o problema esta no fluxo de finalizacao daquela rota.

## Como verificar o mapping no Supabase

Rode no SQL editor do Supabase:

```sql
select
  id,
  user_id,
  provider,
  provider_user_id,
  data->>'instance' as instance,
  data->>'instanceName' as instance_name,
  data->>'remote_jid' as remote_jid,
  data->>'remoteJid' as remote_jid_alt,
  data->>'whatsapp_number' as whatsapp_number,
  data->>'phone_number' as phone_number,
  updated_at
from public.external_accounts
where lower(provider) in ('whatsapp', 'phone', 'evolution', 'whatsapp_evolution')
order by updated_at desc
limit 30;
```

Mapping bom deve ter pelo menos:

```text
provider = whatsapp
provider_user_id = 5519...
data.instance = nome-da-instancia
data.remote_jid = 5519...@s.whatsapp.net
```

Se `instance` e `remote_jid` estiverem vazios:

1. mande nova mensagem no WhatsApp;
2. confirme que o bot respondeu;
3. rode a query novamente;
4. gere novo link.

## Logs esperados

Entrega boa:

```text
[evolution-send] delivered message to ***8102 using v2 payload
[receipt] receipt delivered to WhatsApp recipients=1 delivered=1 instances=nome-da-instancia
```

Falha de instancia/API:

```text
[whatsapp-notify] evolution send failed for ***8102 on instance ...
```

Sem env suficiente:

```text
[whatsapp-notify] evolution skipped: set EVOLUTION_API_URL plus EVOLUTION_API_KEY/AUTHENTICATION_API_KEY and provide EVOLUTION_INSTANCE or a saved WhatsApp mapping instance.
```

Sem canal WhatsApp localizado:

```text
[whatsapp-notify] skipped: no WhatsApp recipient digits found.
```

Fallback de Twilio nao configurado:

```text
[whatsapp-notify] no WhatsApp provider delivered the message. Twilio fallback is not configured.
```

Recibo concluido mas WhatsApp nao entregue:

```text
[receipt] receipt was not delivered to WhatsApp: {"attempted":true,"delivered":0,"recipients":1,...}
```

Quando esse log aparecer, o pagamento/PIX terminou e o recibo foi gerado, mas a entrega ativa no WhatsApp falhou. O detalhe dentro de `attempts` mostra a instancia usada e o erro retornado pela Evolution.

## Checklist para Railway

1. Backend redeployado com o commit que contem a correcao.
2. Evolution service esta de pe e acessivel pela URL publica.
3. `EVOLUTION_API_URL` aponta para a Evolution, nao para o backend.
4. `EVOLUTION_API_KEY` ou `AUTHENTICATION_API_KEY` esta igual a global API key da Evolution.
5. `EVOLUTION_INSTANCE` ou `EVOLUTION_NOTIFY_INSTANCE` tem exatamente o nome da instancia conectada.
6. A instancia aparece conectada no painel da Evolution.
7. Webhook da Evolution aponta para:

```text
https://SEU_BACKEND/api/evolution/webhook?secret=SEU_EVOLUTION_WEBHOOK_SECRET
```

8. O secret da URL bate com `EVOLUTION_WEBHOOK_SECRET`.
9. Depois do deploy, o usuario mandou uma nova mensagem no WhatsApp.
10. O bot respondeu essa nova mensagem.
11. O link de pagamento/PIX foi gerado depois dessa nova mensagem.
12. `/api/evolution/test-send` funciona.
13. `/api/evolution/test-notify` por numero mostra `delivered: 1`.
14. `/api/evolution/test-notify` por `session_id` mostra `delivered: 1`.
15. A transacao real gera log `[evolution-send] delivered message`.

## Checklist na Evolution

Confirme no painel/servico Evolution:

- a instancia esta conectada via QR;
- o nome da instancia e exatamente o mesmo do env;
- a instancia consegue enviar mensagem manual/teste;
- o webhook esta ativo;
- o evento `MESSAGES_UPSERT` esta habilitado;
- nao ha outro backend antigo recebendo webhook;
- nao ha outro servico Railway antigo com env diferente;
- a global API key usada no backend e a mesma configurada na Evolution.

## Sintomas e causa provavel

| Sintoma | Causa mais provavel | Como provar |
| --- | --- | --- |
| Bot responde mensagens, mas callback final nao chega | Saida ativa/mapping | Rode `test-send`, depois `test-notify`. |
| `test-send` falha | Env ou Evolution | Veja `message` da resposta. |
| `test-send` funciona e `test-notify` por numero falha | TransferNotification/Evolution candidates | Veja `delivery.whatsapp.attempts`. |
| `test-notify` por numero funciona e por sessao falha | Mapping ausente/incompleto | Rode query em `external_accounts`. |
| `test-notify` por sessao funciona e pagamento nao avisa | Finalizacao nao chama notificador ou link antigo | Gere novo link e cheque logs da rota final. |
| Aparece `delivered: 0` com `recipients: 0` | Numero nao foi recuperado | Verifique `provider_user_id`, `remote_jid`, `whatsapp_number`. |
| Aparece `instances: []` | Instancia nao existe em mapping/env | Configure env ou atualize mapping com nova mensagem. |
| 401/403 da Evolution | API key errada | Recrie/cole key global correta. |
| 404 da Evolution | URL ou instancia errada | Teste URL base e nome exato da instancia. |
| Timeout | Evolution lenta/desconectada | Verifique logs Evolution e aumente timeout. |

## Quando o problema e link antigo

Sinais:

- o bot responde no WhatsApp;
- `test-send` funciona;
- `test-notify` por numero funciona;
- callback real nao chega apenas em links antigos.

Acao:

1. mande `saldo` no WhatsApp;
2. gere um novo link pelo WhatsApp;
3. confirme pelo link novo.

Motivo: links antigos podem nao carregar metadados de canal que foram adicionados depois da correcao.

## Quando o problema e mapping

Sinais:

- `test-notify` por numero funciona;
- `test-notify` por `session_id` falha ou nao tenta envio;
- query em `external_accounts` nao mostra `instance`/`remote_jid`.

Acao:

1. mande mensagem nova no WhatsApp;
2. confira se `external_accounts.data` atualizou;
3. confira se `provider_user_id` tem o numero com DDI;
4. confira se `data.remote_jid` parece `5519...@s.whatsapp.net`;
5. gere novo link.

## Quando o problema e Evolution

Sinais:

- `test-send` falha;
- erro contem status 401, 403, 404, 400, 422 ou timeout;
- logs da Evolution mostram instancia desconectada.

Acao:

1. confira `EVOLUTION_API_URL`;
2. confira API key;
3. confira nome da instancia;
4. reconecte QR se necessario;
5. teste envio manual no painel Evolution;
6. ajuste `EVOLUTION_SEND_TEXT_BODY_VERSION` se a versao da Evolution exigir outro payload.

## Nao requer migration

Esta correcao nao adiciona tabela nem coluna nova.

Ela usa o campo JSON `external_accounts.data`, que ja existe.

## Informacoes para colar quando pedir debug

Cole:

```text
1. Resposta completa de /api/evolution/test-send
2. Resposta completa de /api/evolution/test-notify por numero
3. Resposta completa de /api/evolution/test-notify por session_id
4. Nome exato da instancia conectada na Evolution
5. Logs do backend contendo [whatsapp-notify], [evolution-send] e [evolution-webhook]
6. Resultado redigido da query em external_accounts
7. Confirmacao se voce mandou uma mensagem nova no WhatsApp depois do deploy
8. Confirmacao se o link foi gerado depois dessa nova mensagem
```

Nao cole:

```text
API key
token de sessao
PIN
Supabase service role
seed/secret Stellar
JWT completo
```

## Resultado esperado final

Antes de testar pagamentos reais de demo, estes quatro testes devem passar:

```text
1. Usuario manda "saldo" no WhatsApp e recebe resposta.
2. /api/evolution/test-send retorna success=true.
3. /api/evolution/test-notify por numero retorna delivered=1.
4. /api/evolution/test-notify por session_id retorna delivered=1.
```

Se esses quatro passam, o canal WhatsApp esta pronto. Qualquer falha restante fica isolada na rota especifica que finaliza pagamento/PIX/conversao.
