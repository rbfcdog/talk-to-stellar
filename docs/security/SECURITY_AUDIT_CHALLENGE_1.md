# Desafio 1 - Auditoria de Seguranca

## Relato do achado critico e como foi corrigido

Foi identificada uma vulnerabilidade critica de takeover de conta no fluxo de redefinicao de PIN.

Antes da correcao, o endpoint publico `POST /api/security/reset-pin-init` aceitava apenas `user_id` e `session_id`, gerava um token de redefinicao e devolvia esse token diretamente na resposta JSON. Como o PIN e usado para aprovar operacoes financeiras, um atacante que obtivesse ou descobrisse um `session_id` poderia iniciar a redefinicao, receber o link/token e trocar o PIN sem provar posse da sessao, email, passkey ou canal externo.

Impacto pratico: tomada da conta funcional no app, troca de PIN e possibilidade de autorizar pagamentos/saques que dependem do PIN.

Correcao aplicada:

- `POST /api/security/reset-pin-init` agora carrega a sessao no backend e exige uma destas provas antes de gerar o link:
  - `session_token` valido da propria sessao; ou
  - autorizacao interna via `INTERNAL_API_SECRET`.
- O endpoint rejeita sessoes expiradas.
- O endpoint rejeita `user_id` que nao corresponda ao `user_id` ou email da sessao autenticada.
- A resposta deixou de expor o campo bruto `token`.
- O servico de reset deixou de persistir o token em claro na coluna legada `reset_token`; agora persiste hash.
- A aplicacao do novo PIN passou a atualizar a sessao especifica do token (`session_id`) em vez de atualizar todas as sessoes pelo mesmo `user_id`.
- Foram adicionados testes cobrindo o bypass e a ausencia do campo `token` na resposta.

Arquivos alterados:

- `backend/src/api/controllers/pin-reset.controller.ts`
- `backend/src/services/pin-reset.service.ts`
- `backend/tests/pin-reset.controller.test.ts`

## Severidade

Critica.

Justificativa:

- O PIN e fator de autorizacao de pagamentos.
- O endpoint era publico.
- O endpoint retornava o proprio segredo necessario para concluir o reset.
- A exploracao nao exigia acesso ao email da vitima, passkey ou PIN antigo.
- A falha podia virar troca de PIN e autorizacao indevida de transacoes.

## Fluxo vulneravel antes da correcao

O fluxo vulneravel era:

1. Atacante obtinha um `session_id`.
2. Atacante consultava dados publicos de sessao ou ja possuia `user_id`.
3. Atacante chamava:

```bash
curl -X POST http://localhost:3001/api/security/reset-pin-init \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "SESSION_ID_DA_VITIMA",
    "user_id": "USER_ID_DA_VITIMA"
  }'
```

4. A API retornava:

```json
{
  "success": true,
  "reset_url": "http://localhost:3000/change-pin?token=...",
  "token": "..."
}
```

5. Com esse token, o atacante podia finalizar:

```bash
curl -X POST http://localhost:3001/api/security/reset-pin-finalize \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "USER_ID_DA_VITIMA",
    "token": "TOKEN_RETORNADO_PELO_BACKEND",
    "new_pin": "123456"
  }'
```

Resultado: PIN alterado sem prova de posse.

## Causa raiz

A causa raiz foi a combinacao de tres problemas:

1. Endpoint sensivel exposto publicamente.
2. Autorizacao baseada somente em identificadores (`session_id` e `user_id`), que nao sao segredos fortes.
3. Retorno do segredo de reset (`token`) diretamente no corpo da resposta.

Tambem havia um problema secundario: `PinResetService.applyNewPin()` atualizava por `user_id`, o que poderia afetar mais de uma sessao da mesma identidade. O reset deveria ser limitado a sessao que originou o token.

## Correcao tecnica aplicada

### 1. Prova de posse no inicio do reset

Em `backend/src/api/controllers/pin-reset.controller.ts`, o endpoint agora:

- carrega a sessao por `session_id`;
- verifica se a sessao existe;
- verifica expiracao da sessao;
- compara `session_token` com comparacao em tempo constante;
- aceita fallback apenas para chamada interna com `INTERNAL_API_SECRET`;
- valida que o `user_id` informado pertence a sessao.

Trecho relevante:

```ts
const authorizedBySession =
  Boolean(providedSessionToken && storedSessionToken) &&
  timingSafeEqualString(providedSessionToken, storedSessionToken);

if (!authorizedBySession && !isInternalRequest(req)) {
  return res.status(401).json({
    success: false,
    message: 'Valid session_token or internal authorization is required to initiate PIN reset.',
  });
}
```

### 2. Remocao do token bruto da resposta

Antes:

```ts
return res.status(200).json({
  reset_url: resetData.reset_url,
  token: resetData.token,
});
```

Depois:

```ts
return res.status(200).json({
  success: true,
  message: `Reset link generated. Valid for ${resetData.expires_in_minutes} minutes.`,
  reset_url: resetData.reset_url,
  expires_in_minutes: resetData.expires_in_minutes,
});
```

### 3. Token nao fica mais persistido em claro

Em `backend/src/services/pin-reset.service.ts`, a coluna legada `reset_token` continua preenchida por compatibilidade de schema, mas agora recebe o hash, nao o bearer token.

