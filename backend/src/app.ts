import express from 'express';
import cors, { CorsOptions } from 'cors';
import actionsRouter from './api/routes/actions.router';
import twilioRouter from './agent_webhook/routes/twilio.router';

const app = express();

const corsOptions: CorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['*'],
  allowedHeaders: ['*'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/actions', actionsRouter);

// Twilio WhatsApp webhook endpoint
app.use('/agent-webhook', twilioRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

export default app;