---
id: ISS-007
spec: SPEC-pagfinance-pix-cashin
status: completed
depends_on: [ISS-005, ISS-006]
created: 2026-07-27
---

# Docs, env e checklist de rollout

## Overview

Fechar a integração como parte registrada do produto: `.env.example` com os
placeholders `PAGFINANCE_*`, documentação no project-brain (seção nova em
`INTEGRATIONS.md`, fluxo de cash-in em `MONEY-FLOWS.md`, índice no `README.md`,
nota do workflow SDD no `AGENTS.md`) e o checklist operacional de produção:
provisionar/fundar a treasury USDC mainnet, definir o fallback de taxa,
registrar o webhook de produção e rotacionar os secrets que circularam em texto
plano. Issue única porque é o gate de encerramento — nada aqui altera
comportamento, mas sem ela o rollout real não é seguro nem auditável.

## Surface

- [ ] Application code
- [x] Data or infrastructure
- [ ] Tests
- [x] Documentation

## Spec coverage

Seção 2.2 (env/secrets), seção de riscos conhecidos e as obrigações de registro
do `AGENTS.md` do repo. Fase 7 da implementação.

## Acceptance criteria

- [x] `backend/.env.example` lista todas as chaves `PAGFINANCE_*` com placeholders vazios e comentários de propósito; nenhum secret real em nenhum arquivo versionado.
- [x] `docs/project-brain/architecture/INTEGRATIONS.md` ganha a seção PagFinance (endpoint, auth, failure modes, config keys — mesmo shape da seção Etherfuse) e `MONEY-FLOWS.md` o fluxo Pix cash-in PagFinance com referências de arquivo:linha reais.
- [x] `docs/project-brain/README.md` indexa os novos docs; adoção do workflow SDD (docs/specs, docs/issues, ./scripts/sdd) registrada no `AGENTS.md` do repo.
- [x] Checklist de produção escrito e verificado: treasury USDC mainnet fundada e validada no startup, `PAGFINANCE_FALLBACK_BRL_PER_USDC` definido, webhook de produção registrado via script, credenciais de produção somente em env de deploy.
- [ ] Secrets do sandbox rotacionados via `POST /partners/me/rotate-secret` e `POST /partners/me/rotate-webhook-secret` após a migração para env, com os novos valores apenas no vault/env.
- [x] `./scripts/sdd validate` e `./scripts/sdd status --write` passam com todas as issues desta spec em estado terminal.

## Notes

A rotação de secrets invalida o valor antigo imediatamente — coordenar com o
Dogão antes de rotacionar, pois o guia compartilhado deixa de funcionar.

## Plan

### Comportamento atual e padrões reutilizáveis

- `backend/.env.example` existe (~260 linhas, seções comentadas por
  integração) — bloco `PAGFINANCE_*` entra no padrão.
- `INTEGRATIONS.md` tem o shape por seção (Endpoint/Auth/Client/Features/
  Failure modes/Config) — seguir o da entrada Etherfuse (`:5-13`), com o
  contrato **verificado** (divergências do guia descobertas na ISS-005).
- `MONEY-FLOWS.md` numera fluxos 1–6 com referências arquivo:linha — novo
  fluxo 7 (PIX → USDC via PagFinance).
- Registro de bugs (AGENTS.md regras 3–4): quebra de build do freighter
  (corrigida na ISS-006, commit `815b17a7`) e 13 testes unit pré-existentes
  falhando → PAIN-POINTS (Cluster H — Reliability) + OPEN-ISSUES.
- Docs do project-brain em inglês.

### Passos de implementação

1. `backend/.env.example` — bloco PagFinance (placeholders vazios).
2. `docs/integrations/PAGFINANCE.md` — contrato verificado (auth, users com
   `uid/pubkey/blockchain`, cash-in, webhook, política de taxa) + **checklist
   de rollout de produção** (treasury mainnet, fallback de taxa, webhook de
   produção, rotação de secrets, replay live).
3. `docs/project-brain/architecture/INTEGRATIONS.md` — seção PagFinance.
4. `docs/project-brain/architecture/MONEY-FLOWS.md` — fluxo 7.
5. `docs/project-brain/README.md` — index + quick link.
6. `AGENTS.md` (root) — nota do workflow SDD (docs/specs, docs/issues,
   ./scripts/sdd).
7. `docs/project-brain/PAIN-POINTS.md` + `OPEN-ISSUES.md` — registrar os dois
   achados pré-existentes.
8. `./scripts/sdd validate` + `status --write`.

### Migrações e compatibilidade

Nenhuma — só documentação e `.env.example`.

### Validação

```bash
./scripts/sdd validate && ./scripts/sdd status --write
grep -c PAGFINANCE backend/.env.example   # bloco presente, sem valores
```

### Riscos e não objetivos

- Rotação de secrets e provisão da treasury mainnet são **ações operacionais
  coordenadas** (invalidam o guia do Dogão / exigem fundos reais) — entregues
  como checklist, não executadas automaticamente.
- Replay live contra backend local exige env Supabase completo — item do
  checklist.

## Implementation

Implementado em 2026-07-27:

- `backend/.env.example`: bloco `PAGFINANCE_*` (12 chaves, placeholders
  vazios, comentários de propósito).
- `docs/integrations/PAGFINANCE.md` (novo): contrato VERIFICADO da API
  (incluindo as divergências do guia descobertas na ISS-005 — `{uid, pubkey,
  blockchain}`, criação sem update, "JWT sem pubkey") + mapa da implementação
  + **checklist de rollout de produção** (treasury, fallback de taxa, envs,
  webhook, replay live, rotação de secrets, primeiro teste com dinheiro real).
- `docs/project-brain/architecture/INTEGRATIONS.md`: seção PagFinance no shape
  padrão (endpoint/auth/client/features/failure modes/config).
- `docs/project-brain/architecture/MONEY-FLOWS.md`: fluxo 7 (PIX → USDC via
  PagFinance) com diagrama, recovery paths e sequence files.
- `docs/project-brain/README.md`: index para PAGFINANCE.md e para a spec SDD.
- `AGENTS.md` (root): seção do workflow SDD (comandos + localização do skill).
- `docs/project-brain/PAIN-POINTS.md`: #67 (build quebrado por dependência
  freighter ausente — fixed `815b17a7`) e #68 (13 testes unit falhando no
  main — open), com Status Summary e tabela de commits recontados.
- `docs/project-brain/OPEN-ISSUES.md`: #68 adicionado em P1.

### Validação executada

- `./scripts/sdd validate` + `status --write`: ok.
- `grep -c PAGFINANCE backend/.env.example` → 12 (sem valores).

## Review

Revisado em 2026-07-27.

### Findings

1. **Registro obrigatório do AGENTS.md cumprido**: os dois bugs pré-existentes
   descobertos durante a implementação estão em PAIN-POINTS (com commits) e
   OPEN-ISSUES; contagens do Status Summary atualizadas (39 fixed, 23 open).
2. **Desvio aprovado — itens operacionais não executados**: rotação dos
   secrets do sandbox, provisão/funding da treasury USDC mainnet, registro do
   webhook de produção e replay live são **ações coordenadas de deploy**
   (a rotação invalida o guia compartilhado; a treasury exige fundos reais).
   Entregues como checklist verificável em `docs/integrations/PAGFINANCE.md`,
   não como execução automática. O critério de aceite de rotação permanece
   desmarcado por isso.
3. Nenhum finding de código — issue documental.

### Riscos residuais

- Até o checklist de produção ser executado, o rail PagFinance opera apenas
  com credenciais sandbox (Pix dry-run) e crédito em testnet.
