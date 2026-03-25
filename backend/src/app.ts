import express from 'express';
import cors, { CorsOptions } from 'cors';
import actionsRouter from './api/routes/actions.router';
import { supabase } from './config/supabase';
import { AgentRepository } from './repositories/agent.repository';
import { createAgentRoutes } from './agent/routes';
import { logger } from './utils/logger';
import { runMigrations } from './utils/migrate';

const app = express();

// Run migrations on startup
runMigrations(supabase).catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to run migrations: ${errorMessage}`);
});

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

// Initialize agent repository with Supabase
const agentRepository = new AgentRepository(supabase);
const openaiApiKey = process.env.OPENAI_API_KEY || '';

if (!openaiApiKey) {
  logger.warn('OPENAI_API_KEY not set - agent functionality will be limited');
}

// Register agent routes
const agentRoutes = createAgentRoutes(agentRepository, openaiApiKey);
app.use('/api/agent', agentRoutes);

// Register existing action routes
app.use('/api/actions', actionsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const statusCode = err.statusCode || err.status || 500;
  
  logger.error(`Unhandled error: ${errorMessage}`);
  
  res.status(statusCode).json({
    error: errorMessage || 'Internal Server Error',
    status: statusCode,
  });
});

export default app;