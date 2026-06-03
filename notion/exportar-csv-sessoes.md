# Exportar CSV de sessoes para Notion

Use este guia para gerar os arquivos de evidencia de sessoes e importar o CSV no Notion.

## Gerar pacote para 15+ usuarios

Este comando gera CSV, Markdown, JSON e um CSV auxiliar para capturar manualmente usuarios reais que ainda estejam faltando.

```bash
cd /home/rodrigodog/talk-to-stellar/backend
npm run research:build-15-user-log -- --since=2026-06-01 --network=testnet --min-users=15 --limit=25
```

Arquivos gerados:

```text
testnet-15plus-user-research-....csv
testnet-15plus-user-research-....md
testnet-15plus-user-research-....json
testnet-15plus-user-research-....-manual-capture.csv
testnet-15plus-user-research-....-README.md
```

Use o CSV principal no Notion. Se o script avisar que existem menos de 15 usuarios reais, use o `manual-capture.csv` durante testes reais com novas pessoas e preencha apenas informacoes observadas.

## Exportar sessoes testnet

```bash
cd /home/rodrigodog/talk-to-stellar/backend
npm run research:export-testnet -- --since=2026-06-01 --limit=25
```

## Onde os arquivos ficam

```bash
/home/rodrigodog/talk-to-stellar/backend/exports/user-research/
```

Cada export gera tres arquivos:

```text
testnet-user-research-log-....csv
testnet-user-research-log-....md
testnet-user-research-log-....json
```

## Listar arquivos gerados

```bash
ls -lh exports/user-research
```

## Pegar o CSV mais recente

```bash
ls -t exports/user-research/*.csv | head -1
```

## Exportar mainnet e testnet juntos

```bash
npm run research:export-user-log -- --network=all --since=2026-06-01 --limit=25
```

## Usar no Notion

Importe ou cole o arquivo `.csv` mais recente em uma tabela do Notion.
