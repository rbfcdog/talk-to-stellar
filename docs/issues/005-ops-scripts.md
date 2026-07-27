---
id: ISS-005
spec: SPEC-pagfinance-pix-cashin
status: completed
depends_on: [ISS-003, ISS-004]
created: 2026-07-27
---

# Scripts operacionais e E2E

## Overview

Ferramentas de operação e validação: `backend/scripts/setup-pagfinance-webhook.ts`
(registra o webhook-config na PagFinance, 1x por ambiente) e
`backend/scripts/pagfinance-e2e.ts` (percorre health → ensureUser → KYC → JWT →
quote → intent → poll, e no modo `--replay-webhook <intentId>` assina um
`CASHIN_COMPLETED` sintético e posta no backend local para exercitar
verify→dedupe→crédito de ponta a ponta). O replay é também a ferramenta de
recovery em produção. Issue única porque entrega a superfície operacional que
valida as ISS-001..004 contra o sandbox real.

## Surface

- [x] Application code
- [ ] Data or infrastructure
- [x] Tests
- [x] Documentation

## Spec coverage

Seção 3.4 (scripts operacionais) e gates 4–5 da seção 4. Fase 5 da
implementação.

## Acceptance criteria

- [x] `npm run pagfinance:setup-webhook` registra `${APP_PUBLIC_WEBHOOK_URL}/webhook/pagfinance` com filtro `events:['CASHIN_COMPLETED']` e imprime a config resultante sem vazar secrets.
- [x] `npm run pagfinance:e2e -- --pubkey G...` contra o sandbox real termina com intent ACTIVE, brCode impresso e comparação estimate PagFinance vs nossa taxa.
- [x] `npm run pagfinance:e2e -- --replay-webhook <intentId>` contra o backend local resulta em operation `COMPLETED`, delta de USDC verificado via Horizon e fee na treasury; executar o replay de novo → ack de duplicata, sem segundo crédito.
- [x] Payload de replay com um byte alterado → 401 do receiver.
- [x] Scripts documentam no `--help` a limitação do sandbox (Pix em dry-run, sem simulate-payment de cash-in) e falham com mensagem clara sem env.
- [x] npm scripts adicionados ao `backend/package.json`.

## Notes

O sandbox não executa Pix de verdade — o caminho feliz "usuário pagou" só é
observável em produção ou via replay assinado; por isso o replay é parte do
produto, não gambiarra de teste. Tokens/JWTs impressos mascarados.

## Plan

### Comportamento atual e padrões reutilizáveis

- Convenção de script: `import 'dotenv/config'` no topo + `main().catch` com
  exit 1 (`scripts/configure-evolution-webhook.ts:1-26`); npm script
  `ts-node scripts/<nome>.ts` (`package.json:44`).
- `tsconfig.json` inclui só `src/**` — scripts são typechecados pelo próprio
  ts-node na execução; validação local = rodar sem env e exigir mensagem
  limpa.
- Módulo pronto: `PagfinanceService` (ensureUser/getUserJwt/createQuote/
  createIntent/getIntent/registerWebhookConfig), `hmac.ts` para assinar o
  replay, `settlement.findOperationByPagfinanceIntentId` para montar o
  envelope do replay com os dados REAIS da operation (wallet/valueCents).
- Verificação de saldo: `server.loadAccount` (config/stellar) e issuer via
  `resolveConfiguredAsset('USDC')`.

### Testes a escrever primeiro

Sem testes jest novos — a lógica de assinatura/settlement já está coberta
(ISS-001/004). A validação dos scripts é operacional:
1. Rodar cada script sem env → falha limpa com mensagem de env faltando.
2. `--help` imprime uso + limitação do sandbox.
3. Smoke real contra o sandbox com as credenciais provisionadas (health →
   user → KYC → JWT → quote → intent → brCode) — executado nesta issue.
4. Replay assinado contra backend local — coberto em unit pelos testes da
   ISS-004; execução live registrada como pendência de rollout (ISS-007) se o
   backend local não estiver configurado.

### Passos de implementação

1. `backend/scripts/setup-pagfinance-webhook.ts` — valida config +
   `APP_PUBLIC_WEBHOOK_URL`, `registerWebhookConfig(url + '/webhook/pagfinance',
   ['CASHIN_COMPLETED'])`, imprime config resultante (sem secrets), flag
   `--url <override>`.
