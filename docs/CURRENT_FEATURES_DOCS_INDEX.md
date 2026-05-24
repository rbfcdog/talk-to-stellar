# Current features docs index

Data: 2026-05-23

Use este arquivo como mapa rapido dos documentos que descrevem o estado atual do TalkToStellar.

## Documento principal

### `docs/PROJECT_FEATURE_STATE_FOR_AI_REVIEW_20260523.md`

Este e o documento mais completo para mandar para outra IA, reviewer tecnico, investidor ou avaliador.

Ele cobre:

- tese atual do produto;
- frontend e rotas;
- backend e APIs;
- WhatsApp/Evolution;
- Telegram;
- PIX/Etherfuse;
- Stellar testnet/mainnet readiness;
- BRL -> USD institutional rail;
- seguranca;
- UX;
- docs/SOW;
- o que e real, sandbox, testnet, mock ou futuro.

Use quando alguem perguntar:

```text
Qual e o estado atual do projeto?
Quais features ja existem?
O que ainda falta?
O que uma IA/reviewer deveria avaliar?
```

## Posicionamento e produto

### `README.md`

Documento principal do GitHub, agora organizado com produto primeiro e tecnico depois:

- proposta de valor;
- URL do produto ao vivo;
- console Mainnet;
- materiais de apresentacao;
- tabela para 5 usuarios reais Mainnet;
- estrategia de BRL/asset;
- arquitetura e operacao.

### `docs/STRATEGIC_POSITIONING_TALKTOSTELLAR.md`

Melhor documento para explicar a tese de negocio:

```text
Pix em BRL -> Stellar/USDC -> USD -> conta internacional existente
```

Use para pitch, Instawards, SCF, parceiro ou investidor.

### `docs/PROJECT_BUSINESS_DESCRIPTION.md`

Descricao mais antiga e mais geral do produto. Ainda e util, mas menos atual que o posicionamento estrategico.

### `docs/PROJECT_TECHNICAL_DESCRIPTION.md`

Descricao tecnica geral da arquitetura.

### `docs/PITCH_DECK_7_SLIDES_INITIAL.md`

Rascunho textual do pitch deck de 7 slides:

```text
problema / solucao / como funciona / mercado / modelo de negocio / tracao / equipe
```

## Demo e avaliacao

### `docs/USER_DEMO_GUIDE.md`

Roteiro para demonstrar a experiencia do usuario:

- conta;
- saldo;
- contatos;
- PIX;
- pagamento;
- conversao;
- historico;
- comprovante.

### `docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md`

Roteiro tecnico para o video de anchor/testnet, com foco em backend, chamadas, contratos/ancoras e evidencias.

### `docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md`

Guia da interface de infraestrutura entre instituicoes.

## PIX, fees e ramps

### `docs/SISTEMA_DE_TAXAS_RESUMO.md`

Resumo curto do sistema atual de taxas.

### `docs/SISTEMA_DE_TAXAS_ATUAL.md`

Versao longa, explicando onde podem existir taxas no produto.

### `docs/FEE_RESTRUCTURE_AND_RAMP_MEASUREMENTS_20260523.md`

Plano/registro da reestruturacao de taxas e medicoes de on/off-ramp.

### `docs/ETHERFUSE_PIX_KYC_FLOW.md`

Fluxo Etherfuse/PIX/KYC.

## WhatsApp/Evolution

### `docs/WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md`

Runbook para quando o WhatsApp recebe mensagens mas nao recebe callback depois de pagamento/PIX/conversao.

### `docs/EVOLUTION_RAILWAY_DEPLOYMENT.md`

Guia de deploy da Evolution API no Railway.

## Mainnet e Stellar

### `docs/BRL_ASSET_STRATEGY_STELLAR.md`

Documento de decisao sobre como representar BRL/real no produto:

- recomendacao de BRL off-chain + USDC on-chain;
- quando usar asset BRL fixo em Testnet;
- por que evitar stablecoin BRL dinamica;
- quando um parceiro/anchor regulado faria sentido.

### `docs/STELLAR_MAINNET_INFRASTRUCTURE.md`

Infra preparada para Stellar mainnet.

### `docs/STELLAR_MAINNET_USER_WALLET_CONSOLE.md`

Console frontend para mainnet/testnet e wallet attachment.

### `docs/STELLAR_MAINNET_HARDENING_SCAN.md`

Scan de riscos e pontos de hardening para mainnet.

## BRL -> USD rail

### `docs/BRL_USD_INTERNATIONAL_ACCOUNT_DELIVERY.md`

Documento tecnico da tese Pix -> USDC/Stellar -> USD -> conta internacional.

### `docs/BRL_USD_RAIL_OPERATOR_RUNBOOK.md`

Runbook operacional da rail BRL -> USD.

### `docs/BRL_USD_STELLAR_WISE_TECHNICAL_DESIGN.md`

Design tecnico do fluxo BRL -> Stellar -> USD account.

## Seguranca

### `docs/SECURITY_AUDIT_DEEP_DIVE.md`

Auditoria ampla de seguranca.

### `docs/PASSKEY_ENROLLMENT_SECURITY_FIX.md`

Documento curto do achado/correcao de passkey enrollment.

### `docs/SECURITY_HARDENING_IMPLEMENTATION_20260519.md`

Guia do hardening implementado.

## UX e refactor

### `docs/UX_FULL_CODEBASE_SCAN_20260521.md`

Scan amplo de problemas e melhorias de UX.

### `docs/UX_FEE_REDUCTION_UPGRADE_MAP.md`

Mapa de melhoria de UX focado em mostrar economia e taxas.

### `docs/REFACTOR_PLAN_FULL_CODEBASE_SCAN_20260523.md`

Plano de refactor amplo baseado no scan da codebase.

### `docs/FOLDER_STRUCTURE_REORG_20260523.md`

Registro da reorganizacao de estrutura de pastas.

## Mocks e realismo

### `docs/MOCKED_SURFACES_FULL_REPO_SCAN_20260523.md`

Scan de superficies mockadas no repo.

### `docs/NO_MOCKS_REALISTIC_FLOW_ACTION_PLAN.md`

Plano para reduzir mocks e aproximar o produto de uma experiencia real/sandbox oficial.

## SOW

### `sow/SOW_instawards_submission_brl_usd_rail_20260520.md`

SOW principal no formato Instawards.

### `sow/SOW_current_project_state_20260519.md`

SOW adaptado ao estado atual anterior do projeto.

## Recomendacao pratica

Para mandar para outra IA avaliar o projeto, envie estes 4 primeiro:

```text
README.md
docs/PROJECT_FEATURE_STATE_FOR_AI_REVIEW_20260523.md
docs/STRATEGIC_POSITIONING_TALKTOSTELLAR.md
docs/BRL_ASSET_STRATEGY_STELLAR.md
```

Para avaliador de demo tecnica, envie:

```text
docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md
docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md
docs/WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md
```
