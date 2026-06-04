# Execucao manual dos benchmarks complexos - 2026-06-03

Ambiente: local testnet, backend `http://localhost:3001`, frontend `http://localhost:3000`.

Escopo: execucao exploratoria dos 5 casos de `manual-tests/hard-benchmark-tests.md`. Os testes que exigem WhatsApp real, PIN real, e-mail real ou confirmacao financeira real foram marcados como bloqueados no ponto exato, sem simular feedback de usuario.

## Resumo

| Teste | Status | Evidencia |
| --- | --- | --- |
| 1. Sessao web vs WhatsApp com historico consolidado | Parcial aprovado | Cookies web e WhatsApp lidos em namespaces separados; delete do WhatsApp nao apaga web; telas `/transactions` e `/rendimentos` carregam sem `Sessao invalida`. Operacao real via WhatsApp nao executada. |
| 2. PIX para contato com ativo alvo nao-BRL | Parcial aprovado | Suite LLM roteia `quero fazer pix pra ana silva de 100 xlm` como `pix`; testes backend de PIX funded recipient passam. Confirmacao real ate comprovante nao executada por falta de sessao/PIN/canal real. |
| 3. Cotacoes sem arbitragem direta nem multi-hop | Aprovado | Tool `get_all_pair_quotes` retornou 6 pares, fonte `transaction_values`, `max_round_trip_product=1` e informou 8 rotas ajustadas. |
| 4. Saldo insuficiente -> PIX -> investir -> historico | Parcial aprovado | `/rendimentos?lang=pt-BR` carrega sem `Sair`, sem `Somente consulta` e sem mencao interna ao provedor. Fluxo financeiro real bloqueado por autenticacao/PIN. |
| 5. Recuperacao de PIN com sessao concorrente | Parcial aprovado | Suite LLM detecta `uero redefinir o pin`; testes de escopo de sessao passam. Troca real de PIN/e-mail nao executada sem conta real. |

## Comandos executados

```bash
curl -sS http://localhost:3001/health
curl -sS 'http://localhost:3000/api/session' -H 'Cookie: tts_session_id=websid; tts_session_token=webtoken; tts_session_source=web; tts_session_id_whatsapp=wasid; tts_session_token_whatsapp=watoken; tts_session_source_whatsapp=whatsapp'
curl -sS 'http://localhost:3000/api/session?source=whatsapp' -H 'Cookie: tts_session_id=websid; tts_session_token=webtoken; tts_session_source=web; tts_session_id_whatsapp=wasid; tts_session_token_whatsapp=watoken; tts_session_source_whatsapp=whatsapp'
curl -si -X DELETE 'http://localhost:3000/api/session?source=whatsapp' -H 'Cookie: tts_session_id=websid; tts_session_token=webtoken; tts_session_source=web; tts_session_id_whatsapp=wasid; tts_session_token_whatsapp=watoken; tts_session_source_whatsapp=whatsapp'
curl -sS 'http://localhost:3000/api/financial/conversion-matrix?assets=BRL,USDC,CETES,XLM&sample_amount=100'
npm --prefix backend run eval:agent -- --runInBand
npm --prefix backend test -- --runInBand tests/external-service.test.ts tests/anchor-pix-funded-recipient.test.ts tests/conversion-rate-matrix.service.test.ts tests/financial-conversion-reference.test.ts tests/user-research-log.service.test.ts
npm --prefix frontend test -- __tests__/unit/session-route-scope.test.ts __tests__/unit/chat-route-session-scope.test.ts __tests__/unit/ramp-route-session-scope.test.ts __tests__/unit/financial-route-session-scope.test.ts __tests__/unit/app-r-route.test.ts __tests__/unit/server-session-body-scope.test.ts
npx ts-node -e 'import { executeTool } from "./src/api/agent/tools"; (async()=>{ const raw=await executeTool("get_all_pair_quotes", { language: "pt-BR" }); console.log(raw); })();'
```

## Resultados observados

### Sessao web vs WhatsApp

Resultado de `/api/session` com cookies web e WhatsApp juntos:

```json
{"authenticated":true,"session_id":"websid","session_source":"web","external_priority":false}
```

Resultado de `/api/session?source=whatsapp`:

```json
{"authenticated":true,"session_id":"wasid","session_source":"whatsapp","external_priority":true}
```

Resultado de `DELETE /api/session?source=whatsapp`:

```text
set-cookie: tts_session_id_whatsapp=; Max-Age=0
set-cookie: tts_session_token_whatsapp=; Max-Age=0
set-cookie: tts_session_source_whatsapp=; Max-Age=0
```

Nao apagou `tts_session_id` nem `tts_session_token` comuns da web.

### Navegacao headless

Paginas carregadas com Playwright:

| Pagina | HTTP | Alertas |
| --- | --- | --- |
| `/transactions` | 200 | nenhum |
| `/transactions?source=whatsapp&session_scope=whatsapp` | 200 | nenhum |
| `/rendimentos?lang=pt-BR` | 200 | sem `Sair`, sem `Somente consulta`, sem `Sessao invalida` |
| `/rendimentos?source=whatsapp&session_scope=whatsapp` | 200 | sem `Sair`, sem `Somente consulta`, sem `Sessao invalida` |
| `/pix-on?from=chat&lang=pt-BR&asset=XLM&amount=100&target_amount=100` | 200 | nenhum |
| `/pix-off?from=chat&lang=pt-BR&asset=XLM&amount=100` | 200 | nenhum |
| `/convert?from=chat&lang=pt-BR` | 200 | nenhum |
| `/login?source=whatsapp&session_scope=whatsapp&lang=pt-BR` | 200 | nenhum |

### Cotacoes e arbitragem

Tool de cotações retornou:

- `displayed_pairs`: 6
- `max_round_trip_product`: 1
- `arbitrage_guarded_pairs`: 8
- `source`: `transaction_values`

Mensagem de usuario gerada:

```text
Cotações atuais (testnet):
BRL/USDC: ...
BRL/CETES: ...
BRL/XLM: ...
USDC/CETES: ...
USDC/XLM: ...
CETES/XLM: ...
Conferi arbitragem direta e multi-hop; 8 rota(s) foram ajustadas para uma cotação justa.
```

## Suites de apoio

Backend:

```text
eval:agent: 5 suites passed, 223 tests passed
targeted backend: 5 suites passed, 27 tests passed
```

Frontend:

```text
session scope targeted: 6 files passed, 16 tests passed
```

## Bloqueios reais

Nao executei os seguintes passos porque exigem credenciais/ambiente operacional real:

- confirmar PIX com PIN real;
- receber callback real da Evolution/WhatsApp;
- trocar PIN por e-mail real;
- validar historico consolidado apos uma transacao real de WhatsApp;
- aplicar rendimento real com conta autenticada.

## Bug encontrado fora do benchmark

`/transactions?lang=en` ainda renderiza muitos textos em portugues. Isso nao quebrou os cinco benchmarks, mas e um bug de i18n para corrigir antes de demo em ingles.
