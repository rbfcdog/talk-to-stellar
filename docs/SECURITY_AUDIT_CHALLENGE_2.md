# Desafio 2 - Auditoria de Seguranca

## Relato do achado critico e como foi corrigido

Foi identificada uma vulnerabilidade critica de impersonacao de conta no endpoint do agente `POST /api/agent/query`.

Antes da correcao, o endpoint era publico e aceitava qualquer requisicao com `source: "telegram"` ou `source: "whatsapp"`. Quando o `source` indicava um desses canais, o backend confiava no `metadata` recebido no corpo da requisicao (`from_id`, `chat_id`, etc.) para identificar o usuario e aplicava um override de identidade de canal, adotando a `session_id` da vitima. Como nao havia nenhum segredo compartilhado entre o bot e o backend, um atacante conseguia, sem autenticacao, enviar uma requisicao com o `from_id` da vitima e fazer o backend tratar a conversa como sendo dela. Isso permitia ler o contexto da sessao da vitima, enviar comandos em seu nome e influenciar acoes do agente que dependem do `session_id` adotado.

Em paralelo, existia uma segunda falha no mesmo fluxo: quando o backend encontrava uma sessao ja vinculada a um `browser_id`, ele adotava aquela sessao sem exigir que o cliente apresentasse o `session_token` correspondente. Ou seja, vazar ou adivinhar um `browser_id` era suficiente para "montar" a sessao alheia. O `browser_id` nao e um segredo forte e nao deveria, sozinho, ser tratado como prova de posse.

Impacto pratico: tomada da conta no canal do agente, leitura de historico e contexto, e capacidade de acionar fluxos sensiveis (consulta de saldo, geracao de links de pagamento, fluxos de PIN, etc.) em nome da vitima.

