import app from './app';
import config from './config';
import { validateConfig } from './config';

// Validate configuration
try {
  validateConfig();
} catch (error) {
  console.error('❌ Configuration error:', error);
  process.exit(1);
}

// Start server
const PORT = config.port;
const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║        🚀 Twilio WhatsApp Webhook Service Started          ║
╚════════════════════════════════════════════════════════════╝

📍 Server:        http://localhost:${PORT}
🔗 Webhook:       POST http://localhost:${PORT}/message
📊 Health:        GET  http://localhost:${PORT}/health
📈 Status:        GET  http://localhost:${PORT}/status

🔌 API Endpoints:
   Agent API:     ${config.agentApiUrl}
   Backend API:   ${config.backendApiUrl}

🌍 Environment:   ${config.nodeEnv}
⏱️  Timeout:      ${config.agentApiTimeout}ms

📝 Webhook URL for Twilio Console:
   https://your-public-url/message

✓ Ready to receive WhatsApp messages!
`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('💤 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('💤 SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});
