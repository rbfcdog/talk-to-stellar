const { randomUUID } = require('crypto');

function createSessionStore() {
  const sessions = new Map();
  const ANONYMOUS_KEY = '__anonymous__';

  function makeSessionId() {
    if (typeof randomUUID === 'function') {
      return randomUUID();
    }

    // Fallback for environments where randomUUID is unavailable.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getSessionId(chatId) {
    const key = chatId || ANONYMOUS_KEY;

    if (!sessions.has(key)) {
      sessions.set(key, makeSessionId());
    }

    return sessions.get(key);
  }

  function setSessionId(chatId, sessionId) {
    const key = chatId || ANONYMOUS_KEY;
    const normalized = String(sessionId || '').trim();
    if (!normalized) return getSessionId(chatId);
    sessions.set(key, normalized);
    return normalized;
  }

  function clearSession(chatId) {
    sessions.delete(chatId);
  }

  return {
    getSessionId,
    setSessionId,
    clearSession,
  };
}

module.exports = {
  createSessionStore,
};
