import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
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
import bridgeRouter from './api/routes/bridge.router';
import quotesRouter from './api/routes/quotes.router';
import earlyAccessRouter from './api/routes/early-access.router';
import internationalTransfersRouter from './api/routes/international-transfers.router';
import webhooksRouter from './api/routes/webhooks.router';
import { opsRouter } from './api/routes/ops.router';
import stellarWalletsRouter from './api/routes/stellar-wallets.router';
import sep24Router from './api/routes/sep24.router';
import walletAuthRouter from './api/routes/wallet-auth.router';
import paymentLinksRouter from './api/routes/payment-links.router';
import fraudScreeningRouter from './api/routes/fraud-screening.router';
import defindexRouter from './api/routes/defindex.router';
import passkeyWalletsRouter from './api/routes/passkey-wallets.router';
import paymentWatcherRouter from './api/routes/payment-watcher.router';
import soroswapRouter from './api/routes/soroswap.router';
import reflectorRouter from './api/routes/reflector.router';
import cctpRouter from './api/routes/cctp.router';
import aquariusRouter from './api/routes/aquarius.router';
import stellarNetworkRouter from './api/routes/stellar-network.router';
import ecosystemRouter from './api/routes/ecosystem.router';
import abroadFinanceRouter from './api/routes/abroad-finance.router';
import blendRouter from './api/routes/blend.router';
import stellarBrokerRouter from './api/routes/stellar-broker.router';
import allbridgeRouter from './api/routes/allbridge.router';
import axelarRouter from './api/routes/axelar.router';
import nearIntentsRouter from './api/routes/near-intents.router';
import scfRouter from './api/routes/scf.router';
import autoYieldRouter from './api/routes/auto-yield.router';
import { startAutoYieldScheduler } from './integrations/auto-yield/service';
import { paymentWatcher } from './integrations/payment-watcher/service';
import { idempotencyMiddleware } from './api/services/core/idempotency.service';
import { DailySummaryService } from './api/services/daily-summary.service';
import { FxRateAlertService } from './api/services/fx-rate-alert.service';
import { startPositionSnapshotScheduler } from './api/services/position-snapshot.service';
import { EvolutionService } from './api/services/evolution.service';
import { initBridgeService } from './integrations/bridge';
import { initPagfinanceService } from './integrations/pagfinance';
import {
  buildCorsOptions,
  globalRateLimit,
  isOpsBrowserRoutePath,
  securityHeaders,
  sensitiveRateLimit,
} from './api/middlewares/security.middleware';
import { publicErrorPayload } from './utils/public-error';
import { renderOpsLoginPage } from './api/views/ops-dashboard.view';
import { isProductionLikeEnvironment } from './config/runtime';

const app = express();

app.set('trust proxy', 1);

logger.info('Database schema is managed by backend/migrations/20260613_00_full_schema.sql.');

const corsOptions = buildCorsOptions();

app.use(securityHeaders);
function corsUnlessOpsBrowserRoute(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (isOpsBrowserRoutePath(req.path || req.originalUrl || req.url)) {
    next();
    return;
  }
  cors(corsOptions)(req, res, next);
}

app.use(corsUnlessOpsBrowserRoute);
app.options('*', corsUnlessOpsBrowserRoute);
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
app.use('/api/bridge', bridgeRouter);
app.use('/api/stellar', stellarWalletsRouter);
app.use('/api/sep24', sep24Router);
app.use('/api/wallet-auth', walletAuthRouter);
app.use('/api/pay-links', paymentLinksRouter);
app.use('/api/fraud-screen', fraudScreeningRouter);
app.use('/api/defindex', defindexRouter);
app.use('/api/passkey-wallets', passkeyWalletsRouter);
app.use('/api/payment-watcher', paymentWatcherRouter);
app.use('/api/swap', soroswapRouter);
app.use('/api/oracle', reflectorRouter);
app.use('/api/cctp', cctpRouter);
app.use('/api/aquarius', aquariusRouter);
app.use('/api/network', stellarNetworkRouter);
app.use('/api/ecosystem', ecosystemRouter);
app.use('/api/abroad', abroadFinanceRouter);
app.use('/api/blend', blendRouter);
app.use('/api/broker', stellarBrokerRouter);
app.use('/api/allbridge', allbridgeRouter);
app.use('/api/axelar', axelarRouter);
app.use('/api/near-intents', nearIntentsRouter);
app.use('/api/scf', scfRouter);
app.use('/api/auto-yield', autoYieldRouter);
app.use('/webhooks', webhooksRouter);
app.use('/', opsRouter);  // /ops dashboard + /api/transfers JSON API

// Start background summary scheduler (idempotent per process).
DailySummaryService.startScheduler();
FxRateAlertService.startScheduler();
startAutoYieldScheduler();
startPositionSnapshotScheduler();

logger.info(`[evolution-startup] Evolution services starting. base_url=${process.env.EVOLUTION_API_URL || '?'} instance=${process.env.EVOLUTION_INSTANCE || '?'} public_backend=${process.env.PUBLIC_BACKEND_URL || '?'} agent_url=${process.env.EVOLUTION_AGENT_URL || 'default'} webhook_sync=${process.env.EVOLUTION_WEBHOOK_SYNC_PROCESSING || 'false'}`);
EvolutionService.startWebhookAutoConfiguration();
EvolutionService.startInboundWebhookWorker();
EvolutionService.startOutboundDeliveryWorker();
initBridgeService();
initPagfinanceService();
paymentWatcher.start().catch((err: any) => {
  logger.warn(`[payment-watcher] Could not start: ${err.message}`);
});
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

  const route = String(req.originalUrl || req.url || '').split('?')[0];
  if (route === '/ops/login' && !res.headersSent) {
    const csrfToken = crypto.randomBytes(32).toString('base64url');
    const environment = String(process.env.STELLAR_NETWORK || process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet').toLowerCase();
    res.cookie('tts_ops_csrf', csrfToken, {
      httpOnly: true,
      secure: isProductionLikeEnvironment(),
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/ops',
    });
    res.status(statusCode).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderOpsLoginPage({
      title: 'Ops login',
      environment: environment === 'mainnet' || environment === 'public' ? 'MAINNET' : 'TESTNET',
      csrfToken,
      returnTo: '/ops',
      error: 'Could not open the transfers console. Try again in a few seconds.',
    }));
    return;
  }

  res.status(statusCode).json({
    ...payload,
    error: payload.message,
    status: statusCode,
  });
});

export default app;
