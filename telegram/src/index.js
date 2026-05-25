require('dotenv').config();

const http = require('http');
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { createAgentClient } = require('./agent-client');
const { createHealthServer, readJsonBody, isAuthorized } = require('./health-server');
const { createTelegramBot } = require('./bot');

const preferredSystemFonts = [
  '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
];

const receiptFontFiles = preferredSystemFonts.filter((fontPath) => fs.existsSync(fontPath));

if (receiptFontFiles.length === 0) {
  console.warn('[receipt] no system TTF fonts found, falling back to bundled Inter WOFF2.');
  receiptFontFiles.push(
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
  );
}

function renderReceiptPng(svgBuffer) {
  const svgText = svgBuffer
    .toString('utf8')
    .replace(/font-family="Inter, system-ui, sans-serif"/g, 'font-family="Inter"');
  const renderer = new Resvg(svgText, {
    fitTo: {
      mode: 'width',
      value: 1080,
    },
    font: {
      fontFiles: receiptFontFiles,
      defaultFontFamily: 'Noto Sans',
      loadSystemFonts: true,
    },
  });
  return renderer.render().asPng();
}

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=medium'],
    });
  }
  return browserPromise;
}

function toBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

function parseSvgSize(svgText) {
  const viewBoxMatch = svgText.match(/viewBox=["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  const widthMatch = svgText.match(/width=["']\s*([\d.]+)(px)?\s*["']/i);
  const heightMatch = svgText.match(/height=["']\s*([\d.]+)(px)?\s*["']/i);
  const width = Number(widthMatch?.[1] || viewBoxMatch?.[3] || 720);
  const height = Number(heightMatch?.[1] || viewBoxMatch?.[4] || 1280);
  return {
    width: Number.isFinite(width) && width > 0 ? Math.round(width) : 720,
    height: Number.isFinite(height) && height > 0 ? Math.round(height) : 1280,
  };
}

function sanitizeSvgForHtml(svgText) {
  return String(svgText || '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .trim();
}

function buildFontFaceCss() {
  const candidates = [
    '@fontsource/inter/files/inter-latin-400-normal.woff2',
    '@fontsource/inter/files/inter-latin-500-normal.woff2',
    '@fontsource/inter/files/inter-latin-600-normal.woff2',
    '@fontsource/inter/files/inter-latin-700-normal.woff2',
    '@fontsource/inter/files/inter-latin-ext-400-normal.woff2',
    '@fontsource/inter/files/inter-latin-ext-500-normal.woff2',
    '@fontsource/inter/files/inter-latin-ext-600-normal.woff2',
    '@fontsource/inter/files/inter-latin-ext-700-normal.woff2',
  ];

  const rules = [];
  for (const relPath of candidates) {
    try {
      const filePath = require.resolve(relPath);
      const weightMatch = relPath.match(/-(400|500|600|700)-/);
      const weight = weightMatch ? weightMatch[1] : '400';
      rules.push(`
        @font-face {
          font-family: 'TTSInter';
          src: url(data:font/woff2;base64,${toBase64(filePath)}) format('woff2');
          font-weight: ${weight};
          font-style: normal;
          font-display: block;
        }
      `);
    } catch {}
  }
  return rules.join('\n');
}

async function renderReceiptPngWithChromium(svgBuffer) {
  const rawSvg = sanitizeSvgForHtml(svgBuffer.toString('utf8'));
  const { width, height } = parseSvgSize(rawSvg);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({
      width: Math.max(320, width),
      height: Math.max(320, height),
      deviceScaleFactor: 2,
    });

    const fontFaceCss = buildFontFaceCss();
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: #0b1020; }
      ${fontFaceCss}
      #svg-root, #svg-root svg {
        width: ${width}px;
        height: ${height}px;
        display: block;
        overflow: visible;
      }
      #svg-root svg text, #svg-root svg tspan {
        font-family: 'TTSInter', Arial, Inter, sans-serif !important;
        opacity: 1 !important;
      }
    </style>
  </head>
  <body>
    <div id="svg-root">${rawSvg}</div>
  </body>
</html>`;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const textProbe = await page.evaluate(() => {
      const textNodes = Array.from(document.querySelectorAll('#svg-root text, #svg-root tspan'));
      const visibleSample = textNodes.slice(0, 20).map((el) => {
        const style = window.getComputedStyle(el);
        return {
          text: String(el.textContent || '').trim().slice(0, 32),
          opacity: style.opacity,
          color: style.color,
          fill: style.fill,
          display: style.display,
          visibility: style.visibility,
        };
      });
      return { count: textNodes.length, sample: visibleSample };
    });
    console.log('[telegram-notify] text probe:', JSON.stringify(textProbe));

    const clip = await page.$eval('#svg-root', (el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: Math.max(0, rect.x),
        y: Math.max(0, rect.y),
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      };
    });

    return await page.screenshot({
      type: 'png',
      clip,
      omitBackground: false,
    });
  } finally {
    await page.close();
  }
}

function normalizeCaption(text) {
  const raw = String(text || '').trim() || 'Comprovante TalkToStellar';
  // Telegram caption hard limit for media is 1024 chars.
  if (raw.length <= 1000) return raw;
  return `${raw.slice(0, 997).trimEnd()}...`;
}

function isPngBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return false;
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  return buffer.subarray(0, 8).equals(pngSignature);
}

function readPngDimensions(buffer) {
  if (!isPngBuffer(buffer) || buffer.length < 24) return { width: 0, height: 0 };
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function saveDebugPng(buffer, filename = 'debug-telegram-image.png') {
  const baseDir = process.env.TELEGRAM_DEBUG_IMAGE_DIR
    ? path.resolve(process.env.TELEGRAM_DEBUG_IMAGE_DIR)
    : '/tmp/talktostellar-debug';
  fs.mkdirSync(baseDir, { recursive: true });
  const filepath = path.resolve(baseDir, filename);
  fs.writeFileSync(filepath, buffer);
  return filepath;
}

function resolveBotProfilePhotoPath(value = '') {
  const configured = String(value || '').trim();
  if (configured) return path.resolve(configured);
  return path.resolve(__dirname, '..', 'assets', 'talktostellar-avatar.jpg');
}

function normalizeProfileDescription(value, fallback, maxLength) {
  const text = String(value || fallback || '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
}

async function callTelegramJsonApi(botToken, method, payload, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const body = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`${method} failed status=${response.status} body=${body}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return { ok: true };
  }
}