Correcao aplicada (commit [`5247816`](https://github.com/rbfcdog/talk-to-stellar/commit/524781603d2225c5258247fea60273c77d10a30c)):

- `POST /api/agent/query` passou a exigir o header `x-agent-ingest-secret` quando `source` e `telegram` ou `whatsapp`. O valor e comparado em tempo constante (`timingSafeEqualString`) com o segredo `AGENT_INGEST_SECRET` configurado no backend. Sem header valido, o backend responde `401 Unauthorized channel ingest` antes de qualquer logica de identidade de canal.
- O cliente do Telegram (`telegram/src/agent-client.js` e `telegram/src/index.js`) agora exige a variavel `AGENT_INGEST_SECRET` no boot e envia o header `x-agent-ingest-secret` em todo POST para o backend. Se o segredo nao estiver definido, o processo falha no startup, evitando deploy silencioso sem autenticacao.
- A adocao de sessao vinculada por `browser_id` passou a exigir que o caller apresente o `session_token` da sessao vinculada. A comparacao tambem usa tempo constante. Sem o token, o backend nao adota a sessao alheia mesmo que o `browser_id` esteja correto.
- `backend/.env.example`, `telegram/.env.example` e `docker-compose.yml` foram atualizados para documentar e propagar `AGENT_INGEST_SECRET`. O `README.md` informa que o backend recusa requisicoes de canal sem o header.
- O teste `telegram/test/agent-client.test.js` foi atualizado para refletir a obrigatoriedade do `ingestSecret`.

## Severidade

Critica.

Justificativa:

- O endpoint era publico e nao exigia nenhum segredo entre o bot e o backend.
- O `metadata.from_id` era suficiente para o backend tratar o caller como sendo a vitima.
- A exploracao nao exigia credenciais da vitima (sem email, sem passkey, sem PIN, sem session_token).
- A sessao do agente carrega contexto sensivel e e usada para acionar fluxos financeiros.
- O segundo problema (`browser_id` sem `session_token`) ampliava a superficie de impersonacao mesmo para callers que ja conhecessem identificadores publicos.

## Fluxo vulneravel antes da correcao

1. Atacante obtinha ou adivinhava um `from_id` (Telegram) ou um `provider_user_id` de WhatsApp da vitima.
2. Atacante chamava diretamente o backend:

```bash
curl -X POST http://localhost:3001/api/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "qual meu saldo?",
    "source": "telegram",
    "metadata": {
      "from_id": "FROM_ID_DA_VITIMA",
      "chat_id": "CHAT_ID_DA_VITIMA"
    }
  }'
```

3. O backend aplicava o override de identidade de canal e respondia como se a conversa fosse da vitima, expondo contexto da sessao e permitindo comandos subsequentes em nome dela.

Variante adicional usando `browser_id`:

1. Atacante descobria um `browser_id` de uma sessao ja vinculada.
2. Backend encontrava a sessao vinculada e a adotava sem verificar `session_token`.
3. Atacante prosseguia operando sobre a sessao adotada.

## Causa raiz

1. Endpoint sensivel exposto publicamente sem segredo compartilhado entre bot e backend.
2. Confianca em campos enviados pelo proprio cliente (`source`, `metadata.from_id`) como prova de identidade.
3. Adocao de sessao vinculada baseada apenas em `browser_id`, tratando um identificador nao secreto como credencial.

## Correcao tecnica aplicada

### 1. Gate de segredo compartilhado para canais externos

Em `backend/src/agent/routes.ts`, antes de aplicar o override de identidade de canal, o endpoint agora valida o header `x-agent-ingest-secret`:

```ts
const ingestSecret = String(process.env.AGENT_INGEST_SECRET || '').trim();
const presentedSecret = String(req.headers['x-agent-ingest-secret'] || '').trim();
if (!ingestSecret || !presentedSecret || !timingSafeEqualString(ingestSecret, presentedSecret)) {
  return res.status(401).json({
    success: false,
    error: 'Unauthorized channel ingest',
  });
}
```

A comparacao em tempo constante evita ataques de timing. A ausencia de configuracao no servidor (`AGENT_INGEST_SECRET` vazio) tambem resulta em rejeicao, falhando fechado.

### 2. Prova de posse na adocao de sessao vinculada por `browser_id`

No mesmo arquivo, a adocao da sessao vinculada agora exige `session_token` valido da sessao vinculada:

```ts
const linkedSessionToken = String((externalSession as any)?.session_token || '').trim();
const callerHoldsLinkedToken = Boolean(
  requestSessionToken &&
    linkedSessionToken &&
    timingSafeEqualString(linkedSessionToken, requestSessionToken)
);

if (shouldUseLinkedSession && callerHoldsLinkedToken) {
  req.body.session_id = String(existing.session_id);
}
```

Sem o `session_token`, o backend nao troca a `session_id` da requisicao pela da sessao vinculada.

### 3. Cliente do Telegram passa a exigir e propagar o segredo

Em `telegram/src/agent-client.js`:

```js
function createAgentClient({ agentUrl, ingestSecret = '', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  // ...
  if (!ingestSecret) {
    throw new Error('ingestSecret is required (set AGENT_INGEST_SECRET in the environment)');
  }
  // ...
  headers: {
    'Content-Type': 'application/json',
    'x-agent-ingest-secret': ingestSecret,
    // ...
  }
}
```

Em `telegram/src/index.js`, o boot falha se `AGENT_INGEST_SECRET` nao estiver definido:

```js
const ingestSecret = (process.env.AGENT_INGEST_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
if (!ingestSecret) {
  throw new Error('AGENT_INGEST_SECRET is required (must match the backend value)');
}
```

### 4. Configuracao propagada e documentada

- `backend/.env.example` e `telegram/.env.example` ganharam o campo `AGENT_INGEST_SECRET` com comentario explicando o motivo.
- `docker-compose.yml` propaga `AGENT_INGEST_SECRET` para o backend.
- `README.md` informa que `POST /api/agent/query` exige `x-agent-ingest-secret` quando `source` e `telegram` ou `whatsapp`.

## Testes atualizados

Arquivo:

```text
telegram/test/agent-client.test.js
```

Cobertura:

- `createAgentClient` agora rejeita a criacao do cliente sem `ingestSecret`.
- Requisicoes feitas pelo cliente incluem o header `x-agent-ingest-secret` com o valor configurado.

## Evidencia de seguranca depois da correcao

Requisicao de canal sem o header:

```bash
curl -X POST http://localhost:3001/api/agent/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "qual meu saldo?",
    "source": "telegram",
    "metadata": { "from_id": "FROM_ID_DA_VITIMA" }
  }'
```

Resposta esperada:

```json
{
  "success": false,
  "error": "Unauthorized channel ingest"
}
```

Requisicao de canal com o header correto (somente o bot legitimo conhece o valor):

```bash
curl -X POST http://localhost:3001/api/agent/query \
  -H "Content-Type: application/json" \
  -H "x-agent-ingest-secret: $AGENT_INGEST_SECRET" \
  -d '{
    "query": "qual meu saldo?",
    "source": "telegram",
    "metadata": { "from_id": "FROM_ID_LEGITIMO" }
  }'
```

Resposta: processada normalmente.

## Referencia do commit

Commit unico que aplica a correcao: [`5247816 - require ingest secret on agent channel sources`](https://github.com/rbfcdog/talk-to-stellar/commit/524781603d2225c5258247fea60273c77d10a30c).

Pull request: [rbfcdog/talk-to-stellar#1](https://github.com/rbfcdog/talk-to-stellar/pull/1).

## Texto curto para colar no formulario

Identificamos uma vulnerabilidade critica no endpoint `POST /api/agent/query`. O endpoint era publico e, quando `source` era `telegram` ou `whatsapp`, o backend confiava no `metadata.from_id` enviado pelo proprio cliente para adotar a sessao da vitima, sem nenhum segredo compartilhado entre o bot e o backend. Em paralelo, sessoes vinculadas eram adotadas com base apenas no `browser_id`, sem exigir o `session_token`.

Corrigimos exigindo o header `x-agent-ingest-secret` (validado em tempo constante contra `AGENT_INGEST_SECRET`) para qualquer requisicao com `source` de canal externo, e passamos a exigir o `session_token` da sessao vinculada antes de adotar a sessao a partir de um `browser_id`. O cliente do Telegram agora falha no boot se o segredo nao estiver configurado e envia o header em toda requisicao. Atualizamos `.env.example`, `docker-compose.yml`, `README.md` e o teste `telegram/test/agent-client.test.js`. A correcao esta no commit [`5247816`](https://github.com/rbfcdog/talk-to-stellar/commit/524781603d2225c5258247fea60273c77d10a30c).
