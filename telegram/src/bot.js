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
    },
  });
  const sessionStore = createSessionStore({ prefix: sessionPrefix });

  bot.use(session());

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
        await ctx.reply('Nao consegui identificar sua conta do Telegram. Tente novamente.');
        return;
      }

      // Check if external account exists (if a check function or backend URL is provided)
      if (typeof externalCheck === 'function') {
        let checkResult;
        try {
          checkResult = await externalCheck({ provider: 'telegram', provider_user_id: providerUserId });
        } catch (err) {
          logger.warn('[telegram] external check failed, blocking agent forwarding', err?.message || err);
          await ctx.reply('Nao consegui validar seu cadastro agora. Tente novamente em alguns segundos.');
          return;
        }

        if (checkResult && checkResult.exists === false) {
          await ctx.reply(`Olá! Para começar, por favor crie sua conta: ${checkResult.creationUrl}`);
          return;
        }
        if (checkResult && checkResult.exists && checkResult.sessionId) {
          sessionId = checkResult.sessionId;
          ctx.session.sessionId = sessionId;
        } else {
          await ctx.reply('Voce ainda nao possui conta cadastrada. Faça seu cadastro para continuar.');
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
              await ctx.reply(`Olá! Para começar, por favor crie sua conta: ${payload.creationUrl}`);
              return;
            }
            if (payload && payload.exists && payload.sessionId) {
              sessionId = payload.sessionId;
              ctx.session.sessionId = sessionId;
            } else {
              await ctx.reply('Voce ainda nao possui conta cadastrada. Faça seu cadastro para continuar.');
              return;
            }
          } else {
            await ctx.reply('Nao consegui validar seu cadastro agora. Tente novamente em alguns segundos.');
            return;
          }
        } catch (err) {
          logger.warn('[telegram] external check failed, blocking agent forwarding', err?.message || err);
          await ctx.reply('Nao consegui validar seu cadastro agora. Tente novamente em alguns segundos.');
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

      await ctx.reply(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[telegram] failed to process message', {
        message,
        backendBaseUrl,
      });

      if (message.includes('Cannot reach backend')) {
        await ctx.reply('Nao consegui conectar ao backend agora. Tente novamente em alguns segundos.');
        return;
      }

      await ctx.reply('Nao consegui processar sua mensagem agora. Tente novamente em alguns segundos.');
    }
  };

  bot.start(async ctx => {
    ctx.session = ctx.session || {};
    ctx.session.sessionId = sessionStore.getSessionId(ctx.chat?.id);
    await ctx.reply(formatWelcomeMessage());
  });

  bot.command('reset', async ctx => {
    const chatId = ctx.chat?.id;
    if (chatId) {
      sessionStore.clearSession(chatId);
    }
    ctx.session = ctx.session || {};
    ctx.session.sessionId = sessionStore.getSessionId(chatId);
    await ctx.reply('Sessao limpa. Envie uma nova mensagem para recomecar.');
  });

  bot.on('text', handleTextMessage);

  bot.catch((error, ctx) => {
    logger.error('[telegram] unhandled bot error', error, ctx?.updateType || 'unknown');
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