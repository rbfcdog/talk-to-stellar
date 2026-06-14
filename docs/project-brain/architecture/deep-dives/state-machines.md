# State Machines — Deep Dive

## Existing State Machines in the Codebase

### 1. International Transfer (original)
**File**: `backend/src/api/services/international-transfer-state.service.ts`
**States**: 11 (QUOTE_CREATED → PIX_PENDING → ... → PAYOUT_COMPLETED)
**Transition map**: `ALLOWED_TRANSITIONS` record
**Validation**: `assertTransition()` throws `InternationalTransferError`
**Gap**: No automated progression — manual API calls only

### 2. Orchestration Engine (D1 — new)
**File**: `backend/src/orchestration/stateMachine.ts`
**States**: 13 (CREATED → QUOTED → ... → RECONCILED)
**Transition map**: `ALLOWED_TRANSITIONS` record
**Validation**: `assertTransition()` throws `IllegalTransitionError`
**Automation**: `TransferOrchestrator` methods auto-advance + `StellarSettlementWatcher` polls

### 3. Bridge PIX/ACH (alternate)
**File**: `backend/src/api/services/bridge-pix-ach.service.ts`
**States**: 5 (awaiting_pix → pix_received → converting_ach → completed / failed / expired)
**Validation**: Inline checks in service methods

### 4. Screen Flow State (KNOWN GAP)
**No formal state machine**. Frontend navigation is not backed by a server-authoritative flow state. This causes:
- Back-navigation breaking flows (#17)
- Link expiry false positives (#16)
- Auto-advance without confirmation (#18)
- Windows not closing (#4)

**Recommended**: Implement a server-side flow state machine for every transactional screen. Client reads state, doesn't write it.

## Pattern to Follow

All state machines follow this pattern:
```typescript
const ALLOWED_TRANSITIONS: Record<State, State[]> = { ... };

class StateMachine {
  static canTransition(from: State, to: State): boolean { ... }
  static assertTransition(from: State, to: State): void { ... }
  static nextAllowed(from: State): State[] { ... }
  static isTerminal(state: State): boolean { ... }
}
```

Transition maps are explicit and exhaustive — every state appears as a key.
