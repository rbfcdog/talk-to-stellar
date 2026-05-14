import express from 'express';
import cors from 'cors';
import actionsRouter from './api/routes/actions.router';
import { supabase } from './config/supabase';
import { AgentRepository } from './repositories/agent.repository';
import { createAgentRoutes } from './agent/routes';
import { logger } from './utils/logger';
import { runMigrations } from './utils/migrate';
import externalRouter from './api/routes/external.router';
import passkeyRouter from './api/routes/passkey.router';
import securityRouter from './api/routes/security.router';
import financialRouter from './api/routes/financial.router';
import rampRouter from './api/routes/ramp.router';
import { idempotencyMiddleware } from './services/idempotency.service';
import { DailySummaryService } from './api/services/daily-summary.service';

const app = express();

// Run migrations on startup
runMigrations(supabase).catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to run migrations: ${errorMessage}`);
});

app.use(cors());
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(idempotencyMiddleware);

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

// Register external provider routes (e.g., telegram)
app.use('/api/external', externalRouter);
app.use('/api/passkeys', passkeyRouter);

// Register security routes (PIN reset, etc)
app.use('/api/security', securityRouter);
app.use('/api/financial', financialRouter);
app.use('/api/ramp', rampRouter);

// Start background summary scheduler (idempotent per process).
DailySummaryService.startScheduler();

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
