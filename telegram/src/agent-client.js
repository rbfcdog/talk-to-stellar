const DEFAULT_TIMEOUT_MS = 30000;

function normalizeAgentResponse(payload) {
  return (
    payload?.message ||
    payload?.result?.message ||
    payload?.content ||
    payload?.reply ||
    'No valid response received from the agent.'
  );
}

function readAgentIngestSecret(env = process.env) {
  const names = ['AGENT_INGEST_SECRET', 'INTERNAL_API_SECRET', 'TELEGRAM_NOTIFY_SECRET'];
  for (const name of names) {
    const value = String(env?.[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function createAgentClient({ agentUrl, ingestSecret = '', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!agentUrl) {
    throw new Error('agentUrl is required');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required (Node.js 18+ provides global fetch)');
  }

  if (!ingestSecret) {
    throw new Error('ingestSecret is required (set AGENT_INGEST_SECRET in the environment)');
  }

  async function sendQuery({ query, sessionId, source = 'telegram', from, fromId, chatId, updateId }) {
    if (!query || !query.trim()) {
      throw new Error('query is required');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(agentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-ingest-secret': ingestSecret,
          'Idempotency-Key': updateId
            ? `telegram_update_${updateId}`
            : `telegram_${chatId || 'unknown'}_${sessionId}_${Buffer.from(query).toString('base64url').slice(0, 48)}`,
        },
        body: JSON.stringify({
          query,
          session_id: sessionId,
          source,
          metadata: {
            channel: 'telegram',
            from: from || null,
            from_id: fromId || null,
            provider: source,
            provider_user_id: fromId ? String(fromId) : null,
            telegram_user_id: fromId ? String(fromId) : null,
            chat_id: chatId || null,
            update_id: updateId || null,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Agent API Error: ${errorText}`);
      }

      const payload = await response.json();
      return {
        message: normalizeAgentResponse(payload),
        raw: payload,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('aborted')) {
        throw new Error(`Agent request timed out after ${timeoutMs}ms. Check backend latency and TELEGRAM_AGENT_URL=${agentUrl}`);
      }
      if (message.toLowerCase().includes('fetch failed') || message.toLowerCase().includes('econnrefused')) {
        throw new Error(`Cannot reach backend at ${agentUrl}. Confirm backend is running and TELEGRAM_AGENT_URL is correct.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    sendQuery,
    normalizeAgentResponse,
  };
}

module.exports = {
  createAgentClient,
  normalizeAgentResponse,
  readAgentIngestSecret,
};
