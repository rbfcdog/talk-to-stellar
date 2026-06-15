# Evidence 4: Payout Instruction Lifecycle

## Overview

The payout instruction lifecycle covers: **Create → Status Tracking → Webhook Reconciliation**. A `PayoutInstruction` is created by a provider adapter, tracked by the coordination service, and reconciled through status observations from polling and webhook events.

## PayoutInstruction Type

Location: `backend/src/api/services/international-transfer.types.ts:120-133`

```typescript
export type PayoutInstruction = {
  payout_instruction_id: string;
  provider_name: PayoutProviderName;
  provider_payout_id: string;
  status: PayoutStatus;
  execution_mode?: PayoutExecutionMode;
  destination: UsdBankDestination;
  amount_usd: string;
  currency: 'USD';
  created_at: string;
  updated_at?: string;
  status_history?: PayoutStatusObservation[];
  metadata?: Record<string, unknown>;
};
```

## PayoutStatusObservation Type

Location: `backend/src/api/services/international-transfer.types.ts:135-145`

```typescript
export type PayoutStatusObservation = {
  provider_name: PayoutProviderName;
  provider_payout_id: string;
  status: PayoutStatus;
  raw_status?: string;
  source: PayoutObservationSource;  // 'create' | 'poll' | 'webhook'
  observed_at: string;
  provider_event_id?: string;
  provider_reference?: string;
  evidence?: Record<string, unknown>;
};
```

## Status Lifecycle States

```
instruction_created → pending → completed
                              → failed
                              → cancelled
```

Definitions at `international-transfer.types.ts:19`:

```typescript
export type PayoutStatus =
  | 'instruction_created'
  | 'pending'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

## Normalization Rules

Location: `usd-payout-adapters.ts:203-215` and `usd-payout-coordination.service.ts:44-55`

Provider-specific raw statuses are normalized to the canonical `PayoutStatus`:

| Raw Provider Status | Normalized |
|---|---|
| `complete`, `completed`, `payment_processed`, `paid`, `success`, `succeeded`, `settled` | `completed` |
| `failed`, `failure`, `undeliverable`, `rejected`, `returned`, `error` | `failed` |
| `cancelled`, `canceled`, `voided` | `cancelled` |
| `created`, `instruction_created`, `queued` | `instruction_created` |
| Bridge `payment_processed` special case | `completed` |
| Anything else | `pending` |

## Dual State Machine Sync

The payout instruction has its own status (`PayoutStatus`). The international transfer also has its own state (`InternationalTransferState`). They are synchronized:

| Transfer State | Payout Status | Meaning |
|---|---|---|
| `PAYOUT_INSTRUCTION_CREATED` | `instruction_created` | Adapter created the instruction |
| `PAYOUT_PENDING` | `pending` | Instruction exists, awaiting provider confirmation |
| `PAYOUT_COMPLETED` | `completed` | Provider confirmed settlement |
| `FAILED` | `failed` | Provider reported failure |
| `REFUNDED` | `cancelled` | Payout was cancelled and refund flow initiated |

All 11 transfer states are at `international-transfer.types.ts:1-13`:

```typescript
export const INTERNATIONAL_TRANSFER_STATES = [
  'QUOTE_CREATED',
  'PIX_PENDING',
  'PIX_RECEIVED',
  'BRL_TO_USDC_PENDING',
  'USDC_SETTLEMENT_PENDING',
  'USDC_SETTLED',
  'PAYOUT_INSTRUCTION_CREATED',
  'PAYOUT_PENDING',
  'PAYOUT_COMPLETED',
  'FAILED',
  'REFUNDED',
] as const;
```

## Same-Name Check Logic

Location: `backend/src/api/services/identity-alignment.service.ts:18-81`

Before a payout instruction can be created, the **destination account holder name** must match the sender's identity (or institution/entity name). This is the `IdentityAlignmentService.evaluateSameName()` method.

Key logic:

- Names are normalized by stripping accents, legal suffixes (LTDA, LLC, Inc, S.A., etc.), and non-alphanumeric characters.
- If the normalized destination owner matches any of: sender legal name, institution entity name, or recipient legal name → `MATCHED`.
- If no match → `MISMATCHED` (payout blocked until manual review).
- If destination holder name is missing → `UNKNOWN`.

Output shape (`international-transfer.types.ts:289-291`):

```typescript
same_name_payout_required: boolean;
same_name_match_status: SameNameMatchStatus;  // 'MATCHED' | 'MISMATCHED' | 'UNKNOWN'
identity_risk_notes: string[];
```

When `same_name_payout_required=true` and `same_name_match_status !== 'MATCHED'`, the transfer lifecycle returns `resolve_identity_alignment` as the next action (`international-transfer-lifecycle.ts:89-104`), blocking payout creation.

The coordination evidence object tracks this at `usd-payout-coordination.service.ts:137`:

```typescript
const payoutAllowed = !transfer.same_name_payout_required ||
  transfer.same_name_match_status === 'MATCHED';
```

## PayoutCoordinationEvidence — The Full Evidence Object

Location: `backend/src/api/services/usd-payout-coordination.service.ts:128-228`

The `buildEvidence()` method assembles the complete `PayoutCoordinationEvidence` object with:

- 4-item checklist (`adapter_interface_code`, `stellar_transaction_hash`, `circle_bridge_compatibility`, `payout_coordination_record`)
- Provider capability snapshot
- Settlement details (tx hash, memo, asset, amount)
- Identity control (same-name status, risk notes)
- Instruction status
- Redacted status history with hashed provider references
- Destination metadata (account holder hash, last-4 digits, country, provider label)
- Circle and Bridge compatibility snapshots
- Redaction notes

## How to Export Payout Evidence

Via the API endpoint mentioned in the coordination service at `usd-payout-coordination.service.ts:162`:

```bash
curl -s http://localhost:3000/api/transfers/<transfer_id>/payout-evidence \
  -H 'Authorization: Bearer <token>' | jq .
```

Or through the coordination service directly:

```bash
cd backend
npx ts-node -e "
import { usdPayoutCoordinationService } from './src/api/services/usd-payout-coordination.service';
import { InternationalTransfer } from './src/api/services/international-transfer.types';
// Build evidence from a transfer record
const evidence = usdPayoutCoordinationService.buildEvidence(transferRecord);
console.log(JSON.stringify(evidence, null, 2));
"
```

## PayoutProviderEvent (Webhook Normalization)

Location: `international-transfer.types.ts:147-156` and `usd-payout-adapters.ts:235-262`

Incoming webhook payloads are normalized into a `PayoutProviderEvent`:

```typescript
export type PayoutProviderEvent = {
  provider_name: PayoutProviderName;
  provider_event_id: string;
  provider_payout_id: string;
  status: PayoutStatus;
  raw_status?: string;
  event_type?: string;
  occurred_at: string;
  evidence?: Record<string, unknown>;
};
```

The `normalizeWebhookEvent()` method on each adapter converts provider-specific event payloads into this canonical shape. The coordination service's `normalizeProviderEvent()` (`usd-payout-coordination.service.ts:114-119`) delegates to the correct adapter.

## PayoutEvidence (Orchestration Layer)

The orchestration-level payout evidence at `backend/src/orchestration/types.ts:105-116`:

```typescript
export interface PayoutEvidence {
  routing_status: string;
  provider_hint: string;
  reference_id?: string;
  same_name_check: SameNameCheck;
}

export interface SameNameCheck {
  expected: string;
  provided: string;
  passed: boolean;
}
```

This is the lightweight version stored in the orchestration event log, separate from the full `PayoutCoordinationEvidence`.
