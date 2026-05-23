# WhatsApp/Evolution callback troubleshooting

Data: 2026-05-23

Este documento explica o estado atual do callback de WhatsApp quando uma operacao termina, principalmente pagamento confirmado, conversao concluida, PIX on-ramp concluido e PIX fund-and-pay concluido.

## Problema observado

O usuario conseguia mandar mensagem para o bot pelo WhatsApp, mas depois de confirmar uma transacao na tela web o WhatsApp nao recebia a mensagem final dizendo que a transacao foi concluida.

Isso indica que a entrada do webhook estava funcionando, mas a saida ativa pela Evolution podia falhar.

Fluxo esperado:

```text
Usuario manda mensagem no WhatsApp
-> Evolution chama webhook do backend
-> backend chama agent
-> agent gera link de confirmacao
-> usuario abre link e confirma com PIN
-> backend executa operacao
-> PaymentReceiptService cria comprovante
-> TransferNotificationService encontra o canal WhatsApp
-> EvolutionService envia mensagem no WhatsApp
```

## Causa mais provavel corrigida

Antes, a camada de callback usava principalmente a instancia global do env:

```text
EVOLUTION_INSTANCE
EVOLUTION_NOTIFY_INSTANCE
EVOLUTION_DEFAULT_INSTANCE
```

Mas a mensagem recebida pela Evolution ja carrega a instancia real conectada. Se a env global estivesse vazia, diferente ou apontando para outra instancia, o webhook de entrada continuava funcionando, mas o callback de finalizacao podia sair pela instancia errada ou nem tentar envio.

Agora o backend:

- salva `instance`, `remote_jid` e `whatsapp_number` no mapping `external_accounts.data`;
- preserva esses dados em links de onboarding/login gerados a partir do WhatsApp;
- usa primeiro a instancia salva no mapping do WhatsApp;
- depois tenta a instancia configurada no env como fallback;
- consegue recuperar o numero pelo `remote_jid`;
- tenta formatos de envio `5519...`, `+5519...` e `5519...@s.whatsapp.net`;
- retorna um relatorio de entrega em `/api/evolution/test-notify`.

## Arquivos alterados

```text
backend/src/api/controllers/external.controller.ts
backend/src/api/controllers/external-finalize.controller.ts
backend/src/agent/routes.ts
backend/src/api/services/transfer-notification.service.ts
backend/src/api/services/evolution.service.ts
backend/src/api/controllers/evolution.controller.ts
backend/tests/transfer-notification.service.test.ts
backend/tests/evolution.service.test.ts
```

## Variaveis necessarias no backend

Minimo para callback ativo:

```text
EVOLUTION_API_URL=https://sua-evolution.up.railway.app
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=nome-da-instancia-conectada
```

Alternativas aceitas:

```text
AUTHENTICATION_API_KEY=...
EVOLUTION_GLOBAL_API_KEY=...
EVOLUTION_NOTIFY_INSTANCE=nome-da-instancia-conectada
EVOLUTION_DEFAULT_INSTANCE=nome-da-instancia-conectada
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
```

## Passo obrigatorio depois do deploy

Depois de subir esta correcao, mande uma nova mensagem pelo WhatsApp para o bot antes de testar uma transacao.

Exemplo:

```text
saldo
```

Motivo: essa nova mensagem atualiza `external_accounts.data` com a instancia real da Evolution e o `remote_jid`. Depois disso, gere um novo link de pagamento/PIX e confirme.

Links antigos podem nao carregar o novo contexto de instancia, embora o fallback por mapping de usuario deva funcionar depois que o mapping for atualizado.

## Teste direto de envio pela Evolution

Use este teste para verificar se a Evolution consegue enviar uma mensagem sem passar pela camada de pagamento:

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

Se falhar aqui, o problema esta na Evolution/env/instancia, nao no fluxo de pagamento.

## Teste da camada de callback

Use este teste para verificar o mesmo caminho usado por pagamentos e PIX:

```bash
curl -s -X POST "$BACKEND_URL/api/evolution/test-notify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  -d '{
    "provider": "whatsapp",
    "provider_user_id": "5519981808102",
    "text": "Teste callback TalkToStellar"
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

Resultado ruim agora fica mais diagnosticavel:

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

Nesse caso, leia `delivery.whatsapp.attempts[0].error`.

## Logs esperados

Entrega boa:

```text
[evolution-send] delivered message to ***8102 using v2 payload
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

## Checklist para Railway

1. Backend esta redeployado com este commit.
2. `EVOLUTION_API_URL` aponta para a URL publica da Evolution, nao para o backend.
3. `EVOLUTION_API_KEY` ou `AUTHENTICATION_API_KEY` esta igual ao global API key da Evolution.
4. `EVOLUTION_INSTANCE` ou `EVOLUTION_NOTIFY_INSTANCE` tem exatamente o nome da instancia conectada.
5. Evolution mostra a instancia como conectada ao WhatsApp.
6. Webhook da Evolution aponta para:

```text
https://SEU_BACKEND/api/evolution/webhook?secret=SEU_EVOLUTION_WEBHOOK_SECRET
```

7. Depois do deploy, o usuario mandou uma nova mensagem no WhatsApp para atualizar `instance` e `remote_jid`.
8. O link de pagamento/PIX foi gerado de novo depois dessa mensagem.
9. `/api/evolution/test-send` funciona.
10. `/api/evolution/test-notify` mostra `delivered: 1`.

## O que nao requer migration

Esta correcao nao adiciona tabela nem coluna nova.

Ela apenas passa a usar melhor o campo JSON `external_accounts.data`, que ja existe.

## Se ainda nao funcionar

Cole para debug:

```text
1. Resposta completa de /api/evolution/test-send
2. Resposta completa de /api/evolution/test-notify
3. Nome exato da instancia conectada na Evolution
4. Logs do backend contendo [whatsapp-notify] ou [evolution-send]
5. Confirme se voce mandou uma mensagem nova no WhatsApp depois do deploy
```

Nao cole API key, token de sessao, PIN, Supabase service role ou seed Stellar.
