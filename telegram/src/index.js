require('dotenv').config();

const { createAgentClient } = require('./agent-client');
const { createHealthServer } = require('./health-server');
const { createTelegramBot } = require('./bot');

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const agentUrl = process.env.TELEGRAM_AGENT_URL || 'http://localhost:3001/api/agent/query';
  const mode = (process.env.TELEGRAM_BOT_MODE || 'polling').toLowerCase();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'talktostellar_bot';
  const sessionPrefix = process.env.TELEGRAM_SESSION_PREFIX || 'telegram';

  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  const agentClient = createAgentClient({ agentUrl });
  const backendBaseUrl = new URL(agentUrl).origin;
  const externalCheck = async ({ provider, provider_user_id }) => {
    const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/api/external/check-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, provider_user_id }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`check-account failed: ${errorText}`);
    }

    return response.json();
  };

  const { bot } = createTelegramBot({
    botToken,
    agentClient,
    sessionPrefix,
    logger: console,
    backendBaseUrl,
    externalCheck,
  });

  const healthPort = Number(process.env.TELEGRAM_HEALTH_PORT || 3005);
  const healthServer = createHealthServer({ port: healthPort });
  await healthServer.start();

  if (mode === 'webhook') {
    throw new Error('Webhook mode is not implemented yet. Use TELEGRAM_BOT_MODE=polling.');
  }

  // Some environments experience intermittent network timeouts when Telegraf
  // calls getMe during startup. Try getMe with retries/backoff before launch
  // to avoid failing the whole process on transient ETIMEDOUT errors.
  async function tryGetMeWithRetry(bot, maxAttempts = 5) {
    let attempt = 0
    while (attempt < maxAttempts) {
      attempt += 1
      try {
        await bot.telegram.getMe()
        return
      } catch (err) {
        console.error(`[telegram] getMe attempt ${attempt} failed:`, err && err.message ? err.message : err)
        if (attempt >= maxAttempts) throw err
        const backoff = Math.min(1000 * 2 ** (attempt - 1), 10000)
        console.log(`[telegram] retrying getMe in ${backoff}ms`)
        await new Promise((r) => setTimeout(r, backoff))
      }
    }
  }

  await tryGetMeWithRetry(bot)
  await bot.launch();

  const signalHandler = async () => {
    await bot.stop('SIGTERM');
    healthServer.server.close();
    process.exit(0);
  };

  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);

  console.log(`Telegram bot started in polling mode as @${botUsername}`);
  console.log(`Health check: http://localhost:${healthPort}/health`);
}

main().catch(error => {
  console.error('[telegram] failed to start bot:', error);
  process.exit(1);
});