async function setTelegramProfilePhoto(botToken, photoPath, fetchImpl = fetch) {
  const resolvedPhotoPath = resolveBotProfilePhotoPath(photoPath);
  if (!fs.existsSync(resolvedPhotoPath)) {
    throw new Error(`profile photo not found: ${resolvedPhotoPath}`);
  }

  const photoBuffer = fs.readFileSync(resolvedPhotoPath);
  const form = new FormData();
  form.set('photo', JSON.stringify({
    type: 'static',
    photo: 'attach://photo_file',
  }));
  form.set('photo_file', new Blob([photoBuffer], { type: 'image/jpeg' }), path.basename(resolvedPhotoPath));

  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/setMyProfilePhoto`, {
    method: 'POST',
    body: form,
  });
  const body = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`setMyProfilePhoto failed status=${response.status} body=${body}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return { ok: true };
  }
}

async function configureTelegramBotProfile({ botToken, fetchImpl = fetch, logger = console } = {}) {
  const disabled = String(process.env.TELEGRAM_PROFILE_SETUP || '').trim().toLowerCase();
  if (disabled === '0' || disabled === 'false' || disabled === 'off') {
    logger.log?.('[telegram-profile] setup disabled');
    return { skipped: true };
  }

  const profilePhotoPath = resolveBotProfilePhotoPath(process.env.TELEGRAM_PROFILE_PHOTO_PATH);
  const shortDescription = normalizeProfileDescription(
    process.env.TELEGRAM_SHORT_DESCRIPTION,
    'TalkToStellar wallet assistant for balance, PIX, contacts, and transfers.',
    120
  );
  const description = normalizeProfileDescription(
    process.env.TELEGRAM_DESCRIPTION,
    'TalkToStellar helps you check your balance, manage contacts, add or withdraw with PIX, convert funds, and send payments from Telegram.',
    512
  );

  const result = {
    photo: false,
    shortDescription: false,
    description: false,
  };

  try {
    await setTelegramProfilePhoto(botToken, profilePhotoPath, fetchImpl);
    result.photo = true;
    logger.log?.(`[telegram-profile] profile photo set from ${profilePhotoPath}`);
  } catch (error) {
    logger.warn?.(`[telegram-profile] could not set profile photo: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await callTelegramJsonApi(botToken, 'setMyShortDescription', { short_description: shortDescription }, fetchImpl);
    result.shortDescription = true;
    logger.log?.('[telegram-profile] short description set');
  } catch (error) {
    logger.warn?.(`[telegram-profile] could not set short description: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await callTelegramJsonApi(botToken, 'setMyDescription', { description }, fetchImpl);
    result.description = true;
    logger.log?.('[telegram-profile] description set');
  } catch (error) {
    logger.warn?.(`[telegram-profile] could not set description: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const agentUrl = process.env.TELEGRAM_AGENT_URL || 'http://localhost:3001/api/agent/query';
  const mode = (process.env.TELEGRAM_BOT_MODE || 'polling').toLowerCase();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'talktostellar_bot';
  const sessionPrefix = process.env.TELEGRAM_SESSION_PREFIX || 'telegram';
  const webhookPath = process.env.TELEGRAM_WEBHOOK_PATH || '/webhook/telegram';
  const notifySecret = process.env.TELEGRAM_NOTIFY_SECRET || process.env.INTERNAL_API_SECRET || '';
  const ingestSecret = (process.env.AGENT_INGEST_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
  const webhookPublicBase = String(
    process.env.TELEGRAM_WEBHOOK_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ''
  ).trim().replace(/\/$/, '');

  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  if (!ingestSecret) {
    throw new Error('AGENT_INGEST_SECRET is required (must match the backend value)');
  }

  await configureTelegramBotProfile({ botToken, logger: console });

  const agentClient = createAgentClient({ agentUrl, ingestSecret });
  const backendBaseUrl = new URL(agentUrl).origin;
  const externalCheck = async ({ provider, provider_user_id, chat_id, username }) => {
    console.log('[telegram] check-account request', JSON.stringify({
      provider,
      provider_user_id,
      chat_id,
      username: username || null,
    }));
    const response = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/api/external/check-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, provider_user_id, chat_id, telegram_chat_id: chat_id, username }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`check-account failed: ${errorText}`);
    }

    const payload = await response.json();
    console.log('[telegram] check-account response', JSON.stringify({
      provider,
      provider_user_id,
      chat_id,
      exists: payload?.exists,
      session_id: payload?.sessionId || null,
      onboarding_required: payload?.onboardingRequired || false,
    }));
    return payload;
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
  const notify = async ({ chatId, text, imageSvgBase64, filename, disableWebPagePreview = true, buttonText = '', buttonUrl = '' }) => {
    const caption = normalizeCaption(text);
    const hasButton = String(buttonText || '').trim() && String(buttonUrl || '').trim();
    const replyMarkup = hasButton
      ? { inline_keyboard: [[{ text: String(buttonText).trim(), url: String(buttonUrl).trim() }]] }
      : undefined;
    if (imageSvgBase64) {
      const svgBuffer = Buffer.from(imageSvgBase64, 'base64');
      const pngFilename = String(filename || 'recibo-talktostellar.png').replace(/\.svg$/i, '.png');
      const debugName = `debug-telegram-image-${String(chatId || 'unknown')}-${Date.now()}.png`;

      try {
        let pngBuffer;
        try {
          pngBuffer = await renderReceiptPngWithChromium(svgBuffer);
        } catch (chromiumError) {
          console.warn('[telegram-notify] chromium render failed, using resvg fallback:', chromiumError instanceof Error ? chromiumError.message : String(chromiumError));
          pngBuffer = renderReceiptPng(svgBuffer);
        }
        const debugPath = saveDebugPng(pngBuffer, debugName);
        const { width, height } = readPngDimensions(pngBuffer);
        const validPng = isPngBuffer(pngBuffer);
        console.log(`[telegram-notify] png validation bytes=${pngBuffer.length} width=${width} height=${height} valid=${validPng} file=${debugPath}`);

        if (!validPng) {
          throw new Error('Rendered buffer is not a PNG');
        }
        if (pngBuffer.length < 2048) {
          throw new Error(`Rendered PNG too small (${pngBuffer.length} bytes)`);
        }
        if (!width || !height) {
          throw new Error('Rendered PNG has invalid dimensions');
        }

        try {
          const photoResponse = await bot.telegram.sendPhoto(
            chatId,
            { source: pngBuffer, filename: pngFilename, contentType: 'image/png' },
            { caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
          );
          console.log(`[telegram-notify] sendPhoto success chat=${chatId} message_id=${photoResponse?.message_id || 'n/a'} bytes=${pngBuffer.length}`);
          return photoResponse;
        } catch (photoError) {
          console.warn('[telegram-notify] sendPhoto failed, trying sendDocument PNG fallback:', photoError instanceof Error ? photoError.message : String(photoError));
          const documentResponse = await bot.telegram.sendDocument(
            chatId,
            { source: pngBuffer, filename: pngFilename, contentType: 'image/png' },
            { caption, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
          );
          console.log(`[telegram-notify] sendDocument success chat=${chatId} message_id=${documentResponse?.message_id || 'n/a'} bytes=${pngBuffer.length}`);
          return documentResponse;
        }
      } catch (renderOrPhotoError) {
        console.warn('[telegram-notify] sendPhoto failed, trying text-only fallback:', renderOrPhotoError instanceof Error ? renderOrPhotoError.message : String(renderOrPhotoError));
      }

      return bot.telegram.sendMessage(chatId, caption, {
        disable_web_page_preview: disableWebPagePreview,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
    return bot.telegram.sendMessage(chatId, caption, {
      disable_web_page_preview: disableWebPagePreview,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
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
            buttonText: String(payload.button_text || payload.buttonText || '').trim(),
            buttonUrl: String(payload.button_url || payload.buttonUrl || '').trim(),
          });
          sendJson(res, 200, { ok: true, message_id: result?.message_id || null });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      if (req.url === normalizedPath && req.method === 'POST') {
        console.log('[telegram] webhook update received');
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

if (require.main === module) {
  main().catch(error => {
    console.error('[telegram] failed to start bot:', error);
    process.exit(1);
  });
}

process.on('SIGINT', async () => {
  try {
    if (browserPromise) {
      const browser = await browserPromise;
      await browser.close();
    }
  } catch {}
});

module.exports = {
  configureTelegramBotProfile,
  resolveBotProfilePhotoPath,
  normalizeProfileDescription,
  setTelegramProfilePhoto,
};
