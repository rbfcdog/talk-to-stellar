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

O backend mascara:

- PIN;
- session token;
- secrets;
- XDR;
- raw payloads.

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