```ts
reset_token: tokenHash,
token_hash: tokenHash,
```

### 4. Reset limitado a sessao do token

Antes, a troca de PIN era aplicada com:

```ts
.eq('user_id', userId)
```

Depois, a troca e aplicada no `session_id` associado ao token:

```ts
.eq('session_id', tokenData.session_id)
```

Isso reduz o blast radius e evita que um token de uma sessao altere outras sessoes do mesmo usuario.

### 5. JWT fallback tambem carrega `session_id`

O fallback JWT agora inclui `session_id`. Tokens antigos sem `session_id` passam a ser rejeitados com orientacao para solicitar um novo link.

## Testes adicionados

Arquivo:

```text
backend/tests/pin-reset.controller.test.ts
```

Cenarios cobertos:

- Nao inicia reset sem `session_token` ou autorizacao interna.
- Inicia reset com `session_token` valido.
- Nao retorna campo bruto `token`.
- Rejeita tentativa de reset para `user_id` diferente do dono da sessao.

Comandos executados:

```bash
cd backend
npm test -- --runTestsByPath tests/pin-reset.controller.test.ts
npm run build
```

Resultado:

- Test suite: passou.
- 3 testes: passaram.
- Build TypeScript: passou.

## Evidencia de seguranca depois da correcao

Requisicao sem `session_token`:

```bash
curl -X POST http://localhost:3001/api/security/reset-pin-init \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "SESSION_ID",
    "user_id": "USER_ID"
  }'
```

Resposta esperada:

```json
{
  "success": false,
  "message": "Valid session_token or internal authorization is required to initiate PIN reset."
}
```

Requisicao com `session_token` valido:

```bash
curl -X POST http://localhost:3001/api/security/reset-pin-init \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "SESSION_ID",
    "session_token": "SESSION_TOKEN_DA_SESSAO",
    "user_id": "USER_ID"
  }'
```

Resposta esperada:

```json
{
  "success": true,
  "message": "Reset link generated. Valid for 15 minutes.",
  "reset_url": "http://localhost:3000/change-pin?token=...",
  "expires_in_minutes": 15
}
```

O campo `token` nao deve aparecer.

## Outros achados e possibilidades mapeadas

Durante o deep dive, tambem foram mapeados pontos que merecem hardening adicional:

| Risco | Severidade | Status | Observacao |
| --- | --- | --- | --- |
| Reset de PIN sem prova de posse | Critica | Corrigido | Principal achado deste desafio |
| Token de reset persistido em claro | Alta | Corrigido | Coluna legada agora recebe hash |
| Reset aplicado por `user_id` amplo | Alta | Corrigido | Agora aplica por `session_id` do token |
| CORS global aberto com `app.use(cors())` | Alta | Pendente | Recomendo restringir por `CORS_ORIGINS` em producao |
| `GET /api/agent/session/:session_id` e `/messages/:session_id` sem `session_token` | Alta | Pendente | Pode expor email, public key e historico se `session_id` vazar |
| Fallbacks de `JWT_SECRET` com valor dev | Alta | Pendente | Em producao, app deveria falhar se `JWT_SECRET` nao estiver configurado |
| Falta de rate limit em reset/passkey/login | Media/Alta | Pendente | Recomendo rate limit por IP + session + user |
| Enumeracao em endpoints de conta externa | Media | Pendente | Respostas podem indicar se conta/canal existe |

## Recomendacoes de proximo hardening

1. Exigir `session_token` tambem em:
   - `GET /api/agent/session/:session_id`
   - `GET /api/agent/messages/:session_id`
   - `GET /api/agent/balance/:session_id`

2. Trocar `app.use(cors())` por allowlist:
   - usar `CORS_ORIGINS`;
   - negar origins desconhecidas em producao;
   - manter localhost apenas em desenvolvimento.

3. Remover fallbacks inseguros de segredo:
   - `JWT_SECRET || "dev-secret-change-me"`;
   - `PIN_SALT || "salt"`;
   - falhar em producao quando segredo obrigatorio estiver ausente.

4. Adicionar rate limiting:
   - reset de PIN;
   - passkey auth;
   - login;
   - validacao/finalizacao de token.

5. Separar fluxo de reset por canal:
   - reset por chat autenticado pode devolver link;
   - reset publico deveria enviar email/canal verificado e nunca devolver URL/token no response.

## Texto curto para colar no formulario

Identificamos uma vulnerabilidade critica no fluxo de redefinicao de PIN. O endpoint publico `POST /api/security/reset-pin-init` aceitava apenas `user_id` e `session_id`, gerava um token de reset e devolvia esse token no JSON. Como o PIN e usado para autorizar pagamentos, um atacante com um `session_id` poderia trocar o PIN da vitima sem email, passkey ou PIN antigo.

Corrigimos exigindo prova de posse da sessao (`session_token`) ou autorizacao interna (`INTERNAL_API_SECRET`) antes de gerar o reset. Tambem validamos expiracao da sessao e correspondencia do `user_id`, removemos o campo bruto `token` da resposta, deixamos de persistir token em claro e limitamos a troca de PIN ao `session_id` associado ao token. Adicionamos testes automatizados garantindo que o reset sem autorizacao retorna 401, que uma sessao valida funciona e que o token bruto nao e exposto. O build TypeScript tambem passou.
