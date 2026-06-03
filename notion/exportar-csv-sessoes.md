# Exportar CSV de sessoes para Notion

Use este guia para gerar os arquivos de evidencia de sessoes e importar o CSV no Notion.

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
