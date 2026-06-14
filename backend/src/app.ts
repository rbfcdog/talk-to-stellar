import express from 'express';
import cors from 'cors';
import actionsRouter from './api/routes/actions.router';
import { supabase } from './config/supabase';
import { AgentRepository } from './api/repository/core/agent.repository';
import { createAgentRoutes } from './api/agent/routes';
import { logger } from './utils/logger';
import externalRouter from './api/routes/external.router';
import authRouter from './api/routes/auth.router';
import passkeyRouter from './api/routes/passkey.router';
import securityRouter from './api/routes/security.router';
import financialRouter from './api/routes/financial.router';
import rampRouter from './api/routes/ramp.router';
import evolutionRouter from './api/routes/evolution.router';
import bridgeWebhookRouter from './api/routes/bridge-webhook.router';
import quotesRouter from './api/routes/quotes.router';
import earlyAccessRouter from './api/routes/early-access.router';
import internationalTransfersRouter from './api/routes/international-transfers.router';
import webhooksRouter from './api/routes/webhooks.router';
import { opsRouter } from './api/routes/ops.router';
import { idempotencyMiddleware } from './api/services/core/idempotency.service';
import { DailySummaryService } from './api/services/daily-summary.service';
import { FxRateAlertService } from './api/services/fx-rate-alert.service';
import { EvolutionService } from './api/services/evolution.service';
import { initBridgeService } from './integrations/bridge';
import {
  buildCorsOptions,
  globalRateLimit,
  securityHeaders,
  sensitiveRateLimit,
} from './api/middlewares/security.middleware';
import { publicErrorPayload } from './utils/public-error';

const app = express();

app.set('trust proxy', 1);

logger.info('Database schema is managed by backend/migrations/20260613_00_full_schema.sql.');

const corsOptions = buildCorsOptions();

app.use(securityHeaders);
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(globalRateLimit);
app.use(['/api/passkeys', '/api/security', '/api/external/recovery', '/api/external/link-existing', '/api/auth', '/api/early-access'], sensitiveRateLimit);
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
app.use('/api/auth', authRouter);
app.use('/api/passkeys', passkeyRouter);

// Register security routes (PIN reset, etc)
app.use('/api/security', securityRouter);
app.use('/api/financial', financialRouter);
app.use('/api/ramp', rampRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/early-access', earlyAccessRouter);
app.use('/api/transfers', internationalTransfersRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/evolution', evolutionRouter);
app.use('/webhook/evolution', evolutionRouter);
app.use('/webhook/bridge', bridgeWebhookRouter);
app.use('/webhooks', webhooksRouter);
app.use('/', opsRouter);  // /ops dashboard + /api/transfers JSON API

// Start background summary scheduler (idempotent per process).
DailySummaryService.startScheduler();
FxRateAlertService.startScheduler();

logger.info(`[evolution-startup] Evolution services starting. base_url=${process.env.EVOLUTION_API_URL || '?'} instance=${process.env.EVOLUTION_INSTANCE || '?'} public_backend=${process.env.PUBLIC_BACKEND_URL || '?'} agent_url=${process.env.EVOLUTION_AGENT_URL || 'default'} webhook_sync=${process.env.EVOLUTION_WEBHOOK_SYNC_PROCESSING || 'false'}`);
EvolutionService.startWebhookAutoConfiguration();
EvolutionService.startInboundWebhookWorker();
EvolutionService.startOutboundDeliveryWorker();
initBridgeService();
logger.info('[evolution-startup] Evolution services registered (auto-config, inbound worker, outbound worker)');

// Start Stellar settlement watcher (lazy — won't crash if transfers table doesn't exist yet)
import('./orchestration/stellarWatcher').then(({ stellarWatcher }) => {
  stellarWatcher.start();
  logger.info('[stellar-watcher] Stellar settlement watcher started');
}).catch((err: any) => {
  logger.warn(`[stellar-watcher] Could not start: ${err.message}`);
});

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
