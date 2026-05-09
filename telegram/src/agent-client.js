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

function createAgentClient({ agentUrl, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!agentUrl) {
    throw new Error('agentUrl is required');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required (Node.js 18+ provides global fetch)');
  }

  async function sendQuery({ query, sessionId, source = 'telegram', from, fromId }) {
    if (!query || !query.trim()) {
      throw new Error('query is required');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          session_id: sessionId,
          source,
          metadata: {
            channel: 'telegram',
            from: from || null,
            from_id: fromId || null,
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
};