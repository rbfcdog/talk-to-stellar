# WhatsApp Bot — Surface Audit

> **Living document.** Updated when WhatsApp-specific bugs are found or fixed.

## Flow
```
User sends message
  ↓ Evolution API webhook
  ↓ evolution.controller.ts → queue to evolution_inbound_queue
  ↓ Inbound worker picks up → Agent API → intent routing
  ↓ Agent response → outbound queue → Evolution send
```

## Known Issues (Updated June 13, 2026)

### Fixed
- **"Summary:" banned** (#2): ✅ Fixed by `f24d6f1` — `stripUserFacingSummaryLabels()` strips "Summary:"/"Resumo:" from all messages
- **Send blocked by contacts** (#6): ✅ Fixed by `9106c6a` — resolves recipients from wallets table before contacts
- **Missing PIX origin** (#7): ✅ Fixed by `749d906` — sender identity shown on receipts and notifications
- **i18n leakage** (#10): ✅ Partially fixed by `916fcb6` — receipt/notification language respects recipient. Full audit still needed.

### Still Open
- **NLU outage loop** (#36): Needs circuit breaker — after 3 consecutive failures, escalate and stop retrying
- **Wrong asset in messages** (#19): Some progress messages may still show wrong asset code
- **Inverted conversion** (#26): Needs server-side validation of NLU intent direction

## Key Files
- `backend/src/api/controllers/evolution.controller.ts` — webhook handler
- `backend/src/api/services/notifications/evolution.service.ts` — WhatsApp delivery
- `backend/src/api/agent/` — agent routes, tools, prompts
- `backend/src/api/services/notifications/transfer-notification.service.ts` — transfer alerts
