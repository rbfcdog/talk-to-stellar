# COPY-GUIDE.md — Message Templates & Banned Patterns

> **Living document.** Updated when founder bans a new word or requires a new message pattern.

## Banned Words/Patterns

| Banned | Reason | Replace With |
|--------|--------|-------------|
| "Summary:" / "Resumo:" | Founder explicitly banned (#2) | "Escolhemos a melhor rota:" or nothing |
| "Avançado" | Stray word, not essential (#21) | Delete |
| Receipt at flow end | User only needs "Concluído" (#22) | "✅ Pagamento concluído" + optional "Ver comprovante" |
| "Limpar o PIN" | Too much text on PIN screen (#31) | Delete — backspace key is enough |
| "Confirmação do PIX" on PIN | Redundant (#31) | Just show masked PIN dots + keypad |

## Required Patterns

| Pattern | Requirement |
|---------|------------|
| PIX received notification | Must include: amount, sender identity (#7). If sender unknown: "Recebido via PIX de [chave mascarada]" |
| "Receber em:" label | Above currency selection (#35). "Receber em: [USD] [BRL] [CETES] [XLM]" |
| Continue button before PIN | Never jump from details to PIN. Must have explicit "Continuar" (#18, #35) |
| "Escolhemos a melhor rota" | Instead of "Summary" (#2) |
| Language toggle mention | At end of onboarding: "You can change the language in settings" / "Você pode mudar o idioma nas configurações" (#41) |

## Message Templates (PT)

### On-Ramp Completion
```
✅ Pagamento recebido!
R$ {amount} via PIX
Seu saldo será atualizado em instantes.
```

### Conversion Confirmation
```
✅ Conversão realizada
{from_amount} {from_asset} → {to_amount} {to_asset}
Taxa: R$ {fee}
```

### Send Confirmation (Sender)
```
✅ Enviado!
{amount} {asset} para {recipient_name}
```

### Received Notification
```
💰 Você recebeu!
{amount} {asset} de {sender_name}
```

### Insufficient Balance
```
Saldo insuficiente.
Você tem {balance} {asset}.
Para enviar {amount}, você pode:
• Converter outro ativo
• Adicionar saldo via PIX
```

### PIN Screen
```
Digite seu PIN de 6 dígitos
[● ● ● ● ● ●]
[1][2][3]
[4][5][6]
[7][8][9]
[⌫][0][✕]
```
