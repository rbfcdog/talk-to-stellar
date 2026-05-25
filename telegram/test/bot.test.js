const test = require('node:test');
const assert = require('node:assert/strict');

const { createTelegramBot, formatWelcomeMessage } = require('../src/bot');

test('formatWelcomeMessage includes usage guidance (Portuguese)', () => {
  const message = formatWelcomeMessage();
  assert.match(message, /Olá, aqui é o TalkToStellar\./);
  assert.match(message, /colocar 10 reais via PIX/);
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

test('telegram text handler replaces stale local session with backend-linked account session', async () => {
  const queries = [];
  const replies = [];
  const linkedSessionId = '22222222-2222-4222-8222-222222222222';
  const staleSessionId = '11111111-1111-4111-8111-111111111111';
  const { handleTextMessage, sessionStore } = createTelegramBot({
    botToken: 'test-token',
    agentClient: {
      sendQuery: async payload => {
        queries.push(payload);
        return { message: 'processed' };
      },
    },
    externalCheck: async () => ({
      exists: true,
      sessionId: linkedSessionId,
    }),
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
    },
  });

  sessionStore.setSessionId(77, staleSessionId);
  const ctx = {
    message: { text: 'balance' },
    chat: { id: 77 },
    from: { username: 'alice', id: 7 },
    session: { sessionId: staleSessionId },
    reply: async text => replies.push(text),
  };

  await handleTextMessage(ctx);

  assert.equal(queries.length, 1);
  assert.equal(queries[0].sessionId, linkedSessionId);
  assert.equal(ctx.session.sessionId, linkedSessionId);
  assert.equal(sessionStore.getSessionId(77), linkedSessionId);
  assert.equal(replies[0], 'processed');
});
