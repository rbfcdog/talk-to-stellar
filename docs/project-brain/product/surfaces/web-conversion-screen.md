# Web Conversion Screen — Surface Audit

> **Living document.** Updated when conversion/send UI bugs are found or fixed.

## Flow
```
User opens conversion screen (web)
  → Select source asset + amount
  → Select destination asset
  → View quote (rate + fee + estimated output)
  → Press Continue
  → Enter PIN
  → Confirm → Stellar transaction executes
```

## Known Issues (Updated June 13, 2026)

### Fixed
- **Screen doesn't close** (#4): ✅ Fixed by `6569ae0` — `PixCompletionPopup` now has `autoClose` prop
- **Visual inconsistency** (#5): ✅ Fixed by `1c5550c`, `82ba3a4` — PIX and conversion UI normalized

### Still Open
- **Quote drift** (#30): Quote still re-fetches on render — needs snapshot-on-first-load
- **Too long for mobile** (#23): Still single long scroll — needs 3-step split
- **No Continue button** (#18): Still auto-advances to PIN — needs explicit confirmation
- **Language toggle mid-screen** (#24): Toggle appears in flow — should be header-only
- **Empty balance no feedback** (#25): Disabled button without explanation
- **Back-navigation breaks flow** (#17): Browser back button resets state

## Required Changes (by priority)
1. Freeze quote on first load
2. Split into 3 steps: Input → Review → PIN
3. Add explicit Continue before PIN
4. Close window on completion (verified working but check all flows)
5. Move language toggle to header
6. Show "Saldo insuficiente: R$0.00" when balance is zero

## Key Files
- `frontend/app/convert/convert-client.tsx` (~1050 lines) — conversion screen (monolithic)
- `backend/src/api/controllers/financial.controller.ts` — conversion endpoints
- `backend/src/api/services/stellar.service.ts` — pathfinding + execution
