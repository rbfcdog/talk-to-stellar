# TalkToStellar Upgrade Execution Plan (Brazil UX)

## Status

All requested TODO tracks were implemented at code level in this iteration.

## Completed Tracks

1. Contact Invite Growth Loop
- Added backend invite-link generator in `ExternalService.createContactInviteUrl`.
- Invite token uses `/create-account?token=...` and includes inviter metadata.
- On invite onboarding finalize, inviter contact is auto-created.

2. Session and Identity Model (Phone-First)
- Normalized `provider_user_id` for `whatsapp`/`phone` providers to digits-only.
- Added canonical `phone` mapping creation alongside `whatsapp` mapping.
- `check-account` now falls back from `whatsapp` to `phone` mapping for continuity.
- `external-finalize` now uses phone-based canonical user IDs for WhatsApp/phone channels.

3. Password Recovery via WhatsApp OTP
- Added endpoints:
  - `POST /api/external/recovery-init`
  - `POST /api/external/recovery-complete`
- Added migration table `recovery_otps` with expiry/attempts/used tracking.
- Added Twilio WhatsApp command flow in `twilio-webhook/whatsapp.js`:
  - `recuperar conta`
  - `codigo 123456 pin 4321`

4. Agent Conversational Quality (PT-BR)
- Updated system prompt for colloquial Brazilian Portuguese, friendly attendant persona, and transparent fee communication.

5. BRL/USDC Conversion Visibility
- `prepare_payment_confirmation` now includes destination asset and optional `payment_quote` in token.
- Chat confirmation message now includes asset-aware copy and quote details (fee/loss).
- Confirmation frontend (`confirm-payment`) now renders quote/rate/slippage cards.

6. Recipient Lookup by Phone/PIX
- Contact model expanded with `phone_number` and `pix_key`.
- `prepare_payment_confirmation` resolves recipients by name, phone, or PIX key.
- Agent contact resolution also supports phone/PIX matching.

7. Portuguese-First Frontend UX
- Translated onboarding and payment-confirmation copy to Portuguese-first wording.
- Telegram reset response translated to Portuguese.

8. Transaction History in BRL
- Added `operations.amount_brl` and `operations.amount_usdc` columns.
- Store BRL/USDC snapshot values during payment execution when available.
- History tool now merges stored operations (with BRL snapshots) with network history.

9. Docs and Integration Plan
- README updated with latest Brazil-focused upgrades.
- This execution plan added for handoff.

## Verification Performed

- Backend compile: `npm run build` (passed)
- Frontend typecheck: `npx tsc -p tsconfig.json --noEmit` (passed)
- External flow tests:
  - `tests/external-finalize.controller.test.ts` (passed)
  - `tests/external-controller.test.ts` (passed)

## Operational Notes

- Set environment variables for best results:
  - `USDC_ISSUER` (for path payments to USDC)
  - `USD_BRL_RATE` (for BRL display snapshots)
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` (for OTP sending)

- In non-production mode, OTP init may return `dev_otp` to simplify local testing.
