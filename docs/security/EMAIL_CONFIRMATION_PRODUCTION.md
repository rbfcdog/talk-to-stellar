# Email Verification For Production

TalkToStellar can require a one-time e-mail code before account creation or login links are finalized. The code is stored only as an HMAC hash in `public.email_confirmations`, expires by default after 10 minutes, and is marked as used after confirmation.

## Required Backend Variables

Use one delivery provider in production:

```bash
EMAIL_CONFIRMATION_ENABLED=true
EMAIL_FROM="TalkToStellar <no-reply@talktostellar.com>"
EMAIL_CONFIRMATION_SECRET="strong-random-secret-at-least-32-chars"
EMAIL_CONFIRMATION_TTL_SECONDS=600
EMAIL_CONFIRMATION_MAX_ATTEMPTS=5
EMAIL_CONFIRMATION_COOLDOWN_SECONDS=45
```

### AWS SES

For the `talktostellar.com` domain in `sa-east-1`:

```bash
EMAIL_CONFIRMATION_PROVIDER=ses
AWS_SES_REGION=sa-east-1
AWS_SES_ACCESS_KEY_ID="..."
AWS_SES_SECRET_ACCESS_KEY="..."
```

Before enabling this in production, verify `talktostellar.com` in AWS SES in the same region, publish the DKIM records, and move SES out of sandbox or verify every recipient used in testing.

### Resend

```bash
EMAIL_CONFIRMATION_PROVIDER=resend
RESEND_API_KEY="..."
```

### SendGrid

```bash
EMAIL_CONFIRMATION_PROVIDER=sendgrid
SENDGRID_API_KEY="..."
```

### Webhook

```bash
EMAIL_CONFIRMATION_PROVIDER=webhook
EMAIL_CONFIRMATION_WEBHOOK_URL="https://..."
EMAIL_CONFIRMATION_WEBHOOK_SECRET="..."
```

The webhook receives `{ from, to, subject, text, html }` as JSON.

## Frontend Variable

The frontend now shows the e-mail code step whenever the backend requests it. To explicitly disable that UI in a temporary environment:

```bash
NEXT_PUBLIC_ENABLE_EMAIL_CONFIRMATION=false
```

Do not set that variable to `false` in production when `EMAIL_CONFIRMATION_ENABLED=true`.

## Database Requirement

Run required backend migrations so `public.email_confirmations` exists and is accessible with `SUPABASE_SERVICE_ROLE_KEY`. The table only grants access to the `service_role`, so production backends must not use the anon key for this flow.

## Operational Notes

- Codes are six digits and generated with `crypto.randomInt`.
- Codes are hashed with `EMAIL_CONFIRMATION_SECRET`; rotate carefully because pending codes become invalid.
- A new code request invalidates previous pending codes for the same e-mail and purpose.
- `EMAIL_CONFIRMATION_ALLOW_DEV_CODE=true` returns the code in API responses and logs; keep it off in hosted environments.
