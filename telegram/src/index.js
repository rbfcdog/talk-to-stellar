require('dotenv').config();

const http = require('http');
const { Resvg } = require('@resvg/resvg-js');
const { createAgentClient } = require('./agent-client');
const { createHealthServer, readJsonBody, isAuthorized } = require('./health-server');
const { createTelegramBot } = require('./bot');

const receiptFontFiles = [
  require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-500-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-600-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-700-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-800-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-ext-400-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-ext-500-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-ext-600-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-ext-700-normal.woff2'),
  require.resolve('@fontsource/inter/files/inter-latin-ext-800-normal.woff2'),
];

function renderReceiptPng(svgBuffer) {
  const renderer = new Resvg(svgBuffer, {
    fitTo: {
      mode: 'width',
      value: 1080,
    },
    font: {
      fontFiles: receiptFontFiles,
      defaultFontFamily: 'Inter',
      loadSystemFonts: false,
    },
  });
  return renderer.render().asPng();
}

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const agentUrl = process.env.TELEGRAM_AGENT_URL || 'http://localhost:3001/api/agent/query';
  const mode = (process.env.TELEGRAM_BOT_MODE || 'polling').toLowerCase();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'talktostellar_bot';
  const sessionPrefix = process.env.TELEGRAM_SESSION_PREFIX || 'telegram';
  const webhookPath = process.env.TELEGRAM_WEBHOOK_PATH || '/webhook/telegram';
  const notifySecret = process.env.TELEGRAM_NOTIFY_SECRET || process.env.INTERNAL_API_SECRET || '';
  const webhookPublicBase = String(
    process.env.TELEGRAM_WEBHOOK_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ''
  ).trim().replace(/\/$/, '');

  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  const agentClient = createAgentClient({ agentUrl });
  const backendBaseUrl = new URL(agentUrl).origin;
  const externalCheck = async ({ provider, provider_user_id, chat_id, username }) => {
    const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/api/external/check-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, provider_user_id, chat_id, telegram_chat_id: chat_id, username }),
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
  let healthServer = null;
  const notify = async ({ chatId, text, imageSvgBase64, filename, disableWebPagePreview = true }) => {
    if (imageSvgBase64) {
      const svgBuffer = Buffer.from(imageSvgBase64, 'base64');
      const pngBuffer = renderReceiptPng(svgBuffer);
      const pngFilename = String(filename || 'recibo-talktostellar.png').replace(/\.svg$/i, '.png');
      return bot.telegram.sendPhoto(
        chatId,
        { source: pngBuffer, filename: pngFilename },
        { caption: text || 'Comprovante TalkToStellar' }
      );
    }
    return bot.telegram.sendMessage(chatId, text, { disable_web_page_preview: disableWebPagePreview });
  };

  if (mode === 'webhook') {
    if (!webhookPublicBase) {
      throw new Error('TELEGRAM_WEBHOOK_URL (or PUBLIC_APP_URL/RENDER_EXTERNAL_URL) is required in webhook mode');
    }

    const normalizedPath = webhookPath.startsWith('/') ? webhookPath : `/${webhookPath}`;
    const webhookUrl = `${webhookPublicBase}${normalizedPath}`;
    const port = Number(process.env.PORT || process.env.TELEGRAM_WEBHOOK_PORT || healthPort);
    const webhookCallback = bot.webhookCallback(normalizedPath);

    const sendJson = (res, status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    const server = http.createServer(async (req, res) => {
      if (req.url === '/health') {
        sendJson(res, 200, { ok: true, service: 'telegram-bot', mode: 'webhook' });
        return;
      }
      if (req.url === '/notify' && req.method === 'POST') {
        if (!isAuthorized(req, notifySecret)) {
          sendJson(res, 401, { ok: false, error: 'Unauthorized' });
          return;
        }

        try {
          const payload = await readJsonBody(req);
          const chatId = String(payload.chat_id || payload.chatId || '').trim();
          const text = String(payload.text || '').trim();
          const imageSvgBase64 = String(payload.image_svg_base64 || payload.imageSvgBase64 || '').trim();
          if (!chatId || (!text && !imageSvgBase64)) {
            sendJson(res, 400, { ok: false, error: 'chat_id and text or image_svg_base64 are required' });
            return;
          }

          const result = await notify({
            chatId,
            text,
            imageSvgBase64,
            filename: String(payload.filename || 'recibo-talktostellar.svg').trim(),
            disableWebPagePreview: payload.disable_web_page_preview !== false,
          });
          sendJson(res, 200, { ok: true, message_id: result?.message_id || null });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      if (req.url === normalizedPath && req.method === 'POST') {
        webhookCallback(req, res);
        return;
      }
      sendJson(res, 404, { ok: false, error: 'Not found' });
    });

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => {
        server.off('error', reject);
        resolve(server);
      });
    });
    await bot.telegram.setWebhook(webhookUrl, { drop_pending_updates: true });
    healthServer = { server };
    console.log(`Telegram bot started in webhook mode as @${botUsername}`);
    console.log(`Webhook: ${webhookUrl}`);
    console.log(`Health check: http://localhost:${port}/health`);
  } else {
    healthServer = createHealthServer({ port: healthPort, notify, notifySecret });
    await healthServer.start();

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
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch();
    console.log(`Telegram bot started in polling mode as @${botUsername}`);
    console.log(`Health check: http://localhost:${healthPort}/health`);
  }

  const signalHandler = async () => {
    await bot.stop('SIGTERM');
    healthServer.server.close();
    process.exit(0);
  };

  process.once('SIGINT', signalHandler);
  process.once('SIGTERM', signalHandler);

}

main().catch(error => {
  console.error('[telegram] failed to start bot:', error);
  process.exit(1);
});
