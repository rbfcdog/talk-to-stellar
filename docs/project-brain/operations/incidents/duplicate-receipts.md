# Duplicate Receipts — Incident Report (FIXED)

**Pain point #33** — **STATUS: FIXED by `0da597da`**

## Symptom
> "quando fiz on ramp deu 2 comprovantes, sendo q era pra dar 1"

Translation: One on-ramp generated 2 receipts when only 1 was expected.

## Root Cause

The on-ramp flow has two state transitions that can each trigger receipt generation:
1. `PIX_RECEIVED` — PIX funding confirmed by Etherfuse webhook
2. `USDC_SETTLED` — Stellar settlement confirmed

Both events fired in sequence and both triggered receipt generation. No deduplication check existed.

## Fix Applied (Verified)

Two-layer deduplication in `backend/src/api/services/receipts/payment-receipt.service.ts`:

1. **DB-level**: `dedupe_key` unique constraint on `agent_messages` table (line 329). On unique violation, returns `false` (already exists).
2. **In-memory**: `Set<string>` (`externalDeliveryDedupe`) prevents duplicate WhatsApp/Telegram external deliveries (lines 346-356).

The dedupe key is threaded from the PIX auto-pay flow (`anchor.service.ts:8713-8738`) through to the receipt delivery path.

## Files Involved

- `backend/src/api/services/receipts/payment-receipt.service.ts:320-359, 405-507` — receipt deduplication
- `backend/src/api/services/anchor.service.ts:8713-8738` — dedupe key propagation

## Root Cause Category

**Missing idempotency on side effects.** Multiple events in a single logical operation can trigger the same side effect (receipt generation) without deduplication. **Lesson**: Side effects must be idempotent per operation ID.
