const http = require('http');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req, secret) {
  if (!secret) return true;
  const auth = String(req.headers.authorization || '').trim();
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return token === secret;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function createHealthServer({ port = 3005, notify, notifySecret } = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      sendJson(res, 200, { ok: true, service: 'telegram-bot' });
      return;
    }

    if (req.url === '/notify' && req.method === 'POST') {
      if (!isAuthorized(req, notifySecret)) {
        sendJson(res, 401, { ok: false, error: 'Unauthorized' });
        return;
      }

      if (typeof notify !== 'function') {
        sendJson(res, 503, { ok: false, error: 'Notification handler unavailable' });
        return;
      }

      try {
        const payload = await readJsonBody(req);
        const chatId = String(payload.chat_id || payload.chatId || '').trim();
        const text = String(payload.text || '').trim();
        if (!chatId || !text) {
          sendJson(res, 400, { ok: false, error: 'chat_id and text are required' });
          return;
        }

        const result = await notify({
          chatId,
          text,
          disableWebPagePreview: payload.disable_web_page_preview !== false,
        });
        sendJson(res, 200, { ok: true, message_id: result?.message_id || null });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  function start() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => {
        server.off('error', reject);
        resolve(server);
      });
    });
  }

  return {
    server,
    start,
  };
}

module.exports = {
  createHealthServer,
  readJsonBody,
  isAuthorized,
};
