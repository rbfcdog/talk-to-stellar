# Documentation Summary: operations

Generated summary for `docs/operations`. Last generated: 2026-06-14.

## Markdown Files

| File | Title | Words | Summary | Language note |
|------|-------|-------|---------|---------------|
| [`ADMIN_FEE_WALLET_RUNBOOK.md`](./ADMIN_FEE_WALLET_RUNBOOK.md) | Admin Fee Wallet Runbook | 215 | TalkToStellar app fees are settled to a dedicated Stellar admin wallet when the backend has a treasury public key configured. Required in the backend runtime: | English or mostly English. |
| [`ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md`](./ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md) | VP com Ancora no Testnet - Roteiro Detalhado com Timestamps | 3899 | Este roteiro e para regravar a submissao rejeitada. Motivo da rejeicao: | Portuguese text remains in source; review for translation. |
| [`ENV_AND_MIGRATIONS_GUIDE_20260519.md`](./ENV_AND_MIGRATIONS_GUIDE_20260519.md) | Env and migrations guide - security hardening and institution settlement | 1102 | This guide is for deploying the hardening commit that moved session secrets to HttpOnly cookies, added the new PIN hash format, added backend rate limits, and prepared the Supabase RLS hardening SQL. It also covers the institution-to-institution settlement rai... | English or mostly English. |
| [`EVOLUTION_RAILWAY_DEPLOYMENT.md`](./EVOLUTION_RAILWAY_DEPLOYMENT.md) | Deploy da Evolution API no Railway | 1523 | Este guia e somente para o servico **Evolution API** no Railway. Ele assume que o backend TalkToStellar ja existe em outro servico Railway e que voce quer conectar o WhatsApp real ao webhook do backend. No final, o fluxo fica assim: | English or mostly English. |
| [`RAILWAY_FULL_STACK_DEPLOYMENT.md`](./RAILWAY_FULL_STACK_DEPLOYMENT.md) | Railway Full Stack Deployment | 1014 | Este guia cria tudo que a instancia WhatsApp precisa para funcionar no Railway: Use o mesmo projeto Railway para todos os servicos. | English or mostly English. |
| [`SESSION_ENV_AND_MIGRATIONS_20260525.md`](./SESSION_ENV_AND_MIGRATIONS_20260525.md) | Env e migrations da sessao 2026-05-25 | 759 | Este documento consolida as variaveis e migrations adicionadas ou exigidas pelas mudancas desta sessao: Telegram ingest secret, TESOURO como representacao interna de real, EURC, PIX off-ramp com chave dinamica, Defindex yield e passkey preparada para OpenZeppe... | English or mostly English. |
| [`WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md`](./WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md) | WhatsApp/Evolution callback troubleshooting | 2550 | Data: 2026-05-23 Este runbook explica como debugar o callback de WhatsApp/Evolution quando uma operacao termina e o usuario nao recebe a mensagem final no WhatsApp. | English or mostly English. |
| [`env-and-manual-tests.md`](./env-and-manual-tests.md) | Env left + manual tests | 1286 | This is the short deploy guide for the new session work: yield, PIX on/off ramp, conversion, multi-asset UX, Telegram ingest, and passkey. Do not commit real secrets. Put backend secrets only in the backend/hosting env, not in `NEXT_PUBLIC_*`. | English or mostly English. |
| [`env-geral-para-todos.md`](./env-geral-para-todos.md) | Env geral para todos os servicos | 402 | Use o gerador da raiz para criar envs consistentes para backend, frontend e Telegram. Ele gera segredos internos reais e deixa API keys externas em branco para preencher no painel de cada provider. | English or mostly English. |
| [`envs-essenciais.md`](./envs-essenciais.md) | Envs essenciais das novidades | 1279 | Versao curta para deploy. Isto nao repete envs basicos que o projeto ja usava, como `SUPABASE_*`, `OPENAI_API_KEY`, `STELLAR_*`, `JWT_SECRET` e `PIN_PEPPER`. Para gerar envs consistentes para backend, frontend e Telegram, use: | English or mostly English. |
| [`missing-new-envs-guide.md`](./missing-new-envs-guide.md) | Guia reduzido: envs novas que ainda faltam | 856 | Este guia foi gerado comparando `docs/operations/session-env-and-migrations.md` com os envs reais locais: `backend/.env` | English or mostly English. |
| [`saldo-operacional-ops.md`](./saldo-operacional-ops.md) | XLM e reserva tecnica da conta | 236 | Este documento substitui a nomenclatura antiga usada para XLM. A UX principal deve mostrar `XLM` como `XLM`, sem criar um nome paralelo para o usuario. `XLM` e o ativo usado pela conta para pequenas tarifas de rede e reserva minima. Ele nao e uma moeda nova, n... | English or mostly English. |
| [`session-env-and-migrations.md`](./session-env-and-migrations.md) | Env e migrations desta sessão | 2964 | Este documento lista as variáveis e migrações relacionadas às mudanças feitas nesta sessão: URL `/yield`, rendimento multi-asset, PIX com chave dinâmica, passkey/smart account e Telegram. Para a experiência nova funcionar de ponta a ponta, o ambiente precisa t... | Portuguese text remains in source; review for translation. |
| [`telegram-401-runbook.md`](./telegram-401-runbook.md) | Telegram 401 runbook | 785 | Se o log mostra algo assim: o Telegram rejeitou o `TELEGRAM_BOT_TOKEN` que chegou no container. | English or mostly English. |
| [`top-public-keys-by-transactions.md`](./top-public-keys-by-transactions.md) | Top public keys by transactions/conversions | 73 | Query time: 2026-05-28T17:20:55.883Z Method: counted final/success-like records from `payment_logs` and `operations`, grouped by `source_public_key`, deduplicating by transaction hash when present. | English or mostly English. |

## Notes

- This file is an English index summary for the folder. It does not replace the source documents.
- Source files that still contain Portuguese are marked in the language note column for follow-up translation.
- Generated summaries intentionally skip `DOCS-SUMMARY.md` to avoid recursive noise.
