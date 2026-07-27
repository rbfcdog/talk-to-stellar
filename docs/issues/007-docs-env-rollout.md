---
id: ISS-007
spec: SPEC-pagfinance-pix-cashin
status: pending
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

- [ ] `backend/.env.example` lista todas as chaves `PAGFINANCE_*` com placeholders vazios e comentários de propósito; nenhum secret real em nenhum arquivo versionado.
- [ ] `docs/project-brain/architecture/INTEGRATIONS.md` ganha a seção PagFinance (endpoint, auth, failure modes, config keys — mesmo shape da seção Etherfuse) e `MONEY-FLOWS.md` o fluxo Pix cash-in PagFinance com referências de arquivo:linha reais.
- [ ] `docs/project-brain/README.md` indexa os novos docs; adoção do workflow SDD (docs/specs, docs/issues, ./scripts/sdd) registrada no `AGENTS.md` do repo.
- [ ] Checklist de produção escrito e verificado: treasury USDC mainnet fundada e validada no startup, `PAGFINANCE_FALLBACK_BRL_PER_USDC` definido, webhook de produção registrado via script, credenciais de produção somente em env de deploy.
- [ ] Secrets do sandbox rotacionados via `POST /partners/me/rotate-secret` e `POST /partners/me/rotate-webhook-secret` após a migração para env, com os novos valores apenas no vault/env.
- [ ] `./scripts/sdd validate` e `./scripts/sdd status --write` passam com todas as issues desta spec em estado terminal.

## Notes

A rotação de secrets invalida o valor antigo imediatamente — coordenar com o
Dogão antes de rotacionar, pois o guia compartilhado deixa de funcionar.
