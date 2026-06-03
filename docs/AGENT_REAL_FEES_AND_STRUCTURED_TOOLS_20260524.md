# Agent real fees, real FX and structured tools

Data: 2026-05-24

## O que mudou

O agente deixou de montar mensagens de economia com cambio fixo no codigo. Agora as respostas de custo, simulacao e recibo usam tools estruturadas:

- `get_conversion_preview`: calcula BRL -> USDC com cotacao real do backend, taxa TalkToStellar ativa, taxa de rede Stellar e comparacao com banco tradicional.
- `show_savings_calculator`: usa `get_conversion_preview` internamente e monta a mensagem WhatsApp com cambio atual, valor liquido, taxa real e economia.
- `send_receipt_with_savings`: tenta buscar `payment_logs` pelo hash/sessao para usar destinatario real, timestamp real, taxa real, breakdown e hash real.
- `show_annual_savings_summary`: usa `payment_logs` e, se necessario, `getOperationHistory`; nao inventa numero de transferencias.
- `get_balance`: inclui economia acumulada do mes quando houver historico real.

## Sem mock

As fontes usadas agora sao:

- `BrlReferenceRateService.quoteBrlToUsdc`
- `currency_rate_history`
- `payment_logs`
- `PlatformFeeService`
- `formatNetworkFeeForCustomer`
- `PaymentReceiptService`
- `TransferNotificationService`
- `stellar.expert` para link do hash real

Se uma fonte real nao existir, o tool retorna erro publico ou omite a linha. Ele nao inventa taxa, transferencia ou historico.

## Migration obrigatoria

Aplicar:

```text
backend/migrations/20260523_01_payment_logs_operation_fingerprint_unique.sql
```

Motivo: `payment_logs` usa `upsert(..., onConflict: 'operation_fingerprint')`. Sem unique index, o pagamento pode concluir on-chain mas falhar ao persistir taxa/hash, quebrando recibos e economia real.

## Env relevante

Para cobrar/salvar taxa TalkToStellar de verdade:

```text
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=G...
TALKTOSTELLAR_SPREAD_BPS=30
```

Conversao atual:

```text
BRL_USDC_REFERENCE_SAMPLE_USDC=100
USD_BRL_SANITY_MIN=3
USD_BRL_SANITY_MAX=10
```

As taxas de cambio vêm dos valores da rota/transacao. Se a rota nao existir, a operacao fica indisponivel.

Para alerta proativo de cambio favoravel:

```text
ENABLE_FX_RATE_ALERTS=true
FX_RATE_ALERT_THRESHOLD_PCT=2
FX_RATE_ALERT_INTERVAL_MS=3600000
```

O alerta fica desligado por padrao para evitar disparos inesperados em producao.

## Como validar

```bash
cd backend
npm run build
npm run eval:agent
```
