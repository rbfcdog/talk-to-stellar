import express from 'express';
import cors from 'cors';
import config from './config';
import webhookRouter from './routes/webhook.router';

const app = express();

// CORS configuration
const corsOptions = {
  origin: '*',
  credentials: false,
  methods: ['*'],
  allowedHeaders: ['*'],
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check root endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Twilio Webhook Service',
    timestamp: new Date().toISOString(),
    config: {
      agentApiUrl: config.agentApiUrl,
      backendApiUrl: config.backendApiUrl,
      port: config.port,
      environment: config.nodeEnv,
    },
  });
});

// Webhook routes
app.use('/', webhookRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

export default app;
