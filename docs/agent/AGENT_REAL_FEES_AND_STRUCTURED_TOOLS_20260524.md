# Agent real fees, real FX and structured tools

Data: 2026-05-24

## O que mudou

The agent stopped creating savings messages with a fixed exchange rate in the code. Now the cost, simulation and receipt responses use structured tools:

- `get_conversion_preview`: calculates BRL -> USDC with real backend quote, active TalkToStellar rate, Stellar network rate and comparison with traditional bank.
- `show_savings_calculator`: uses `get_conversion_preview` internally and assembles the WhatsApp message with current exchange rate, net value, real rate and savings.
- `send_receipt_with_savings`: tries to search `payment_logs` by hash/session to use real recipient, real timestamp, real rate, breakdown and real hash.
- `show_annual_savings_summary`: use `payment_logs` and, if necessary, `getOperationHistory`; does not invent the number of transfers.
- `get_balance`: includes accumulated savings for the month when there is real history.

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

If a real source does not exist, the tool returns a public error or omits the line. He doesn't invent fees, transfers or history.

## Migration obrigatoria

Aplicar:

```text
backend/migrations/20260613_00_full_schema.sql
```

Reason: `payment_logs` uses `upsert(..., onConflict: 'operation_fingerprint')`. Without unique index, payment may complete on-chain but fail to persist rate/hash, breaking receipts and real savings.

## Env relevante

To actually charge/save TalkToStellar fees:

```text
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=G...
TALKTOSTELLAR_SPREAD_BPS=30
```

Current conversation:

```text
BRL_USDC_REFERENCE_SAMPLE_USDC=100
USD_BRL_SANITY_MIN=3
USD_BRL_SANITY_MAX=10
```

Exchange rates come from the route/transaction values. If the route does not exist, the operation is unavailable.

Para alerta proativo de cambio favoravel:

```text
ENABLE_FX_RATE_ALERTS=true
FX_RATE_ALERT_THRESHOLD_PCT=2
FX_RATE_ALERT_INTERVAL_MS=3600000
```

The alert is turned off by default to avoid unexpected triggers in production.

## Como validar

```bash
cd backend
npm run build
npm run eval:agent
```
