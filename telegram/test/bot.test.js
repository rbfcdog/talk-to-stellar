const test = require('node:test');
const assert = require('node:assert/strict');

const { createTelegramBot, formatWelcomeMessage, resolveBrandImageSource } = require('../src/bot');

test('formatWelcomeMessage includes usage guidance (Portuguese)', () => {
  const message = formatWelcomeMessage();
  assert.match(message, /Olá — TalkToStellar está online no Telegram!/);
  assert.match(message, /\/reset/);
});

test('resolveBrandImageSource uses frontend public talktostellar image URL', () => {
  const source = resolveBrandImageSource({
    PUBLIC_APP_URL: 'https://app.talktostellar.com/',
  });

  assert.equal(source, 'https://app.talktostellar.com/talktostellar.png');
});

test('telegram welcome sends the TalkToStellar image when available', async () => {
  const sentPhotos = [];
  const replies = [];
  const { sendWelcomeMessage } = createTelegramBot({
    botToken: 'test-token',
    agentClient: {
      sendQuery: async () => ({ message: 'processed' }),
    },
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  });

  const previousPublicAppUrl = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = 'https://app.talktostellar.com';

  try {
    await sendWelcomeMessage({
      chat: { id: 42 },
      telegram: {
        sendPhoto: async (chatId, photo, options) => {
          sentPhotos.push({ chatId, photo, options });
          return { message_id: 123 };
        },
      },
      reply: async text => replies.push(text),
    });
  } finally {
    if (previousPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousPublicAppUrl;
  }

  assert.equal(sentPhotos.length, 1);
  assert.equal(sentPhotos[0].chatId, 42);
  assert.equal(sentPhotos[0].photo, 'https://app.talktostellar.com/talktostellar.png');
  assert.match(sentPhotos[0].options.caption, /TalkToStellar está online no Telegram/);
  assert.equal(replies.length, 0);
});

test('telegram text handler forwards the message to the agent', async () => {
  const queries = [];
  const replies = [];
  const { handleTextMessage, sessionStore } = createTelegramBot({
    botToken: 'test-token',
    agentClient: {
      sendQuery: async payload => {
        queries.push(payload);
        return { message: 'processed' };
      },
    },
    // mock externalCheck so test doesn't perform network calls
    externalCheck: async ({ provider, provider_user_id }) => ({ exists: true, sessionId: sessionStore.getSessionId(42) }),
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  });

  const ctx = {
    message: { text: 'send 10 usdc to Ana' },
    chat: { id: 42 },
    from: { username: 'alice', id: 7 },
    session: { sessionId: sessionStore.getSessionId(42) },
    reply: async text => replies.push(text),
  };

  await handleTextMessage(ctx);

  assert.equal(queries.length, 1);
  assert.equal(queries[0].query, 'send 10 usdc to Ana');
  assert.match(
    queries[0].sessionId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  // payload should include sender username and sender id
  assert.equal(queries[0].from, 'alice');
  assert.equal(queries[0].fromId, 7);
  assert.equal(queries[0].source, 'telegram');
  assert.equal(replies[0], 'processed');
});

test('telegram text handler forwards to the agent when account is missing', async () => {
  const queries = [];
  const replies = [];
  const { handleTextMessage } = createTelegramBot({
    botToken: 'test-token',
    agentClient: {
      sendQuery: async payload => {
        queries.push(payload);
        return { message: 'processed' };
      },
    },
    externalCheck: async () => ({
      exists: false,
      creationUrl: 'https://app.example.com/create-account?token=abc123',
    }),
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  });

  const ctx = {
    message: { text: 'send 1 xlm to Bob' },
    chat: { id: 99 },
    from: { username: 'alice', id: 7 },
    session: {},
    reply: async text => replies.push(text),
  };

  await handleTextMessage(ctx);

  assert.equal(queries.length, 1);
  assert.equal(queries[0].source, 'telegram');
  assert.equal(queries[0].fromId, 7);
  assert.equal(replies.length, 1);
  assert.equal(replies[0], 'processed');
});

test('telegram text handler forwards to the agent when account check fails', async () => {
  const queries = [];
  const replies = [];
  const { handleTextMessage } = createTelegramBot({
    botToken: 'test-token',
    agentClient: {
      sendQuery: async payload => {
        queries.push(payload);
        return { message: 'processed' };
      },
    },
    externalCheck: async () => {
      throw new Error('network down');
    },
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  });

  const ctx = {
    message: { text: 'send 1 xlm to Bob' },
    chat: { id: 100 },
    from: { username: 'alice', id: 7 },
    session: {},
    reply: async text => replies.push(text),
  };

  await handleTextMessage(ctx);

  assert.equal(queries.length, 1);
  assert.equal(queries[0].source, 'telegram');
  assert.equal(queries[0].fromId, 7);
  assert.equal(replies.length, 1);
  assert.equal(replies[0], 'processed');
});