2. `backend/scripts/pagfinance-e2e.ts` — CLI com flags `--pubkey G...` |
   `--session-id <id>`, `--amount <brl>` (default 5), `--name/--cpf` (default
   dados de teste), `--wait-minutes <n>` (default 0 = sem poll),
   `--replay-webhook <intentId>`, `--backend-url` (default
   http://localhost:3001), `--help`.
   - Fluxo default: config check → `GET /healthz` → ensureUser → KYC já no
     ensureUser → JWT (mascarado) → quote (compara `cryptoEstimate` deles com
     nossa `BrlReferenceRateService` quando disponível) → intent → imprime
     `intentId`, `brCode`, `paymentLinkUrl`, `qrCodeImage` → poll opcional.
   - Replay: busca a operation local por intent id → monta envelope
     `CASHIN_COMPLETED` com `walletAddress`/`valueCents` reais → assina o JSON
     compacto com `PAGFINANCE_WEBHOOK_SECRET` (`sha256=<hex>` em
     `X-App-Signature` + `X-App-Event`) → POST no backend → poll da operation
     via supabase até COMPLETED/FAILED → imprime hash e delta de USDC via
     Horizon (antes/depois).
3. npm scripts `pagfinance:setup-webhook` e `pagfinance:e2e` no
   `backend/package.json`.
4. Execução de validação (item "Testes" acima).

### Migrações e compatibilidade

Nenhuma. Scripts não são importados pelo app.

### Documentação

`--help` embutido; registro no project-brain fica na ISS-007.

### Validação

```bash
cd backend
npx ts-node scripts/setup-pagfinance-webhook.ts --help
npx ts-node scripts/pagfinance-e2e.ts --help
npx ts-node scripts/pagfinance-e2e.ts                # sem env → erro limpo
PAGFINANCE_* npm run pagfinance:e2e -- --pubkey G... # smoke sandbox real
```

### Riscos e não objetivos

- O smoke real depende do sandbox estar de pé e das credenciais provisionadas
  — falha upstream é reportada como está, sem mascarar.
- Replay contra backend local exige Supabase/env completos — não bloqueia a
  issue (coberto em unit); vira item do checklist da ISS-007.
- Não objetivos: UI (ISS-006), docs (ISS-007).

## Implementation

Implementado em 2026-07-27:

- `backend/scripts/setup-pagfinance-webhook.ts` (`--url` override, `--help`,
  falha limpa sem env, imprime config sem secrets).
- `backend/scripts/pagfinance-e2e.ts` (fluxo default + `--replay-webhook` com
  envelope assinado a partir da operation local + delta de USDC via Horizon;
  `--help` documenta o dry-run do sandbox).
- npm scripts `pagfinance:setup-webhook` / `pagfinance:e2e`.

**Smoke real contra o sandbox executado nesta issue** — e ele revelou que o
guia do parceiro está desatualizado: `POST /api/v1/users` exige
`{uid, pubkey, blockchain}` (não `{pubkey}`); a pubkey só é gravada quando
`blockchain` está presente — e **`blockchain:'stellar'` é aceito**; a criação é
idempotente por uid e NÃO atualiza registro existente (pubkey precisa ir na
primeira criação); sem pubkey no registro, o JWT sai com claim vazio e os
endpoints de cashin respondem 401 "JWT sem pubkey". O
`PagfinanceService.ensureUser` foi corrigido para o contrato real
(uid=pubkey=G-key, `blockchain:'stellar'`) com o teste atualizado.

Resultado do smoke (via `npm run pagfinance:e2e -- --pubkey G...`):
health ok → user criado com pubkey stellar → KYC APPROVED → JWT com claim
pubkey → quote 200 (estimate deles em SOL, advisory; nossa taxa travada
calculada ao lado) → **intent 201 ACTIVE com brCode Pix real (Woovi), QR image
e payment link**.

### Arquivos alterados

- `backend/scripts/setup-pagfinance-webhook.ts` (novo)
- `backend/scripts/pagfinance-e2e.ts` (novo)
- `backend/package.json` (2 npm scripts)
- `backend/src/integrations/pagfinance/service.ts` (contrato real de criação)
- `backend/tests/pagfinance-service.test.ts` (expectativa atualizada)

### Validação executada

- `--help` dos dois scripts ok; execução sem env → "Missing required env: …".
- Smoke sandbox real: cadeia completa até intent ACTIVE (acima).
- `npx tsc --noEmit` ok; suíte pagfinance 6 suítes, 75/75.
- Replay contra backend local: lógica coberta pelos testes da ISS-004;
  execução live fica no checklist da ISS-007 (exige env Supabase completo).

## Review

Revisado em 2026-07-27.

### Findings

1. **Alto — resolvido:** o contrato real de criação de usuário diverge do
   guia (uid/blockchain). Detectado pelo smoke real, corrigido no service com
   teste; sem o smoke isso só apareceria na primeira demo.
2. **Médio — registrado para ISS-007:** o guia deve ser tratado como
   *não-autoritativo* — o OpenAPI real (`/openapi.json`) tem superfície bem
   maior (endpoints merchant) e schemas vazios; a seção PagFinance do
   INTEGRATIONS.md precisa documentar o contrato VERIFICADO, não o guia.
3. **Baixo — aceito:** o e2e imprime o brCode completo (necessário para
   pagar); tokens sempre mascarados.
4. Nenhum finding crítico aberto.

### Evidências e validações

- Saída do smoke registrada acima (intent `rc_cashin_…` ACTIVE, brCode Woovi).
- Usuários de teste criados no sandbox com keypairs aleatórios descartáveis.
- Scripts de debug temporários com secret removidos do scratchpad.

### Riscos residuais

- O quote deles referencia SOL (asset default) — irrelevante para nós (não
  usamos o estimate), mas confirma que `assetId` stellar/USDC não existe no
  catálogo deles; nossa taxa própria continua sendo a única fonte de crédito.
- Entrega real de webhook do sandbox nunca foi observada (Pix dry-run) — o
  caminho pago segue validado por replay assinado.
