import express from 'express';
import cors from 'cors';
import actionsRouter from './api/routes/actions.router';
import { supabase } from './config/supabase';
import { AgentRepository } from './api/repository/core/agent.repository';
import { createAgentRoutes } from './api/agent/routes';
import { logger } from './utils/logger';
import { runMigrations } from './utils/migrate';
import externalRouter from './api/routes/external.router';
import passkeyRouter from './api/routes/passkey.router';
import securityRouter from './api/routes/security.router';
import financialRouter from './api/routes/financial.router';
import rampRouter from './api/routes/ramp.router';
import evolutionRouter from './api/routes/evolution.router';
import quotesRouter from './api/routes/quotes.router';
import internationalTransfersRouter from './api/routes/international-transfers.router';
import webhooksRouter from './api/routes/webhooks.router';
import { idempotencyMiddleware } from './api/services/core/idempotency.service';
import { DailySummaryService } from './api/services/daily-summary.service';
import { FxRateAlertService } from './api/services/fx-rate-alert.service';
import {
  buildCorsOptions,
  globalRateLimit,
  securityHeaders,
  sensitiveRateLimit,
} from './api/middlewares/security.middleware';
import { readBooleanEnv } from './config/runtime';
import { publicErrorPayload } from './utils/public-error';

const app = express();

app.set('trust proxy', 1);

// Legacy startup migrations used exec_sql and disabled RLS. Keep them opt-in only.
if (readBooleanEnv(process.env.RUN_LEGACY_STARTUP_MIGRATIONS)) {
  runMigrations(supabase).catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to run migrations: ${errorMessage}`);
  });
} else {
  logger.info('Legacy startup migrations disabled. Run database migrations explicitly from a trusted admin context.');
}

const corsOptions = buildCorsOptions();

app.use(securityHeaders);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(globalRateLimit);
app.use(['/api/passkeys', '/api/security', '/api/external/recovery', '/api/external/link-existing'], sensitiveRateLimit);
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
app.use('/api/quotes', quotesRouter);
app.use('/api/transfers', internationalTransfersRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/evolution', evolutionRouter);
app.use('/webhook/evolution', evolutionRouter);
app.use('/webhooks', webhooksRouter);

// Start background summary scheduler (idempotent per process).
DailySummaryService.startScheduler();
FxRateAlertService.startScheduler();

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : String(err);
  const statusCode = err.statusCode || err.status || 500;
  const payload = publicErrorPayload(err, { includeSupportCode: true });
  
  logger.error(`Unhandled error ${payload.support_code}: ${errorMessage}`);
  
  res.status(statusCode).json({
    ...payload,
    error: payload.message,
    status: statusCode,
  });
});

export default app;
