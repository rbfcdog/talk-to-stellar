const test = require('node:test');
const assert = require('node:assert/strict');

const { createAgentClient, normalizeAgentResponse } = require('../src/agent-client');

test('normalizeAgentResponse picks the first supported message field', () => {
  assert.equal(normalizeAgentResponse({ message: 'hello' }), 'hello');
  assert.equal(normalizeAgentResponse({ result: { message: 'nested' } }), 'nested');
  assert.equal(normalizeAgentResponse({ content: 'content' }), 'content');
  assert.equal(normalizeAgentResponse({ reply: 'reply' }), 'reply');
});

test('createAgentClient sends a structured agent request', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({ message: 'approved' }),
    };
  };

  const client = createAgentClient({ agentUrl: 'http://example.com/api', fetchImpl, timeoutMs: 1000 });
  const result = await client.sendQuery({ query: 'send 10 usdc to Ana', sessionId: 'telegram-123', from: 'ana' });

  assert.equal(result.message, 'approved');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://example.com/api');
  assert.equal(calls[0].init.method, 'POST');

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.query, 'send 10 usdc to Ana');
  assert.equal(body.session_id, 'telegram-123');
  assert.equal(body.source, 'telegram');
  assert.equal(body.metadata.channel, 'telegram');
  assert.equal(body.metadata.from, 'ana');
});