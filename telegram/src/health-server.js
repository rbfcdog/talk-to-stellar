const http = require('http');

function createHealthServer({ port = 3005 } = {}) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'telegram-bot' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
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
};