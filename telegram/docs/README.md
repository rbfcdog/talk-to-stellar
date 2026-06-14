# Telegram Bot

This folder contains the first Telegram bot implementation for TalkToStellar.

## What is implemented

- A polling bot entrypoint.
- Webhook mode for production deployments.
- An HTTP client that forwards user messages to the existing agent API.
- In-memory per-chat session IDs.
- A pre-flight account check against `/api/external/check-account` so new users receive an onboarding link.
- A `/health` endpoint for local checks.
- Unit tests for the agent client and message flow.

## Setup

```bash
cd telegram
npm install
cp .env.example .env
```

Set `TELEGRAM_BOT_TOKEN` and, if needed, update `TELEGRAM_AGENT_URL`.
The bot derives the backend origin from `TELEGRAM_AGENT_URL` and calls `/api/external/check-account` before forwarding a message.

If the sender does not yet have an account, the bot replies with a dynamic onboarding URL that points to the frontend `/create-account` page.

### Token check

`TelegramError: 401: Unauthorized` means Telegram rejected `TELEGRAM_BOT_TOKEN`. It is not a webhook URL or `AGENT_INGEST_SECRET` problem.

Validate the exact value configured in the deploy environment:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

Expected result is `{"ok":true,...}`. If it returns 401, copy the current token from `@BotFather` again and set it without `bot`, quotes, spaces, URL, or `@username`.

## Bot avatar

The adapter sets the Telegram bot profile on startup without sending the image in chat.

- Source brand image: `frontend/public/talktostellar.png`
- Telegram upload asset: `telegram/assets/talktostellar-avatar.jpg`
- Override with `TELEGRAM_PROFILE_PHOTO_PATH=/absolute/path/to/avatar.jpg`
- Disable startup profile setup with `TELEGRAM_PROFILE_SETUP=false`

It also sets:

- `TELEGRAM_SHORT_DESCRIPTION`
- `TELEGRAM_DESCRIPTION`

## Run

```bash
npm start
```

### Production recommendation

Use webhook mode to avoid `409 Conflict` from concurrent `getUpdates` polling:

```env
TELEGRAM_BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://your-public-domain.com
TELEGRAM_WEBHOOK_PATH=/webhook/telegram
```

In local/dev, keep `TELEGRAM_BOT_MODE=polling`.

## Test

```bash
npm test
```

## Next step ideas

- Persist session IDs if chat continuity needs to survive restarts.
- Add message parsing for payment-specific shortcuts and commands.
