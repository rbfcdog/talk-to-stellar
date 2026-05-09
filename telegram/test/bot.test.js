const test = require('node:test');
const assert = require('node:assert/strict');

const { createTelegramBot, formatWelcomeMessage } = require('../src/bot');

test('formatWelcomeMessage includes usage guidance (Portuguese)', () => {
  const message = formatWelcomeMessage();
  assert.match(message, /Olá — TalkToStellar está online no Telegram!/);
  assert.match(message, /\/reset/);
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

test('telegram text handler sends creation URL when account is missing', async () => {
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

  assert.equal(queries.length, 0);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /crie sua conta/i);
  assert.match(replies[0], /create-account\?token=abc123/);
});

test('telegram text handler does not forward to agent when account check fails', async () => {
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

  assert.equal(queries.length, 0);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /Nao consegui validar seu cadastro agora/i);
});