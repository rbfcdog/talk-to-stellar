const { Telegraf, session } = require('telegraf');
const https = require('https');
const { createSessionStore } = require('./session-store');

function formatWelcomeMessage() {
  return [
    'Olá — TalkToStellar está online no Telegram!',
    '',
    'Envie uma mensagem como “enviar 10 USDC para Ana” e eu enviarei para o agente.',
    'Use /reset para limpar a sessão local.',
  ].join('\n');
}

function createTelegramBot({ botToken, agentClient, sessionPrefix = 'telegram', logger = console, externalCheck, backendBaseUrl = null }) {
  if (!botToken) {
    throw new Error('botToken is required');
  }

  if (!agentClient || typeof agentClient.sendQuery !== 'function') {
    throw new Error('agentClient with sendQuery is required');
  }

  const botApiAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10_000,
    family: 4,
  });

  const bot = new Telegraf(botToken, {
    telegram: {
      agent: botApiAgent,
      webhookReply: false,
    },
  });
  const sessionStore = createSessionStore({ prefix: sessionPrefix });
  const warn = typeof logger.warn === 'function' ? logger.warn.bind(logger) : () => {};
  const info = typeof logger.info === 'function' ? logger.info.bind(logger) : () => {};
  const errorLog = typeof logger.error === 'function' ? logger.error.bind(logger) : () => {};

  bot.use(session());

  async function sendTelegramResponse(ctx, text) {
    const chatId = ctx.chat?.id;
    if (!chatId) {
      throw new Error('Chat id is missing');
    }

    info(`[telegram] sending reply chat=${chatId} size=${String(text || '').length}`);

    const botApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
      const response = await fetch(botApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });
      const bodyText = await response.text();
      if (!response.ok) {
        warn(`[telegram] sendMessage failed status=${response.status} body=${bodyText}`);
        throw new Error(`Telegram sendMessage failed with status ${response.status}`);
      }

      try {
        const payload = JSON.parse(bodyText);
        info(`[telegram] reply sent chat=${chatId} message_id=${payload?.result?.message_id || 'n/a'}`);
      } catch {
        info(`[telegram] reply sent chat=${chatId}`);
      }
      return;
    } catch (error) {
      warn(`[telegram] direct sendMessage failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (ctx.telegram && typeof ctx.telegram.sendMessage === 'function') {
      const result = await ctx.telegram.sendMessage(chatId, text);
      info(`[telegram] reply sent via telegraf chat=${chatId} message_id=${result?.message_id || 'n/a'}`);
      return result;
    }

    if (typeof ctx.reply === 'function') {
      const result = await ctx.reply(text);
      info(`[telegram] reply sent via ctx.reply chat=${chatId}`);
      return result;
    }

    throw new Error('Telegram reply API is unavailable');
  }

  const handleTextMessage = async ctx => {
    const text = ctx.message?.text?.trim();
    if (!text) {
      return;
    }

    const chatId = ctx.chat?.id;
    let sessionId = ctx.session?.sessionId || sessionStore.getSessionId(chatId);
    ctx.session = ctx.session || {};
    ctx.session.sessionId = sessionId;

    logger.info(`[telegram] incoming message chat=${chatId} session=${sessionId}`);

    try {
      const providerUserId = ctx.from?.id ? String(ctx.from.id) : null;
      if (!providerUserId) {
        await sendTelegramResponse(ctx, 'Nao consegui identificar sua conta do Telegram. Tente novamente.');
        return;
      }

      // Check if external account exists (if a check function or backend URL is provided)
      if (typeof externalCheck === 'function') {
        let checkResult;
        try {
          checkResult = await externalCheck({ provider: 'telegram', provider_user_id: providerUserId });
        } catch (err) {
          warn(`[telegram] external check failed: ${err?.message || err}`);
          await sendTelegramResponse(ctx, 'Nao consegui validar seu cadastro agora. Tente novamente em alguns segundos.');
          return;
        }

        if (checkResult && checkResult.exists === false) {
          await sendTelegramResponse(ctx, `Olá! Para começar, por favor crie sua conta: ${checkResult.creationUrl}`);
          return;
        }
        if (checkResult && checkResult.exists && checkResult.sessionId) {
          sessionId = checkResult.sessionId;
          ctx.session.sessionId = sessionId;
        } else {
          await sendTelegramResponse(ctx, 'Voce ainda nao possui conta cadastrada. Faça seu cadastro para continuar.');
          return;
        }
      } else if (backendBaseUrl) {
        try {
          const res = await fetch(`${backendBaseUrl.replace(/\/$/, '')}/api/external/check-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'telegram', provider_user_id: providerUserId }),
          });
          if (res.ok) {
            const payload = await res.json();
            if (payload && payload.exists === false) {
              await sendTelegramResponse(ctx, `Olá! Para começar, por favor crie sua conta: ${payload.creationUrl}`);
              return;
            }
            if (payload && payload.exists && payload.sessionId) {
              sessionId = payload.sessionId;
              ctx.session.sessionId = sessionId;
            } else if (payload && payload.exists === false) {
              await sendTelegramResponse(ctx, `Olá! Para começar, por favor crie sua conta: ${payload.creationUrl}`);
              return;
            }
          } else {
            warn('[telegram] external check returned non-200, continuing with existing session');
          }
        } catch (err) {
          warn(`[telegram] external check failed: ${err?.message || err}`);
          await sendTelegramResponse(ctx, 'Nao consegui validar seu cadastro agora. Tente novamente em alguns segundos.');
          return;
        }
      }

      const result = await agentClient.sendQuery({
        query: text,
        sessionId,
        source: 'telegram',
        from: ctx.from?.username || null,
        fromId: ctx.from?.id || null,
      });

      await sendTelegramResponse(ctx, result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errorLog('[telegram] failed to process message', {
        message,
        backendBaseUrl,
      });

      if (message.includes('Cannot reach backend')) {
        await sendTelegramResponse(ctx, 'Nao consegui conectar ao backend agora. Tente novamente em alguns segundos.');
        return;
      }

      await sendTelegramResponse(ctx, 'Nao consegui processar sua mensagem agora. Tente novamente em alguns segundos.');
    }
  };

  bot.start(async ctx => {
    ctx.session = ctx.session || {};
    ctx.session.sessionId = sessionStore.getSessionId(ctx.chat?.id);
    await sendTelegramResponse(ctx, formatWelcomeMessage());
  });

  bot.command('reset', async ctx => {
    const chatId = ctx.chat?.id;
    if (chatId) {
      sessionStore.clearSession(chatId);
    }
    ctx.session = ctx.session || {};
    ctx.session.sessionId = sessionStore.getSessionId(chatId);
    await sendTelegramResponse(ctx, 'Sessao limpa. Envie uma nova mensagem para recomecar.');
  });

  bot.on('text', handleTextMessage);

  bot.catch((error, ctx) => {
    errorLog('[telegram] unhandled bot error', error, ctx?.updateType || 'unknown');
  });

  return {
    bot,
    handleTextMessage,
    formatWelcomeMessage,
    sessionStore,
  };
}

module.exports = {
  createTelegramBot,
  formatWelcomeMessage,
};
