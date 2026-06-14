# Logs Defindex/APY

O backend agora registra logs estruturados com prefixo:

```text
[defindex] event=...
```

## Como ativar

No backend, deixe pelo menos:

```env
LOG_LEVEL=info
```

Para mais detalhe, use:

```env
LOG_LEVEL=debug
```

Se quiser gravar em arquivo local:

```env
LOG_FILE=logs/backend.log
```

Em Railway/Vercel/Render, normalmente basta olhar os logs do servico backend.

## Se o backend nao mostrar nada

A rota do frontend tambem registra o proxy que chama o backend:

```text
[ramp-proxy] defindex_start
[ramp-proxy] defindex_response
[ramp-proxy] defindex_response_failed
```

Esses logs aparecem no servico do frontend, por exemplo Vercel, nao no backend. Se a tela mostra erro e o backend nao registra `[defindex]`, procure primeiro por `[ramp-proxy]` no frontend.

A tela tambem mostra um `ID do erro`. Use esse valor para correlacionar:

```text
request_id=ramp_...
support_code=TTS-...
```

O mesmo `request_id` e enviado no header `X-Request-Id` para o backend e aparece nos logs `[defindex]`.

## Eventos principais

Quando abre a tela:

```text
event=status_start
event=status_success
event=status_vault_apy_failed
```

Quando consulta posicao:

```text
event=balance_start
event=balance_success
event=balance_failed
```

Quando toca em preparar revisao:

```text
event=prepare_start
event=sdk_build_action_start
event=sdk_build_action_success
event=prepare_success
event=prepare_build_failed
event=route_failed
```

Quando confirma com PIN:

```text
event=execute_start
event=prepare_start
event=execute_submit_start
event=sdk_send_transaction_start
event=sdk_send_transaction_success
event=execute_submit_success
event=execute_secret_read_failed
event=execute_sign_failed
event=execute_submit_failed
event=execute_operation_persist_failed
event=route_failed
```

## O que aparece nos logs

Os logs incluem:

- `session_id`, `user_id`, `public_key` mascarados;
- `asset_code`;
- `vault_address` mascarado;
- `network`;
- `action`;
- `amount` e `amount_units`;
- `error_code`;
- `status`;
- `error`.
- `error_details` redigido quando o SDK/API retornar erro como objeto.

O backend mascara:

- PIN;
- session token;
- secrets;
- XDR;
- raw payloads.

Se aparecer `sdk_build_action_failed`, o campo mais importante agora e `error_details`. Ele deve mostrar a resposta redigida do SDK/API em vez de `[object Object]`.

## Como achar o erro do botao de revisao

Procure por:

```text
[defindex] event=prepare_build_failed
```

ou:

```text
[defindex] event=route_failed {"route":"prepare"
```

Se o erro for na confirmacao com PIN, procure:

```text
[defindex] event=execute_submit_failed
```

ou:

```text
[defindex] event=execute_secret_read_failed
```

Esses eventos mostram se o problema e configuracao do vault/API, saldo/trustline, chave da conta, assinatura ou envio da transacao.
